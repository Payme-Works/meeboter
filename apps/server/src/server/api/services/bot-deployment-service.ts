import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";
import type { BotPoolService } from "./bot-pool-service";
import { CoolifyDeploymentError } from "./coolify-service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Custom error for bot deployment failures
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
 * Service for orchestrating bot deployments
 *
 * Handles the high-level deployment flow: decides between local dev
 * or production pool deployment, coordinates with BotPoolService,
 * and manages bot status updates.
 */
export class BotDeploymentService {
	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly pool: BotPoolService,
	) {}

	/**
	 * Deploys a bot either locally (development) or via bot pool (production)
	 *
	 * @param botId - The ID of the bot to deploy
	 * @param queueTimeoutMs - How long to wait in queue if pool is exhausted
	 * @returns The updated bot record and queue info if queued
	 */
	async deploy(
		botId: number,
		queueTimeoutMs: number = 5 * 60 * 1000,
	): Promise<DeployBotResult> {
		const botResult = await this.db
			.select()
			.from(botsTable)
			.where(eq(botsTable.id, botId));

		if (!botResult[0]) {
			throw new BotDeploymentError("Bot not found");
		}

		const bot = botResult[0];
		const isDev = env.NODE_ENV === "development";

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

		if (isDev) {
			return await this.deployLocally(botId, config);
		}

		return await this.deployViaPool(botId, config, queueTimeoutMs);
	}

	/**
	 * Releases a bot's pool slot and processes any queued bots
	 */
	async release(botId: number): Promise<void> {
		await this.pool.releaseSlot(botId);
		await this.pool.processQueueOnSlotRelease();
	}

	/**
	 * Determines whether a bot should be deployed immediately based on its start time
	 */
	shouldDeployImmediately(startTime: Date | undefined | null): boolean {
		if (!startTime) {
			return true;
		}

		const now = new Date();
		const deploymentBuffer = 5 * 60 * 1000; // 5 minutes

		return startTime.getTime() - now.getTime() <= deploymentBuffer;
	}

	/**
	 * Deploys a bot locally for development
	 */
	private async deployLocally(
		botId: number,
		config: BotConfig,
	): Promise<DeployBotResult> {
		await this.db
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

		const result = await this.db
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

	/**
	 * Deploys a bot via the production pool
	 */
	private async deployViaPool(
		botId: number,
		config: BotConfig,
		queueTimeoutMs: number,
	): Promise<DeployBotResult> {
		try {
			const slot = await this.pool.acquireOrCreateSlot(botId);

			if (slot) {
				await this.db
					.update(botsTable)
					.set({ status: "DEPLOYING" })
					.where(eq(botsTable.id, botId));

				const activeSlot = await this.pool.configureAndStartSlot(slot, config);

				const result = await this.db
					.update(botsTable)
					.set({
						status: "JOINING_CALL",
						coolifyServiceUuid: activeSlot.coolifyServiceUuid,
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

				console.log(
					`Bot ${botId} deployed to pool slot ${activeSlot.slotName}`,
				);

				return { bot: deployedBot, queued: false };
			}

			// No slot available, add to queue
			console.log(`Bot ${botId} added to queue (pool exhausted)`);

			const queuePosition = await this.pool.addToQueue(
				botId,
				queueTimeoutMs,
				100,
			);

			const estimatedWaitMs = this.pool.getEstimatedWaitMs(queuePosition);

			const queuedBot = await this.db
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
			const errorMessage = this.getErrorMessage(error);

			await this.db
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
	 * Extracts error message from various error types
	 */
	private getErrorMessage(error: unknown): string {
		if (error instanceof CoolifyDeploymentError) return error.message;

		if (error instanceof Error) return error.message;

		return "Unknown error";
	}
}
