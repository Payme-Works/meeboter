import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";
import type { HybridPlatformService } from "./platform";

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
	platform?: string;
}

/**
 * Service for orchestrating bot deployments
 *
 * Handles the high-level deployment flow using HybridPlatformService
 * to coordinate across multiple deployment platforms.
 */
export class BotDeploymentService {
	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly hybridPlatform: HybridPlatformService,
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
		await this.hybridPlatform.releaseBot(botId);
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
	 * Deploys a bot via the hybrid platform service
	 *
	 * HybridPlatformService throws HybridDeployError on failure,
	 * so we catch it here and set the bot status to FATAL
	 */
	private async deployViaPlatform(
		botId: number,
		config: BotConfig,
		_queueTimeoutMs: number,
	): Promise<DeployBotResult> {
		try {
			// Set status to DEPLOYING before starting deployment
			await this.db
				.update(botsTable)
				.set({ status: "DEPLOYING" })
				.where(eq(botsTable.id, botId));

			// Deploy via the hybrid platform service (throws on failure)
			const deployResult = await this.hybridPlatform.deployBot(config);

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

			// Deployed successfully
			// Platform info (deploymentPlatform, platformIdentifier) is already
			// updated by HybridPlatformService.deployBot() before returning
			// Status stays as DEPLOYING, the bot itself will update to JOINING_CALL
			// when it actually starts attempting to join the meeting

			const deployedBot = await this.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, botId))
				.then((rows) => rows[0]);

			if (!deployedBot) {
				throw new BotDeploymentError("Failed to retrieve deployed bot record");
			}

			const slotLabel = deployResult.slotName
				? ` (slot: ${deployResult.slotName})`
				: "";

			const identifierLabel = deployResult.platformIdentifier
				? ` [${deployResult.platformIdentifier}]`
				: "";

			console.log(
				`[BotDeploymentService] Bot ${botId} deployed via ${deployResult.platform}${identifierLabel}${slotLabel}`,
			);

			return {
				bot: deployedBot,
				queued: false,
				platform: deployResult.platform,
			};
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
