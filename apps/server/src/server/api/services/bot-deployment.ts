import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";
import {
	CoolifyDeploymentError,
	createCoolifyApplication,
	selectBotImage,
} from "./coolify-deployment";

/**
 * Get the directory path using import.meta.url for ES modules
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom error implementation for bot deployment failures
 */
export class BotDeploymentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BotDeploymentError";
	}
}

/**
 * Deploys a bot either locally (development) or via Coolify API (production)
 *
 * @param params - Deployment parameters
 * @param params.botId - The ID of the bot to deploy
 * @param params.db - The database instance for bot operations
 * @returns The updated bot record after successful deployment
 * @throws BotDeploymentError if deployment fails
 */
export async function deployBot({
	botId,
	db,
}: {
	botId: number;
	db: PostgresJsDatabase<typeof schema>;
}) {
	const botResult = await db
		.select()
		.from(botsTable)
		.where(eq(botsTable.id, botId));

	if (!botResult[0]) {
		throw new BotDeploymentError("Bot not found");
	}

	const bot = botResult[0];
	const dev = env.NODE_ENV === "development";

	// First, update bot status to deploying
	await db
		.update(botsTable)
		.set({ status: "DEPLOYING" })
		.where(eq(botsTable.id, botId));

	try {
		// Get the absolute path to the bots directory (parent directory)
		const botsDir = path.resolve(__dirname, "../../../../../bots");

		// Build bot configuration from database record
		const config: BotConfig = {
			id: botId,
			userId: bot.userId,
			meetingTitle: bot.meetingTitle,
			meetingInfo: bot.meetingInfo,
			startTime: bot.startTime,
			endTime: bot.endTime,
			botDisplayName: bot.botDisplayName,
			botImage: bot.botImage ?? undefined,
			recordingEnabled: bot.recordingEnabled,
			heartbeatInterval: bot.heartbeatInterval,
			chatEnabled: bot.chatEnabled,
			automaticLeave: bot.automaticLeave,
			callbackUrl: bot.callbackUrl ?? undefined,
		};

		if (dev) {
			// Spawn the bot process for local development
			const botProcess = spawn("pnpm", ["start"], {
				cwd: botsDir,
				env: {
					...process.env,
					BOT_DATA: JSON.stringify(config),
					BOT_AUTH_TOKEN: process.env.BOT_AUTH_TOKEN,
				},
			});

			// Log output for debugging
			botProcess.stdout.on("data", (data) => {
				console.log(`Bot ${botId} stdout: ${data}`);
			});

			botProcess.stderr.on("data", (data) => {
				console.error(`Bot ${botId} stderr: ${data}`);
			});

			botProcess.on("error", (error) => {
				console.error(`Bot ${botId} process error:`, error);
			});
		} else {
			// Deploy bot via Coolify API for production
			const image = selectBotImage(bot.meetingInfo);

			const coolifyServiceUuid = await createCoolifyApplication(
				botId,
				image,
				config,
			);

			// Store the Coolify service UUID for cleanup later
			await db
				.update(botsTable)
				.set({ coolifyServiceUuid })
				.where(eq(botsTable.id, botId));

			console.log(
				`Bot ${botId} deployed to Coolify with service UUID: ${coolifyServiceUuid}`,
			);
		}

		// Update status to joining call after successful deployment
		const result = await db
			.update(botsTable)
			.set({
				status: "JOINING_CALL",
				deploymentError: null,
			})
			.where(eq(botsTable.id, botId))
			.returning();

		if (!result[0]) {
			throw new BotDeploymentError("Bot not found");
		}

		return result[0];
	} catch (error) {
		// Update status to fatal and store error message
		const errorMessage =
			error instanceof CoolifyDeploymentError
				? error.message
				: error instanceof Error
					? error.message
					: "Unknown error";

		await db
			.update(botsTable)
			.set({
				status: "FATAL",
				deploymentError: errorMessage,
			})
			.where(eq(botsTable.id, botId));

		throw error;
	}
}

/**
 * Determines whether a bot should be deployed immediately based on its start time
 *
 * @param startTime - The scheduled start time for the bot meeting
 * @returns True if the bot should be deployed immediately, false if it should wait
 */
export async function shouldDeployImmediately(
	startTime: Date | undefined | null,
): Promise<boolean> {
	if (!startTime) {
		return true;
	}

	const now = new Date();
	const deploymentBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds

	return startTime.getTime() - now.getTime() <= deploymentBuffer;
}

// Re-export for backward compatibility
export { CoolifyDeploymentError, selectBotImage } from "./coolify-deployment";
