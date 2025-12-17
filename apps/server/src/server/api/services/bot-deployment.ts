import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";
import {
	acquireOrCreateSlot,
	configureAndStartSlot,
	releaseSlot,
} from "./bot-pool-manager";
import {
	addToQueue,
	getEstimatedWaitMs,
	processQueueOnSlotRelease,
} from "./bot-pool-queue";
import { CoolifyDeploymentError } from "./coolify-deployment";

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
 * Result of deploying a bot through the pool
 */
export interface DeployBotResult {
	bot: typeof botsTable.$inferSelect;
	queued: boolean;
	queuePosition?: number;
	estimatedWaitMs?: number;
}

/**
 * Deploys a bot either locally (development) or via bot pool (production)
 *
 * @param params - Deployment parameters
 * @param params.botId - The ID of the bot to deploy
 * @param params.db - The database instance for bot operations
 * @param params.queueTimeoutMs - How long to wait in queue if pool is exhausted
 * @returns The updated bot record and queue info if queued
 * @throws BotDeploymentError if deployment fails
 */
export async function deployBot({
	botId,
	db,
	queueTimeoutMs = 5 * 60 * 1000,
}: {
	botId: number;
	db: PostgresJsDatabase<typeof schema>;
	queueTimeoutMs?: number;
}): Promise<DeployBotResult> {
	const botResult = await db
		.select()
		.from(botsTable)
		.where(eq(botsTable.id, botId));

	if (!botResult[0]) {
		throw new BotDeploymentError("Bot not found");
	}

	const bot = botResult[0];
	const dev = env.NODE_ENV === "development";

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
		// Local development: spawn bot process directly
		await db
			.update(botsTable)
			.set({ status: "DEPLOYING" })
			.where(eq(botsTable.id, botId));

		const botsDir = path.resolve(__dirname, "../../../../../bots");

		const botProcess = spawn("pnpm", ["start"], {
			cwd: botsDir,
			env: {
				...process.env,
				BOT_DATA: JSON.stringify(config),
				BOT_AUTH_TOKEN: process.env.BOT_AUTH_TOKEN,
			},
		});

		botProcess.stdout.on("data", (data) => {
			console.log(`Bot ${botId} stdout: ${data}`);
		});

		botProcess.stderr.on("data", (data) => {
			console.error(`Bot ${botId} stderr: ${data}`);
		});

		botProcess.on("error", (error) => {
			console.error(`Bot ${botId} process error:`, error);
		});

		const result = await db
			.update(botsTable)
			.set({ status: "JOINING_CALL", deploymentError: null })
			.where(eq(botsTable.id, botId))
			.returning();

		const updatedBot = result[0];

		if (!updatedBot) {
			throw new BotDeploymentError("Failed to update bot status");
		}

		return { bot: updatedBot, queued: false };
	}

	// Production: use bot pool
	try {
		// Try to acquire a slot from the pool
		const slot = await acquireOrCreateSlot(botId, db);

		if (slot) {
			// Got a slot! Update status and configure it
			await db
				.update(botsTable)
				.set({ status: "DEPLOYING" })
				.where(eq(botsTable.id, botId));

			// Configure and start the slot with bot config
			await configureAndStartSlot(slot, config, db);

			// Update bot with slot info and status
			const result = await db
				.update(botsTable)
				.set({
					status: "JOINING_CALL",
					coolifyServiceUuid: slot.coolifyServiceUuid,
					deploymentError: null,
				})
				.where(eq(botsTable.id, botId))
				.returning();

			const deployedBot = result[0];

			if (!deployedBot) {
				throw new BotDeploymentError(
					"Failed to update bot status after deployment",
				);
			}

			console.log(`Bot ${botId} deployed to pool slot ${slot.slotName}`);

			return { bot: deployedBot, queued: false };
		}

		// No slot available - add to queue
		console.log(`Bot ${botId} added to queue (pool exhausted)`);
		const queuePosition = await addToQueue(botId, queueTimeoutMs, 100, db);
		const estimatedWaitMs = await getEstimatedWaitMs(queuePosition);

		// Get updated bot record
		const queuedBot = await db
			.select()
			.from(botsTable)
			.where(eq(botsTable.id, botId));

		const botRecord = queuedBot[0];

		if (!botRecord) {
			throw new BotDeploymentError("Failed to retrieve queued bot record");
		}

		return {
			bot: botRecord,
			queued: true,
			queuePosition,
			estimatedWaitMs,
		};
	} catch (error) {
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
 * Releases a bot's pool slot and processes any queued bots
 *
 * @param botId - The bot ID to release
 * @param db - Database instance
 */
export async function releaseBotSlot(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	await releaseSlot(botId, db);
	await processQueueOnSlotRelease(db);
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

export { getPoolStats } from "./bot-pool-manager";
export { getQueueStats } from "./bot-pool-queue";
// Re-export for backward compatibility
export { CoolifyDeploymentError, selectBotImage } from "./coolify-deployment";
