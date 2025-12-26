import { and, count, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import {
	type BotConfig,
	botsTable,
	deploymentQueueTable,
} from "@/server/database/schema";
import { parsePlatformPriority } from "@/utils/platform";
import type { PlatformDeployResult, PlatformService } from "./platform-service";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DeploymentPlatform = "k8s" | "aws" | "coolify";

/** Active bot statuses that count against capacity */
const ACTIVE_BOT_STATUSES = [
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"LEAVING",
] as const;

interface PlatformCapacity {
	platform: DeploymentPlatform;
	used: number;
	limit: number;
	queueTimeout: number;
	isEnabled: boolean;
}

/**
 * Result of a successful hybrid deployment
 */
interface HybridDeployResult {
	platform?: DeploymentPlatform;
	platformIdentifier?: string;
	slotName?: string;
	queued?: boolean;
	queuePosition?: number;
	estimatedWaitMs?: number;
}

interface QueuedBot {
	id: number;
	botId: number;
	botName: string | null;
	meetingPlatform: string;
	queuedAt: Date;
	timeoutAt: Date;
	position: number;
}

interface PlatformConfig {
	limit: number;
	queueTimeout: number;
	service: PlatformService;
}

// ─── Hybrid Platform Service ────────────────────────────────────────────────

/**
 * Coordinates bot deployments across multiple platforms with priority-based failover
 *
 * Tries platforms in configured priority order, falling back to next platform on:
 * - Capacity exhaustion (platform at configured limit)
 * - Deployment failure (platform returns error)
 *
 * When all platforms are exhausted, bots are added to a global queue with timeout.
 */
export class HybridPlatformService {
	private readonly platforms: Map<DeploymentPlatform, PlatformConfig>;
	private readonly priorityOrder: DeploymentPlatform[];
	private readonly globalQueueTimeout: number;

	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		platformServices: {
			k8s?: PlatformService;
			aws?: PlatformService;
			coolify?: PlatformService;
		},
	) {
		this.platforms = new Map();
		this.priorityOrder = [];
		this.globalQueueTimeout = env.GLOBAL_QUEUE_TIMEOUT_MS ?? 600000;

		// Build platform configurations from env
		// During build phase, env vars are skipped and not transformed,
		// so PLATFORM_PRIORITY might be a raw string or undefined
		const platformPriority = parsePlatformPriority(env.PLATFORM_PRIORITY);

		for (const platformName of platformPriority) {
			if (platformName === "local") {
				console.warn(
					"[HybridPlatformService] 'local' platform is not allowed in PLATFORM_PRIORITY, skipping",
				);

				continue;
			}

			const platform = platformName as DeploymentPlatform;
			const limit = this.getPlatformLimit(platform);
			const queueTimeout = this.getPlatformQueueTimeout(platform);
			const service = platformServices[platform];

			if (!limit) {
				console.warn(
					`[HybridPlatformService] Platform '${platform}' has no limit configured, skipping`,
				);

				continue;
			}

			if (!service) {
				console.warn(
					`[HybridPlatformService] Platform '${platform}' service not available, skipping`,
				);

				continue;
			}

			this.platforms.set(platform, { limit, queueTimeout, service });
			this.priorityOrder.push(platform);
		}

		// During build phase, platforms might be configured but limits not available
		// Only throw error at runtime when env validation is actually performed
		const isBuildPhase =
			process.env.NEXT_PHASE === "phase-production-build" ||
			process.env.CI === "true";

		if (
			this.priorityOrder.length === 0 &&
			platformPriority.length > 0 &&
			!isBuildPhase
		) {
			throw new Error(
				"[HybridPlatformService] No valid platforms configured. " +
					"Ensure PLATFORM_PRIORITY contains valid platforms with limits set.",
			);
		}

		console.log(
			`[HybridPlatformService] Initialized with platforms: ${this.priorityOrder.join(", ")}`,
		);
	}

	// ─── Public Methods ───────────────────────────────────────────────────────

	/**
	 * Deploys a bot using the first available platform in priority order
	 *
	 * @throws HybridDeployError if all platforms fail and queuing fails
	 */
	async deployBot(botConfig: BotConfig): Promise<HybridDeployResult> {
		const attemptedPlatforms: DeploymentPlatform[] = [];

		// Try each platform in priority order
		for (const platform of this.priorityOrder) {
			const config = this.platforms.get(platform);

			if (!config) continue;

			// Check capacity
			const currentCount = await this.getActiveBotCount(platform);

			if (currentCount >= config.limit) {
				console.log(
					`[HybridPlatformService] Platform '${platform}' at capacity (${currentCount}/${config.limit}), trying next`,
				);

				continue;
			}

			attemptedPlatforms.push(platform);

			// Try to deploy
			const result = await this.tryDeployOnPlatform(
				platform,
				config.service,
				botConfig,
			);

			if (result) {
				// Defensive check: ensure identifier is present
				if (!result.identifier) {
					console.error(
						`[HybridPlatformService] Platform '${platform}' returned success but identifier is missing for bot ${botConfig.id}`,
						{ result },
					);

					// Treat as deployment failure, try next platform
					continue;
				}

				return {
					platform,
					platformIdentifier: result.identifier,
					slotName: result.slotName,
				};
			}
		}

		// All platforms exhausted, add to global queue
		return this.addToGlobalQueue(botConfig.id);
	}

	/**
	 * Stops a bot on its deployed platform
	 */
	async stopBot(botId: number): Promise<void> {
		const bot = await this.db
			.select({
				deploymentPlatform: botsTable.deploymentPlatform,
				platformIdentifier: botsTable.platformIdentifier,
			})
			.from(botsTable)
			.where(eq(botsTable.id, botId))
			.then((rows) => rows[0]);

		if (!bot?.deploymentPlatform || !bot?.platformIdentifier) {
			console.warn(
				`[HybridPlatformService] Bot ${botId} has no deployment info, skipping stop`,
			);

			return;
		}

		const platform = bot.deploymentPlatform as DeploymentPlatform;
		const config = this.platforms.get(platform);

		if (!config) {
			console.warn(
				`[HybridPlatformService] Platform '${platform}' not configured, cannot stop bot ${botId}`,
			);

			return;
		}

		await config.service.stopBot(bot.platformIdentifier);
	}

	/**
	 * Releases a bot and processes the global queue
	 */
	async releaseBot(botId: number): Promise<void> {
		const bot = await this.db
			.select({
				deploymentPlatform: botsTable.deploymentPlatform,
			})
			.from(botsTable)
			.where(eq(botsTable.id, botId))
			.then((rows) => rows[0]);

		if (bot?.deploymentPlatform) {
			const platform = bot.deploymentPlatform as DeploymentPlatform;
			const config = this.platforms.get(platform);

			if (config) {
				await config.service.releaseBot(botId);
			}
		}

		// Process global queue after release
		await this.processQueue();
	}

	/**
	 * Processes the global deployment queue
	 */
	async processQueue(): Promise<void> {
		// Clean up expired entries
		await this.db
			.update(deploymentQueueTable)
			.set({ status: "EXPIRED" })
			.where(
				and(
					eq(deploymentQueueTable.status, "WAITING"),
					lt(deploymentQueueTable.timeoutAt, new Date()),
				),
			);

		// Get next bot in queue
		const nextInQueue = await this.db
			.select()
			.from(deploymentQueueTable)
			.where(eq(deploymentQueueTable.status, "WAITING"))
			.orderBy(deploymentQueueTable.priority, deploymentQueueTable.queuedAt)
			.limit(1)
			.then((rows) => rows[0]);

		if (!nextInQueue) {
			return;
		}

		// Try to deploy on any available platform
		for (const platform of this.priorityOrder) {
			const config = this.platforms.get(platform);

			if (!config) continue;

			const currentCount = await this.getActiveBotCount(platform);

			if (currentCount >= config.limit) {
				continue;
			}

			// Mark as processing
			await this.db
				.update(deploymentQueueTable)
				.set({ status: "PROCESSING" })
				.where(eq(deploymentQueueTable.id, nextInQueue.id));

			// Get bot config
			const bot = await this.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, nextInQueue.botId))
				.then((rows) => rows[0]);

			if (!bot) {
				await this.db
					.delete(deploymentQueueTable)
					.where(eq(deploymentQueueTable.id, nextInQueue.id));

				continue;
			}

			const botConfig: BotConfig = {
				id: bot.id,
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

			const result = await this.tryDeployOnPlatform(
				platform,
				config.service,
				botConfig,
			);

			if (result) {
				// Defensive check: ensure identifier is present
				if (!result.identifier) {
					console.error(
						`[HybridPlatformService] Platform '${platform}' returned success but identifier is missing for queued bot ${bot.id}`,
						{ result },
					);

					// Treat as deployment failure, try next platform
					continue;
				}

				// Update bot with platform info
				await this.db
					.update(botsTable)
					.set({
						deploymentPlatform: platform,
						platformIdentifier: result.identifier,
					})
					.where(eq(botsTable.id, bot.id));

				// Remove from queue
				await this.db
					.delete(deploymentQueueTable)
					.where(eq(deploymentQueueTable.id, nextInQueue.id));

				console.log(
					`[HybridPlatformService] Deployed queued bot ${bot.id} on '${platform}' [${result.identifier}]`,
				);

				return;
			}
		}

		// Failed to deploy, put back in queue
		await this.db
			.update(deploymentQueueTable)
			.set({ status: "WAITING" })
			.where(eq(deploymentQueueTable.id, nextInQueue.id));
	}

	/**
	 * Gets capacity stats for all configured platforms
	 */
	async getCapacityStats(): Promise<PlatformCapacity[]> {
		const stats: PlatformCapacity[] = [];

		for (const platform of this.priorityOrder) {
			const config = this.platforms.get(platform);

			if (!config) continue;

			const used = await this.getActiveBotCount(platform);

			stats.push({
				platform,
				used,
				limit: config.limit,
				queueTimeout: config.queueTimeout,
				isEnabled: true,
			});
		}

		return stats;
	}

	/**
	 * Gets all bots currently in the global queue
	 */
	async getQueuedBots(): Promise<QueuedBot[]> {
		const queueEntries = await this.db
			.select({
				id: deploymentQueueTable.id,
				botId: deploymentQueueTable.botId,
				queuedAt: deploymentQueueTable.queuedAt,
				timeoutAt: deploymentQueueTable.timeoutAt,
				priority: deploymentQueueTable.priority,
				botName: botsTable.displayName,
				meetingPlatform: botsTable.meeting,
			})
			.from(deploymentQueueTable)
			.innerJoin(botsTable, eq(deploymentQueueTable.botId, botsTable.id))
			.where(eq(deploymentQueueTable.status, "WAITING"))
			.orderBy(deploymentQueueTable.priority, deploymentQueueTable.queuedAt);

		return queueEntries.map((entry, index) => ({
			id: entry.id,
			botId: entry.botId,
			botName: entry.botName,
			meetingPlatform: entry.meetingPlatform?.platform ?? "unknown",
			queuedAt: entry.queuedAt,
			timeoutAt: entry.timeoutAt,
			position: index + 1,
		}));
	}

	/**
	 * Gets queue statistics
	 */
	async getQueueStats(): Promise<{
		total: number;
		oldest: Date | null;
		avgWaitMs: number;
	}> {
		const queuedBots = await this.getQueuedBots();

		if (queuedBots.length === 0) {
			return { total: 0, oldest: null, avgWaitMs: 0 };
		}

		const now = new Date();

		const waitTimes = queuedBots.map(
			(bot) => now.getTime() - bot.queuedAt.getTime(),
		);

		const avgWaitMs = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;

		return {
			total: queuedBots.length,
			oldest: queuedBots[0]?.queuedAt ?? null,
			avgWaitMs,
		};
	}

	/**
	 * Gets the platform service for a specific platform
	 * Used for platform-specific operations (status checks, etc.)
	 */
	getPlatformService(
		platform: DeploymentPlatform,
	): PlatformService | undefined {
		return this.platforms.get(platform)?.service;
	}

	/**
	 * Gets all enabled platforms in priority order
	 */
	getEnabledPlatforms(): DeploymentPlatform[] {
		return [...this.priorityOrder];
	}

	// ─── Private Methods ──────────────────────────────────────────────────────

	private getPlatformLimit(platform: DeploymentPlatform): number | undefined {
		switch (platform) {
			case "k8s":
				return env.K8S_BOT_LIMIT;
			case "aws":
				return env.AWS_BOT_LIMIT;
			case "coolify":
				return env.COOLIFY_BOT_LIMIT;
		}
	}

	private getPlatformQueueTimeout(platform: DeploymentPlatform): number {
		switch (platform) {
			case "k8s":
				return env.K8S_QUEUE_TIMEOUT_MS;
			case "aws":
				return env.AWS_QUEUE_TIMEOUT_MS;
			case "coolify":
				return env.COOLIFY_QUEUE_TIMEOUT_MS;
		}
	}

	private async getActiveBotCount(
		platform: DeploymentPlatform,
	): Promise<number> {
		const result = await this.db
			.select({ count: count() })
			.from(botsTable)
			.where(
				and(
					eq(botsTable.deploymentPlatform, platform),
					inArray(botsTable.status, [...ACTIVE_BOT_STATUSES]),
				),
			);

		return result[0]?.count ?? 0;
	}

	/**
	 * Attempts to deploy on a specific platform
	 *
	 * @returns Deploy result on success, null on failure (allows fallback to next platform)
	 */
	private async tryDeployOnPlatform(
		platform: DeploymentPlatform,
		service: PlatformService,
		botConfig: BotConfig,
	): Promise<PlatformDeployResult | null> {
		try {
			const result = await service.deployBot(botConfig);

			console.log(
				`[HybridPlatformService] Successfully deployed bot ${botConfig.id} on '${platform}'`,
			);

			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";

			console.log(
				`[HybridPlatformService] Deployment failed on '${platform}': ${message}, trying next`,
			);

			return null;
		}
	}

	private async addToGlobalQueue(botId: number): Promise<HybridDeployResult> {
		const timeoutAt = new Date(Date.now() + this.globalQueueTimeout);

		// Check if already in queue
		const existing = await this.db
			.select()
			.from(deploymentQueueTable)
			.where(eq(deploymentQueueTable.botId, botId))
			.then((rows) => rows[0]);

		if (existing) {
			const position = await this.getQueuePosition(botId);

			return {
				queued: true,
				queuePosition: position,
				estimatedWaitMs: this.estimateWaitTime(position),
			};
		}

		// Add to queue
		await this.db.insert(deploymentQueueTable).values({
			botId,
			priority: 0,
			timeoutAt,
			status: "WAITING",
		});

		const position = await this.getQueuePosition(botId);

		console.log(
			`[HybridPlatformService] Bot ${botId} added to global queue at position ${position}`,
		);

		return {
			queued: true,
			queuePosition: position,
			estimatedWaitMs: this.estimateWaitTime(position),
		};
	}

	private async getQueuePosition(botId: number): Promise<number> {
		const queue = await this.db
			.select({ botId: deploymentQueueTable.botId })
			.from(deploymentQueueTable)
			.where(eq(deploymentQueueTable.status, "WAITING"))
			.orderBy(deploymentQueueTable.priority, deploymentQueueTable.queuedAt);

		const index = queue.findIndex((q) => q.botId === botId);

		return index === -1 ? queue.length + 1 : index + 1;
	}

	private estimateWaitTime(position: number): number {
		// Estimate 30 seconds per position in queue
		return position * 30 * 1000;
	}
}
