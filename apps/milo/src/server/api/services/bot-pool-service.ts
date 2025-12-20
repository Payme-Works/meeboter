import { eq, gt, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import {
	type BotConfig,
	botPoolQueueTable,
	botPoolSlotsTable,
	botsTable,
} from "@/server/database/schema";
import type { CoolifyService } from "./coolify-service";
import type { DeploymentQueueService } from "./deployment-queue-service";
import type { ImagePullLockService } from "./image-pull-lock-service";

/** Maximum number of pool slots allowed */
const MAX_POOL_SIZE = 100;

/**
 * Slot status type for transitions
 */
type SlotStatus = "idle" | "deploying" | "busy" | "error";

/**
 * Structured log entry for slot state transitions
 */
interface SlotTransitionLog {
	slotId: number;
	slotName: string;
	coolifyUuid: string;
	previousState?: SlotStatus;
	newState: SlotStatus;
	botId?: number | null;
	reason: string;
}

/**
 * Logs a slot state transition with consistent format for observability
 */
function logSlotTransition(log: SlotTransitionLog): void {
	const stateChange = log.previousState
		? `${log.previousState} → ${log.newState}`
		: log.newState;

	const botInfo = log.botId ? `bot=${log.botId}` : "bot=none";

	console.log(
		`[BotPoolService] Slot ${log.slotName} (${log.slotId}): ${stateChange} | ${botInfo} | coolify=${log.coolifyUuid} | reason="${log.reason}"`,
	);
}

/** Default queue timeout in milliseconds (5 minutes) */
const DEFAULT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum queue timeout in milliseconds (10 minutes) */
const MAX_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;

/** Polling interval for queue checks (1 second) */
const QUEUE_POLL_INTERVAL_MS = 1000;

/**
 * Advisory lock IDs for serializing slot creation per platform
 * These must be unique across the application to avoid lock conflicts
 */
const PLATFORM_LOCK_IDS: Record<string, number> = {
	"google-meet": 100001,
	"microsoft-teams": 100002,
	zoom: 100003,
	unknown: 100000,
};

/**
 * Pool slot with database fields
 */
export interface PoolSlot {
	id: number;
	coolifyServiceUuid: string;
	slotName: string;
	status: "idle" | "deploying" | "busy" | "error";
	assignedBotId: number | null;
}

/**
 * Queue entry representing a bot waiting for a slot
 */
export interface QueueEntry {
	id: number;
	botId: number;
	priority: number;
	queuedAt: Date;
	timeoutAt: Date;
}

/**
 * Pool statistics for monitoring
 */
export interface PoolStats {
	total: number;
	idle: number;
	deploying: number;
	busy: number;
	error: number;
	maxSize: number;
}

/**
 * Queue statistics for monitoring
 */
export interface QueueStats {
	length: number;
	oldestQueuedAt: Date | null;
	avgWaitMs: number;
}

/**
 * Result of attempting to deploy a bot through the pool
 */
export interface DeployResult {
	success: boolean;
	slot?: PoolSlot;
	queuePosition?: number;
	estimatedWaitMs?: number;
	error?: string;
}

/**
 * Service for managing the bot pool and deployment queue
 *
 * Handles pool slot acquisition, release, configuration,
 * and queue management for bots waiting for slots.
 */
export class BotPoolService {
	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly coolify: CoolifyService,
		private readonly imagePullLock: ImagePullLockService,
		private readonly deploymentQueue: DeploymentQueueService,
	) {}

	// ─────────────────────────────────────────────────────────────────────────
	// Centralized Slot Assignment/Release (Single Source of Truth)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Atomically assigns a bot to a slot, updating both tables in a transaction.
	 *
	 * This is the SINGLE entry point for all bot-to-slot assignments.
	 * It ensures both `botPoolSlotsTable.assignedBotId` and `botsTable.coolifyServiceUuid`
	 * are updated atomically, preventing sync issues.
	 *
	 * @param slotId - The slot ID to assign the bot to
	 * @param botId - The bot ID to assign
	 * @param coolifyUuid - The Coolify service UUID for the slot
	 * @param slotName - The slot name (for logging)
	 * @param previousState - The previous slot state (for logging)
	 */
	async assignBotToSlot(
		slotId: number,
		botId: number,
		coolifyUuid: string,
		slotName: string,
		previousState?: SlotStatus,
	): Promise<void> {
		await this.db.transaction(async (tx) => {
			// Update slot: mark as deploying, record assignment
			await tx
				.update(botPoolSlotsTable)
				.set({
					status: "deploying",
					assignedBotId: botId,
					lastUsedAt: new Date(),
					errorMessage: null,
				})
				.where(eq(botPoolSlotsTable.id, slotId));

			// Update bot: record which container it's running in
			await tx
				.update(botsTable)
				.set({ coolifyServiceUuid: coolifyUuid })
				.where(eq(botsTable.id, botId));
		});

		logSlotTransition({
			slotId,
			slotName,
			coolifyUuid,
			previousState,
			newState: "deploying",
			botId,
			reason: "Bot assigned to slot",
		});
	}

	/**
	 * Atomically releases a slot, clearing the assignment.
	 *
	 * This is the SINGLE entry point for releasing slots.
	 * The bot's `coolifyServiceUuid` is preserved as a historical reference
	 * for post-release lookups and debugging.
	 *
	 * @param slotId - The slot ID to release
	 * @returns The released slot info, or null if slot not found
	 */
	async releaseBotFromSlot(slotId: number): Promise<{
		slotName: string;
		coolifyUuid: string;
		previousBotId: number | null;
	} | null> {
		const slotResult = await this.db
			.select({
				slotName: botPoolSlotsTable.slotName,
				coolifyServiceUuid: botPoolSlotsTable.coolifyServiceUuid,
				assignedBotId: botPoolSlotsTable.assignedBotId,
				status: botPoolSlotsTable.status,
			})
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slotId))
			.limit(1);

		if (!slotResult[0]) {
			console.warn(`[BotPoolService] Cannot release slot ${slotId}: not found`);

			return null;
		}

		const slot = slotResult[0];
		const previousBotId = slot.assignedBotId;

		// Release the slot (bot keeps its coolifyServiceUuid for history)
		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "idle",
				assignedBotId: null,
				lastUsedAt: new Date(),
				errorMessage: null,
				recoveryAttempts: 0,
			})
			.where(eq(botPoolSlotsTable.id, slotId));

		logSlotTransition({
			slotId,
			slotName: slot.slotName,
			coolifyUuid: slot.coolifyServiceUuid,
			previousState: slot.status as SlotStatus,
			newState: "idle",
			botId: previousBotId,
			reason: "Slot released",
		});

		return {
			slotName: slot.slotName,
			coolifyUuid: slot.coolifyServiceUuid,
			previousBotId,
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Pool Management
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Acquires an idle slot or creates a new one if pool has capacity
	 *
	 * @param botId - The bot ID to assign to the slot
	 * @returns Pool slot if available/created, null if pool exhausted
	 */
	async acquireOrCreateSlot(botId: number): Promise<PoolSlot | null> {
		const idleSlot = await this.acquireIdleSlot(botId);

		if (idleSlot) {
			// Validate that coolifyServiceUuid was returned from the query
			if (!idleSlot.coolifyServiceUuid) {
				console.error(
					`[BotPoolService] CRITICAL: acquireIdleSlot returned slot with missing coolifyServiceUuid`,
					{
						slotId: idleSlot.id,
						slotName: idleSlot.slotName,
						coolifyServiceUuid: idleSlot.coolifyServiceUuid,
						assignedBotId: idleSlot.assignedBotId,
					},
				);

				throw new Error(
					`Slot ${idleSlot.id} has no coolifyServiceUuid - database may need migration`,
				);
			}

			// Update resource limits for existing slot to ensure consistency
			// This ensures slots have the current resource configuration when reused
			await this.coolify.updateResourceLimits(idleSlot.coolifyServiceUuid);

			// Update bot's coolifyServiceUuid immediately after slot acquisition
			// This ensures both tables are in sync (slot.assignedBotId and bot.coolifyServiceUuid)
			await this.db
				.update(botsTable)
				.set({ coolifyServiceUuid: idleSlot.coolifyServiceUuid })
				.where(eq(botsTable.id, botId));

			logSlotTransition({
				slotId: idleSlot.id,
				slotName: idleSlot.slotName,
				coolifyUuid: idleSlot.coolifyServiceUuid,
				previousState: "idle",
				newState: "deploying",
				botId,
				reason: "Acquired existing idle slot",
			});

			return idleSlot;
		}

		const currentPoolSize = await this.getPoolSize();

		if (currentPoolSize >= MAX_POOL_SIZE) {
			console.log(
				`[BotPoolService] Pool exhausted (${currentPoolSize}/${MAX_POOL_SIZE}), bot ${botId} must queue`,
			);

			return null;
		}

		console.log(
			`[BotPoolService] Creating new slot for bot ${botId} (current size: ${currentPoolSize})`,
		);

		return await this.createAndAcquireNewSlot(botId);
	}

	/**
	 * Releases a slot back to the pool after bot completion
	 */
	async releaseSlot(botId: number): Promise<void> {
		const slotResult = await this.db
			.select({
				id: botPoolSlotsTable.id,
				slotName: botPoolSlotsTable.slotName,
				coolifyServiceUuid: botPoolSlotsTable.coolifyServiceUuid,
				status: botPoolSlotsTable.status,
			})
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.assignedBotId, botId))
			.limit(1);

		if (!slotResult[0]) {
			console.warn(
				`[BotPoolService] No slot found for bot ${botId}, nothing to release`,
			);

			return;
		}

		const slot = slotResult[0];

		try {
			console.log(
				`[BotPoolService] Stopping container for slot ${slot.slotName}`,
			);

			await this.coolify.stopApplication(slot.coolifyServiceUuid);

			// Use centralized release function
			await this.releaseBotFromSlot(slot.id);

			await this.updateSlotDescription(slot.coolifyServiceUuid, "idle");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			console.error(
				`[BotPoolService] Error releasing slot ${slot.slotName}:`,
				error,
			);

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "error",
					errorMessage,
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			logSlotTransition({
				slotId: slot.id,
				slotName: slot.slotName,
				coolifyUuid: slot.coolifyServiceUuid,
				previousState: slot.status as SlotStatus,
				newState: "error",
				botId,
				reason: `Release failed: ${errorMessage}`,
			});

			await this.updateSlotDescription(
				slot.coolifyServiceUuid,
				"error",
				undefined,
				errorMessage,
			);
		}
	}

	/**
	 * Starts a pool slot for a bot (no env var updates needed)
	 *
	 * Bot config is fetched at runtime via API using POOL_SLOT_UUID env var.
	 * This avoids triggering Coolify rebuilds (Coolify bug #2854).
	 *
	 * If the Coolify application has been deleted externally, this function
	 * will automatically recreate it and update the slot in the database.
	 *
	 * Uses deployment queue to limit concurrent deployments (max 4).
	 * Uses image pull lock to coordinate Docker image pulls.
	 *
	 * Returns immediately with `deploying` status for optimistic UI feedback.
	 */
	async configureAndStartSlot(
		slot: PoolSlot,
		botConfig: BotConfig,
	): Promise<PoolSlot> {
		console.log(
			`[BotPoolService] Starting slot ${slot.slotName} for bot ${botConfig.id} (config fetched via API)`,
		);

		const appExists = await this.coolify.applicationExists(
			slot.coolifyServiceUuid,
		);

		let activeSlot = slot;

		if (!appExists) {
			console.warn(
				`[BotPoolService] Coolify application ${slot.coolifyServiceUuid} not found for slot ${slot.slotName}. Recreating...`,
			);

			activeSlot = await this.recreateSlotApplication(slot, botConfig);

			console.log(
				`[BotPoolService] Recreated slot ${activeSlot.slotName} with new UUID ${activeSlot.coolifyServiceUuid}`,
			);
		}

		// No updateBotData call, bot fetches config from API using POOL_SLOT_UUID
		// This avoids Coolify rebuild triggered by env var changes

		// Update Coolify description to show deploying status
		await this.updateSlotDescription(
			activeSlot.coolifyServiceUuid,
			"deploying",
			botConfig.id,
		);

		// Get platform info for image pull lock
		const image = this.coolify.selectBotImage(botConfig.meetingInfo);

		const platformName = this.getPlatformSlotName(
			botConfig.meetingInfo.platform,
		);

		// Acquire deployment queue slot to limit concurrent deployments
		// This prevents overwhelming the Coolify server with too many simultaneous deploys
		await this.deploymentQueue.acquireSlot(String(botConfig.id));

		try {
			// Check if a deployment is already in progress or was recently triggered
			// (e.g., from instant_deploy: true on slot creation)
			// This prevents triggering duplicate deployments
			const existingDeployment = await this.coolify.getLatestDeployment(
				activeSlot.coolifyServiceUuid,
			);

			const deploymentStatus = existingDeployment?.status.toLowerCase();

			const isDeploymentInProgress =
				deploymentStatus === "queued" || deploymentStatus === "in_progress";

			// Also skip if deployment was created in the last 30 seconds (likely from instant_deploy)
			const isRecentDeployment =
				existingDeployment?.createdAt &&
				Date.now() - existingDeployment.createdAt.getTime() < 30_000;

			const shouldSkipDeploy = isDeploymentInProgress || isRecentDeployment;

			// Acquire image pull lock to prevent parallel pulls of the same image
			// This ensures only the first deployment pulls the image, others wait and use cache
			const { release: releaseLock, isFirstDeployer } =
				await this.imagePullLock.acquireLock(platformName, image.tag);

			if (shouldSkipDeploy) {
				const reason = isDeploymentInProgress
					? `in progress (${existingDeployment?.status})`
					: `recent (${Math.round((Date.now() - (existingDeployment?.createdAt?.getTime() ?? 0)) / 1000)}s ago)`;

				console.log(
					`[BotPoolService] Deployment already ${reason} for slot ${activeSlot.slotName}, skipping startApplication`,
				);
			} else {
				console.log(
					`[BotPoolService] Starting container for slot ${activeSlot.slotName}`,
				);

				await this.coolify.startApplication(activeSlot.coolifyServiceUuid);
			}

			if (isFirstDeployer) {
				// First deployer: hold lock in background until deployment completes
				// This ensures image is fully pulled and cached before others proceed
				// Fire-and-forget to avoid HTTP timeout, but release lock when done
				console.log(
					`[BotPoolService] First deployer for ${platformName}:${image.tag}, starting deployment in background...`,
				);

				this.waitAndTransitionStatus(activeSlot, botConfig.id)
					.then(() => {
						console.log(
							`[BotPoolService] First deployer completed for ${platformName}:${image.tag}, releasing lock`,
						);

						releaseLock();
					})
					.catch((error) => {
						console.error(
							`[BotPoolService] First deployer failed for ${activeSlot.slotName}:`,
							error,
						);

						releaseLock(
							error instanceof Error ? error : new Error(String(error)),
						);
					})
					.finally(() => {
						// Release deployment queue slot when deployment completes
						this.deploymentQueue.release(String(botConfig.id));
					});
			} else {
				// Not first deployer: image is cached, can fire-and-forget
				// This provides optimistic feedback to the user
				console.log(
					`[BotPoolService] Image cached for ${platformName}:${image.tag}, proceeding with background deployment`,
				);

				this.waitAndTransitionStatus(activeSlot, botConfig.id)
					.catch((error) => {
						console.error(
							`[BotPoolService] Background status transition failed for ${activeSlot.slotName}:`,
							error,
						);
					})
					.finally(() => {
						// Release deployment queue slot when deployment completes
						this.deploymentQueue.release(String(botConfig.id));
					});
			}
		} catch (error) {
			// Release deployment queue slot on error
			this.deploymentQueue.release(String(botConfig.id));

			throw error;
		}

		// Return immediately with deploying status for optimistic UI feedback
		return { ...activeSlot, status: "deploying" as const };
	}

	/**
	 * Waits for container deployment and transitions slot status accordingly
	 *
	 * This runs in the background after configureAndStartSlot returns.
	 * Updates status to `busy` on success or `error` on failure.
	 */
	private async waitAndTransitionStatus(
		slot: PoolSlot,
		botId: number,
	): Promise<void> {
		console.log(
			`[BotPoolService] Background: Waiting for container ${slot.slotName} to be running...`,
		);

		const deploymentResult = await this.coolify.waitForDeployment(
			slot.coolifyServiceUuid,
		);

		if (!deploymentResult.success) {
			const errorMessage =
				deploymentResult.error ?? "Container failed to start";

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "error",
					errorMessage,
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			logSlotTransition({
				slotId: slot.id,
				slotName: slot.slotName,
				coolifyUuid: slot.coolifyServiceUuid,
				previousState: "deploying",
				newState: "error",
				botId,
				reason: `Deployment failed: ${errorMessage}`,
			});

			await this.updateSlotDescription(
				slot.coolifyServiceUuid,
				"error",
				undefined,
				errorMessage,
			);

			return;
		}

		// Container is running, transition from deploying to busy
		await this.db
			.update(botPoolSlotsTable)
			.set({ status: "busy" })
			.where(eq(botPoolSlotsTable.id, slot.id));

		logSlotTransition({
			slotId: slot.id,
			slotName: slot.slotName,
			coolifyUuid: slot.coolifyServiceUuid,
			previousState: "deploying",
			newState: "busy",
			botId,
			reason: "Container running",
		});

		await this.updateSlotDescription(slot.coolifyServiceUuid, "busy", botId);
	}

	/**
	 * Marks a slot as error state
	 */
	async markSlotError(slotId: number, errorMessage: string): Promise<void> {
		const slotResult = await this.db
			.select({
				slotName: botPoolSlotsTable.slotName,
				coolifyServiceUuid: botPoolSlotsTable.coolifyServiceUuid,
				assignedBotId: botPoolSlotsTable.assignedBotId,
				status: botPoolSlotsTable.status,
			})
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slotId))
			.limit(1);

		if (!slotResult[0]) return;

		const slot = slotResult[0];

		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "error",
				errorMessage,
			})
			.where(eq(botPoolSlotsTable.id, slotId));

		logSlotTransition({
			slotId,
			slotName: slot.slotName,
			coolifyUuid: slot.coolifyServiceUuid,
			previousState: slot.status as SlotStatus,
			newState: "error",
			botId: slot.assignedBotId,
			reason: errorMessage,
		});

		await this.updateSlotDescription(
			slot.coolifyServiceUuid,
			"error",
			undefined,
			errorMessage,
		);
	}

	/**
	 * Gets pool statistics for monitoring
	 */
	async getPoolStats(): Promise<PoolStats> {
		const result = await this.db
			.select({
				status: botPoolSlotsTable.status,
				count: sql<number>`count(*)`,
			})
			.from(botPoolSlotsTable)
			.groupBy(botPoolSlotsTable.status);

		const stats: PoolStats = {
			total: 0,
			idle: 0,
			deploying: 0,
			busy: 0,
			error: 0,
			maxSize: MAX_POOL_SIZE,
		};

		for (const row of result) {
			const count = Number(row.count);
			stats.total += count;

			if (row.status === "idle") stats.idle = count;

			if (row.status === "deploying") stats.deploying = count;

			if (row.status === "busy") stats.busy = count;

			if (row.status === "error") stats.error = count;
		}

		return stats;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Queue Management
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Adds a bot to the queue
	 *
	 * @param botId - The bot ID to queue
	 * @param timeoutMs - How long to wait before timing out
	 * @param priority - Priority level (lower = higher priority)
	 * @returns Queue position
	 */
	async addToQueue(
		botId: number,
		timeoutMs: number = DEFAULT_QUEUE_TIMEOUT_MS,
		priority: number = 100,
	): Promise<number> {
		const clampedTimeout = Math.min(timeoutMs, MAX_QUEUE_TIMEOUT_MS);
		const timeoutAt = new Date(Date.now() + clampedTimeout);

		await this.db.insert(botPoolQueueTable).values({
			botId,
			priority,
			timeoutAt,
		});

		const position = await this.getQueuePosition(botId);

		console.log(`[Queue] Bot ${botId} added to queue at position ${position}`);

		return position;
	}

	/**
	 * Gets the current position of a bot in the queue
	 */
	async getQueuePosition(botId: number): Promise<number> {
		const entry = await this.db
			.select()
			.from(botPoolQueueTable)
			.where(eq(botPoolQueueTable.botId, botId));

		if (!entry[0]) return -1;

		const ahead = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(botPoolQueueTable)
			.where(
				sql`(${botPoolQueueTable.priority} < ${entry[0].priority}) OR
				    (${botPoolQueueTable.priority} = ${entry[0].priority} AND ${botPoolQueueTable.queuedAt} < ${entry[0].queuedAt})`,
			);

		return Number(ahead[0]?.count ?? 0) + 1;
	}

	/**
	 * Gets estimated wait time based on queue position
	 */
	getEstimatedWaitMs(queuePosition: number): number {
		const avgProcessingTimeMs = 30 * 1000;

		return queuePosition * avgProcessingTimeMs;
	}

	/**
	 * Removes a bot from the queue
	 */
	async removeFromQueue(botId: number): Promise<void> {
		await this.db
			.delete(botPoolQueueTable)
			.where(eq(botPoolQueueTable.botId, botId));

		console.log(`[Queue] Bot ${botId} removed from queue`);
	}

	/**
	 * Gets the next bot in the queue (highest priority, oldest first)
	 */
	async getNextInQueue(): Promise<QueueEntry | null> {
		const result = await this.db
			.select()
			.from(botPoolQueueTable)
			.where(gt(botPoolQueueTable.timeoutAt, new Date()))
			.orderBy(botPoolQueueTable.priority, botPoolQueueTable.queuedAt)
			.limit(1);

		if (!result[0]) return null;

		return {
			id: result[0].id,
			botId: result[0].botId,
			priority: result[0].priority,
			queuedAt: result[0].queuedAt,
			timeoutAt: result[0].timeoutAt,
		};
	}

	/**
	 * Cleans up timed-out queue entries
	 */
	async cleanupTimedOutEntries(): Promise<number> {
		const timedOut = await this.db
			.select()
			.from(botPoolQueueTable)
			.where(lt(botPoolQueueTable.timeoutAt, new Date()));

		for (const entry of timedOut) {
			await this.db
				.update(botsTable)
				.set({
					status: "FATAL",
					deploymentError: "Queue timeout - no pool slot became available",
				})
				.where(eq(botsTable.id, entry.botId));
		}

		const result = await this.db
			.delete(botPoolQueueTable)
			.where(lt(botPoolQueueTable.timeoutAt, new Date()))
			.returning();

		if (result.length > 0) {
			console.log(`[Queue] Cleaned up ${result.length} timed-out entries`);
		}

		return result.length;
	}

	/**
	 * Waits for a slot to become available, polling the queue
	 */
	async waitForSlot(
		botId: number,
		botConfig: BotConfig,
	): Promise<DeployResult> {
		const entry = await this.db
			.select()
			.from(botPoolQueueTable)
			.where(eq(botPoolQueueTable.botId, botId));

		if (!entry[0]) {
			return {
				success: false,
				error: "Bot not found in queue",
			};
		}

		const timeoutAt = entry[0].timeoutAt;

		while (new Date() < timeoutAt) {
			const nextInQueue = await this.getNextInQueue();

			if (!nextInQueue || nextInQueue.botId !== botId) {
				await new Promise((resolve) =>
					setTimeout(resolve, QUEUE_POLL_INTERVAL_MS),
				);

				continue;
			}

			const slot = await this.acquireOrCreateSlot(botId);

			if (slot) {
				await this.removeFromQueue(botId);

				if (slot.status === "deploying") {
					await this.configureAndStartSlot(slot, botConfig);
				}

				return {
					success: true,
					slot,
				};
			}

			await new Promise((resolve) =>
				setTimeout(resolve, QUEUE_POLL_INTERVAL_MS),
			);
		}

		await this.removeFromQueue(botId);

		await this.db
			.update(botsTable)
			.set({
				status: "FATAL",
				deploymentError: "Queue timeout - no pool slot became available",
			})
			.where(eq(botsTable.id, botId));

		return {
			success: false,
			error: "Queue timeout - no pool slot became available",
		};
	}

	/**
	 * Processes the queue when a slot is released
	 * Should be called after releaseSlot()
	 */
	async processQueueOnSlotRelease(): Promise<void> {
		await this.cleanupTimedOutEntries();

		const nextEntry = await this.getNextInQueue();

		if (!nextEntry) {
			console.log("[Queue] No bots waiting in queue");

			return;
		}

		console.log(`[Queue] Processing queued bot ${nextEntry.botId}`);

		const botResult = await this.db
			.select()
			.from(botsTable)
			.where(eq(botsTable.id, nextEntry.botId));

		if (!botResult[0]) {
			console.error(
				`[Queue] Bot ${nextEntry.botId} not found, removing from queue`,
			);

			await this.removeFromQueue(nextEntry.botId);

			return;
		}

		const bot = botResult[0];

		const botConfig: BotConfig = {
			id: bot.id,
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

		const slot = await this.acquireOrCreateSlot(nextEntry.botId);

		if (!slot) {
			console.log(`[Queue] Still no slot available for bot ${nextEntry.botId}`);

			return;
		}

		await this.removeFromQueue(nextEntry.botId);

		// Set status to DEPLOYING - the bot itself will update to JOINING_CALL
		// when it actually starts attempting to join the meeting
		await this.db
			.update(botsTable)
			.set({
				status: "DEPLOYING",
				coolifyServiceUuid: slot.coolifyServiceUuid,
			})
			.where(eq(botsTable.id, nextEntry.botId));

		await this.configureAndStartSlot(slot, botConfig);

		console.log(
			`[Queue] Bot ${nextEntry.botId} deployed to slot ${slot.slotName}`,
		);
	}

	/**
	 * Gets queue statistics for monitoring
	 */
	async getQueueStats(): Promise<QueueStats> {
		const entries = await this.db.select().from(botPoolQueueTable);

		if (entries.length === 0) {
			return {
				length: 0,
				oldestQueuedAt: null,
				avgWaitMs: 0,
			};
		}

		const now = Date.now();

		const totalWaitMs = entries.reduce(
			(sum, entry) => sum + (now - entry.queuedAt.getTime()),
			0,
		);

		const sortedByAge = [...entries].sort(
			(a, b) => a.queuedAt.getTime() - b.queuedAt.getTime(),
		);

		return {
			length: entries.length,
			oldestQueuedAt: sortedByAge[0]?.queuedAt ?? null,
			avgWaitMs: totalWaitMs / entries.length,
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Private Helpers
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Atomically acquires an idle slot using SELECT FOR UPDATE SKIP LOCKED
	 *
	 * Note: Drizzle ORM transforms raw SQL result columns back to TypeScript
	 * property names based on schema mapping, so we access results using
	 * camelCase (coolifyServiceUuid) not snake_case (coolify_service_uuid).
	 */
	private async acquireIdleSlot(botId: number): Promise<PoolSlot | null> {
		const result = await this.db.execute<{
			id: number;
			coolifyServiceUuid: string;
			slotName: string;
			status: "idle" | "deploying" | "busy" | "error";
			assignedBotId: number | null;
		}>(sql`
			UPDATE ${botPoolSlotsTable}
			SET
				status = 'deploying',
				"assigned_bot_id" = ${botId},
				"last_used_at" = NOW()
			WHERE id = (
				SELECT id FROM ${botPoolSlotsTable}
				WHERE status = 'idle'
				ORDER BY "last_used_at" ASC NULLS FIRST
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, "coolify_service_uuid", "slot_name", status, "assigned_bot_id"
		`);

		if (result.length === 0) {
			console.log(`[BotPoolService] No idle slots available for bot ${botId}`);

			return null;
		}

		const row = result[0];

		console.log(
			`[BotPoolService] Acquired idle slot ${row.slotName} (id=${row.id}) for bot ${botId}`,
		);

		return {
			id: row.id,
			coolifyServiceUuid: row.coolifyServiceUuid,
			slotName: row.slotName,
			status: row.status,
			assignedBotId: row.assignedBotId,
		};
	}

	/**
	 * Gets the current number of pool slots
	 */
	private async getPoolSize(): Promise<number> {
		const result = await this.db
			.select({ count: sql<number>`count(*)` })
			.from(botPoolSlotsTable);

		return Number(result[0]?.count ?? 0);
	}

	/**
	 * Maps platform identifier to slot name component
	 */
	private getPlatformSlotName(platform: string | undefined): string {
		switch (platform?.toLowerCase()) {
			case "google":
				return "google-meet";
			case "microsoft-teams":
				return "microsoft-teams";
			case "zoom":
				return "zoom";
			default:
				return "unknown";
		}
	}

	/**
	 * Creates a new pool slot and assigns it to the bot
	 * This is slow as it involves creating a Coolify app and pulling the image
	 *
	 * Uses a transaction with FOR UPDATE to prevent race conditions when
	 * multiple bots are deployed simultaneously.
	 */
	private async createAndAcquireNewSlot(botId: number): Promise<PoolSlot> {
		const botResult = await this.db
			.select()
			.from(botsTable)
			.where(eq(botsTable.id, botId));

		if (!botResult[0]) {
			throw new Error(`Bot ${botId} not found`);
		}

		const bot = botResult[0];
		const image = this.coolify.selectBotImage(bot.meetingInfo);
		const platformName = this.getPlatformSlotName(bot.meetingInfo.platform);

		// Reserve slot number atomically using transaction with advisory lock
		// Advisory lock works even when table is empty (unlike FOR UPDATE)
		const { slotName, slotId } = await this.db.transaction(async (tx) => {
			// Acquire advisory lock for this platform to serialize slot creation
			const lockId =
				PLATFORM_LOCK_IDS[platformName] ?? PLATFORM_LOCK_IDS.unknown;

			await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);

			// Now safe to read and calculate next slot number
			const prefix = `pool-${platformName}-`;

			// Note: Drizzle transforms column names to TypeScript property names
			const existingSlots = await tx.execute<{ slotName: string }>(sql`
				SELECT "slot_name"
				FROM ${botPoolSlotsTable}
				WHERE "slot_name" LIKE ${`${prefix}%`}
			`);

			// Calculate next available number (finds first gap in sequence)
			const usedNumbers = new Set<number>();

			for (const row of existingSlots) {
				const match = row.slotName.match(/(\d+)$/);

				if (match) {
					usedNumbers.add(Number.parseInt(match[1], 10));
				}
			}

			let nextNumber = 1;

			while (usedNumbers.has(nextNumber)) {
				nextNumber++;
			}

			const reservedSlotName = `${prefix}${String(nextNumber).padStart(3, "0")}`;

			// Insert placeholder row with temporary UUID to reserve the slot name
			const tempUuid = `pending-${crypto.randomUUID()}`;

			const insertResult = await tx
				.insert(botPoolSlotsTable)
				.values({
					coolifyServiceUuid: tempUuid,
					slotName: reservedSlotName,
					status: "deploying",
					assignedBotId: botId,
					lastUsedAt: new Date(),
				})
				.returning({ id: botPoolSlotsTable.id });

			if (!insertResult[0]) {
				throw new Error("Failed to reserve pool slot");
			}

			return { slotName: reservedSlotName, slotId: insertResult[0].id };
		});

		// Create Coolify application (outside transaction to release lock quickly)
		console.log(`[BotPoolService] Creating Coolify application ${slotName}...`);

		const placeholderConfig: BotConfig = {
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

		let coolifyServiceUuid: string;

		try {
			coolifyServiceUuid = await this.coolify.createApplication(
				botId,
				image,
				placeholderConfig,
				slotName,
			);

			// Update slot with real Coolify UUID and bot's reference atomically
			await this.db.transaction(async (tx) => {
				await tx
					.update(botPoolSlotsTable)
					.set({ coolifyServiceUuid })
					.where(eq(botPoolSlotsTable.id, slotId));

				await tx
					.update(botsTable)
					.set({ coolifyServiceUuid })
					.where(eq(botsTable.id, botId));
			});

			await this.updateSlotDescription(coolifyServiceUuid, "deploying", botId);

			logSlotTransition({
				slotId,
				slotName,
				coolifyUuid: coolifyServiceUuid,
				newState: "deploying",
				botId,
				reason: "Created new slot",
			});

			return {
				id: slotId,
				coolifyServiceUuid,
				slotName,
				status: "deploying",
				assignedBotId: botId,
			};
		} catch (error) {
			// Clean up the reserved slot on Coolify failure
			console.error(
				`[BotPoolService] Failed to create Coolify app for ${slotName}, cleaning up:`,
				error,
			);

			await this.db
				.delete(botPoolSlotsTable)
				.where(eq(botPoolSlotsTable.id, slotId));

			throw error;
		}
	}

	/**
	 * Recreates a Coolify application for a slot whose app was deleted externally
	 *
	 * Updates both botPoolSlotsTable and botsTable with the new UUID to ensure
	 * all references to this slot/bot use the new Coolify application UUID.
	 */
	private async recreateSlotApplication(
		slot: PoolSlot,
		botConfig: BotConfig,
	): Promise<PoolSlot> {
		const image = this.coolify.selectBotImage(botConfig.meetingInfo);

		console.log(
			`[BotPoolService] Creating new Coolify app for slot ${slot.slotName} (old UUID: ${slot.coolifyServiceUuid}, slot ID: ${slot.id})`,
		);

		const newCoolifyUuid = await this.coolify.createApplication(
			botConfig.id,
			image,
			botConfig,
			slot.slotName,
		);

		// Update the slot table with the new UUID
		await this.db
			.update(botPoolSlotsTable)
			.set({
				coolifyServiceUuid: newCoolifyUuid,
				errorMessage: null,
				recoveryAttempts: sql`${botPoolSlotsTable.recoveryAttempts} + 1`,
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		// Also update the bot's reference to the new UUID immediately
		// This ensures any code reading from botsTable gets the correct UUID
		await this.db
			.update(botsTable)
			.set({ coolifyServiceUuid: newCoolifyUuid })
			.where(eq(botsTable.id, botConfig.id));

		console.log(
			`[BotPoolService] Updated slot ${slot.slotName} and bot ${botConfig.id} with new UUID ${newCoolifyUuid}`,
		);

		return {
			...slot,
			coolifyServiceUuid: newCoolifyUuid,
		};
	}

	/**
	 * Updates the Coolify application description to reflect pool status
	 */
	private async updateSlotDescription(
		applicationUuid: string,
		status: "idle" | "deploying" | "busy" | "error",
		botId?: number,
		errorMessage?: string,
	): Promise<void> {
		let description: string;

		switch (status) {
			case "deploying":
				description = `[DEPLOYING] Bot #${botId} - Starting container...`;

				break;
			case "busy":
				description = `[BUSY] Bot #${botId} - ${new Date().toISOString()}`;

				break;
			case "idle":
				description = `[IDLE] Available - Last used: ${new Date().toISOString()}`;

				break;
			case "error":
				description = `[ERROR] ${errorMessage ?? "Unknown error"} - ${new Date().toISOString()}`;

				break;
		}

		await this.coolify.updateDescription(applicationUuid, description);
	}
}
