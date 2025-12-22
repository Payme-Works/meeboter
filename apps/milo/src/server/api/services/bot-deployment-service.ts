import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";
import type { PlatformService } from "./platform";

/**
 * Custom error for bot deployment failures
 */
class BotDeploymentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "BotDeploymentError";
	}
}

/**
 * Result of deploying a bot through the pool
 */
interface DeployBotResult {
	bot: typeof botsTable.$inferSelect;
	queued: boolean;
	queuePosition?: number;
	estimatedWaitMs?: number;
}

/**
 * Service for orchestrating bot deployments
 *
 * Handles the high-level deployment flow: decides between local dev
 * or production platform deployment, coordinates with PlatformService,
 * and manages bot status updates.
 */
export class BotDeploymentService {
	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly platform: PlatformService,
	) {}

	/**
	 * Deploys a bot via the configured platform service (local, Coolify, or AWS)
	 *
	 * @param botId - The ID of the bot to deploy
	 * @param queueTimeoutMs - How long to wait in queue if resources exhausted (Coolify only)
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

		const config: BotConfig = {
			id: botId,
			userId: bot.userId,
			meeting: bot.meeting,
			startTime: bot.startTime,
			endTime: bot.endTime,
			displayName: bot.displayName,
			imageUrl: bot.imageUrl ?? undefined,
			recordingEnabled: bot.recordingEnabled,
			automaticLeave: bot.automaticLeave,
			callbackUrl: bot.callbackUrl ?? undefined,
		};

		return await this.deployViaPlatform(botId, config, queueTimeoutMs);
	}

	/**
	 * Releases a bot's platform resources and processes any queued bots
	 */
	async release(botId: number): Promise<void> {
		await this.platform.releaseBot(botId);
		await this.platform.processQueue();
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
	 * Deploys a bot via the configured platform (local, Coolify, or AWS)
	 */
	private async deployViaPlatform(
		botId: number,
		config: BotConfig,
		queueTimeoutMs: number,
	): Promise<DeployBotResult> {
		try {
			// Set status to DEPLOYING before starting deployment
			await this.db
				.update(botsTable)
				.set({ status: "DEPLOYING" })
				.where(eq(botsTable.id, botId));

			// Deploy via the platform service
			const deployResult = await this.platform.deployBot(
				config,
				queueTimeoutMs,
			);

			if (!deployResult.success) {
				throw new BotDeploymentError(
					deployResult.error ?? "Platform deployment failed",
				);
			}

			// If queued, return queue info (bot remains in DEPLOYING status)
			if (deployResult.queued) {
				const queuedBot = await this.db
					.select()
					.from(botsTable)
					.where(eq(botsTable.id, botId));

				const botRecord = queuedBot[0];

				if (!botRecord) {
					throw new BotDeploymentError("Failed to retrieve queued bot record");
				}

				console.log(
					`[BotDeploymentService] Bot ${botId} queued at position ${deployResult.queuePosition}`,
				);

				return {
					bot: botRecord,
					queued: true,
					queuePosition: deployResult.queuePosition,
					estimatedWaitMs: deployResult.estimatedWaitMs,
				};
			}

			// Deployed successfully, update platform info and clear any previous deployment error
			// Status stays as DEPLOYING, the bot itself will update to JOINING_CALL
			// when it actually starts attempting to join the meeting
			const result = await this.db
				.update(botsTable)
				.set({
					deploymentPlatform: this.platform.platformName,
					platformIdentifier: deployResult.identifier ?? null,
				})
				.where(eq(botsTable.id, botId))
				.returning();

			const deployedBot = result[0];

			if (!deployedBot) {
				throw new BotDeploymentError(
					"Failed to update bot after platform deployment",
				);
			}

			const slotInfo = deployResult.slotName
				? ` (slot: ${deployResult.slotName})`
				: "";

			console.log(
				`[BotDeploymentService] Bot ${botId} deployed via ${this.platform.platformName}${slotInfo}`,
			);

			return { bot: deployedBot, queued: false };
		} catch (error) {
			await this.db
				.update(botsTable)
				.set({
					status: "FATAL",
				})
				.where(eq(botsTable.id, botId));

			throw error;
		}
	}
}
