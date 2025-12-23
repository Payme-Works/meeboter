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

/** Maximum number of pool slots allowed */
const MAX_POOL_SIZE = 100;

/**
 * Slot status type for transitions (Coolify platform nomenclature)
 *
 * @see rules/PLATFORM_NOMENCLATURE.md
 */
type SlotStatus = "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";

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
interface PoolSlot {
	id: number;
	applicationUuid: string;
	slotName: string;
	status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
	assignedBotId: number | null;
}

/**
 * Queue entry representing a bot waiting for a slot
 */
interface QueueEntry {
	id: number;
	botId: number;
	priority: number;
	queuedAt: Date;
	timeoutAt: Date;
}

/**
 * Pool statistics for monitoring (Coolify platform nomenclature)
 */
interface PoolStats {
	total: number;
	IDLE: number;
	DEPLOYING: number;
	HEALTHY: number;
	ERROR: number;
	maxSize: number;
}

/**
 * Queue statistics for monitoring
 */
interface QueueStats {
	length: number;
	oldestQueuedAt: Date | null;
	avgWaitMs: number;
}

/**
 * Result of attempting to deploy a bot through the pool
 */
interface DeployResult {
	success: boolean;
	slot?: PoolSlot;
	queuePosition?: number;
	estimatedWaitMs?: number;
	ERROR?: string;
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
		private readonly deploymentQueue: DeploymentQueueService,
	) {}

	// ─────────────────────────────────────────────────────────────────────────
	// Centralized Slot Assignment/Release (Single Source of Truth)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Assigns a bot to a slot by updating the slot's assignedBotId.
	 *
	 * This is the SINGLE entry point for all bot-to-slot assignments.
	 * The slot's applicationUuid is the source of truth for the container UUID.
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
			// Update slot: mark as DEPLOYING, record assignment
			await tx
				.update(botPoolSlotsTable)
				.set({
					status: "DEPLOYING",
					assignedBotId: botId,
					lastUsedAt: new Date(),
					errorMessage: null,
				})
				.where(eq(botPoolSlotsTable.id, slotId));
		});

		logSlotTransition({
			slotId,
			slotName,
			coolifyUuid,
			previousState,
			newState: "DEPLOYING",
			botId,
			reason: "Bot assigned to slot",
		});
	}

	/**
	 * Releases a slot, clearing the assignment.
	 *
	 * This is the SINGLE entry point for releasing slots.
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
				applicationUuid: botPoolSlotsTable.applicationUuid,
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

		// Release the slot (bot keeps its applicationUuid for history)
		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "IDLE",
				assignedBotId: null,
				lastUsedAt: new Date(),
				errorMessage: null,
				recoveryAttempts: 0,
			})
			.where(eq(botPoolSlotsTable.id, slotId));

		logSlotTransition({
			slotId,
			slotName: slot.slotName,
			coolifyUuid: slot.applicationUuid,
			previousState: slot.status as SlotStatus,
			newState: "IDLE",
			botId: previousBotId,
			reason: "Slot released",
		});

		return {
			slotName: slot.slotName,
			coolifyUuid: slot.applicationUuid,
			previousBotId,
		};
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Pool Management
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Acquires an IDLE slot or creates a new one if pool has capacity
	 *
	 * @param botId - The bot ID to assign to the slot
	 * @returns Pool slot if available/created, null if pool exhausted
	 */
	async acquireOrCreateSlot(botId: number): Promise<PoolSlot | null> {
		const idleSlot = await this.acquireIdleSlot(botId);

		if (idleSlot) {
			// Validate that applicationUuid was returned from the query
			if (!idleSlot.applicationUuid) {
				console.error(
					`[BotPoolService] CRITICAL: acquireIdleSlot returned slot with missing applicationUuid`,
					{
						slotId: idleSlot.id,
						slotName: idleSlot.slotName,
						applicationUuid: idleSlot.applicationUuid,
						assignedBotId: idleSlot.assignedBotId,
					},
				);

				throw new Error(
					`Slot ${idleSlot.id} has no applicationUuid - database may need migration`,
				);
			}

			// Update resource limits for existing slot to ensure consistency
			// This ensures slots have the current resource configuration when reused
			await this.coolify.updateResourceLimits(idleSlot.applicationUuid);

			logSlotTransition({
				slotId: idleSlot.id,
				slotName: idleSlot.slotName,
				coolifyUuid: idleSlot.applicationUuid,
				previousState: "IDLE",
				newState: "DEPLOYING",
				botId,
				reason: "Acquired existing IDLE slot",
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
				applicationUuid: botPoolSlotsTable.applicationUuid,
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

			await this.coolify.stopApplication(slot.applicationUuid);

			// Use centralized release function
			await this.releaseBotFromSlot(slot.id);

			await this.updateSlotDescription(slot.applicationUuid, "IDLE");
		} catch (ERROR) {
			const errorMessage =
				ERROR instanceof Error ? ERROR.message : "Unknown ERROR";

			console.error(
				`[BotPoolService] Error releasing slot ${slot.slotName}:`,
				ERROR,
			);

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "ERROR",
					errorMessage,
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			logSlotTransition({
				slotId: slot.id,
				slotName: slot.slotName,
				coolifyUuid: slot.applicationUuid,
				previousState: slot.status as SlotStatus,
				newState: "ERROR",
				botId,
				reason: `Release failed: ${errorMessage}`,
			});

			await this.updateSlotDescription(
				slot.applicationUuid,
				"ERROR",
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
	 * Returns immediately with `DEPLOYING` status for optimistic UI feedback.
	 */
	async configureAndStartSlot(
		slot: PoolSlot,
		botConfig: BotConfig,
	): Promise<PoolSlot> {
		console.log(
			`[BotPoolService] Starting slot ${slot.slotName} for bot ${botConfig.id} (config fetched via API)`,
		);

		const appExists = await this.coolify.applicationExists(
			slot.applicationUuid,
		);

		let activeSlot = slot;

		if (!appExists) {
			console.warn(
				`[BotPoolService] Coolify application ${slot.applicationUuid} not found for slot ${slot.slotName}. Recreating...`,
			);

			activeSlot = await this.recreateSlotApplication(slot, botConfig);

			console.log(
				`[BotPoolService] Recreated slot ${activeSlot.slotName} with new UUID ${activeSlot.applicationUuid}`,
			);
		}

		// No updateBotData call, bot fetches config from API using POOL_SLOT_UUID
		// This avoids Coolify rebuild triggered by env var changes

		// Update Coolify description to show DEPLOYING status
		await this.updateSlotDescription(
			activeSlot.applicationUuid,
			"DEPLOYING",
			botConfig.id,
		);

		// Get platform info for lock coordination
		const image = this.coolify.selectBotImage(botConfig.meeting);

		const platformName = this.getPlatformSlotName(botConfig.meeting.platform);

		// Acquire deployment queue slot to limit concurrent deployments
		await this.deploymentQueue.acquireSlot(String(botConfig.id));

		// Start deployment in background with lock coordination and retry
		// This handles: image pull lock, deployment, retries, and status transitions
		this.deployAndTransitionStatus(
			activeSlot,
			botConfig.id,
			platformName,
			image.tag,
		)
			.catch((ERROR) => {
				console.error(
					`[BotPoolService] Deployment failed for ${activeSlot.slotName}:`,
					ERROR,
				);
			})
			.finally(() => {
				this.deploymentQueue.release(String(botConfig.id));
			});

		// Return immediately with DEPLOYING status for optimistic UI feedback
		return { ...activeSlot, status: "DEPLOYING" as const };
	}

	/**
	 * Deploys a slot with lock coordination and transitions status accordingly.
	 *
	 * Uses CoolifyService.startWithLockAndRetry which handles:
	 * - Image pull lock coordination (first deployer pulls, others wait)
	 * - Retry logic with exponential backoff
	 *
	 * Updates status to `HEALTHY` on success or `ERROR` on failure.
	 *
	 * @param slot - The pool slot being deployed
	 * @param botId - The bot ID
	 * @param platform - Platform name for lock key (e.g., "google-meet")
	 * @param imageTag - Docker image tag for lock key
	 */
	private async deployAndTransitionStatus(
		slot: PoolSlot,
		botId: number,
		platform: string,
		imageTag: string,
	): Promise<void> {
		console.log(
			`[BotPoolService] Starting deployment for ${slot.slotName} (${platform}:${imageTag})`,
		);

		const result = await this.coolify.startWithLockAndRetry(
			slot.applicationUuid,
			platform,
			imageTag,
		);

		if (!result.success) {
			const errorMessage = result.error ?? "Container failed to start";

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "ERROR",
					errorMessage,
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			logSlotTransition({
				slotId: slot.id,
				slotName: slot.slotName,
				coolifyUuid: slot.applicationUuid,
				previousState: "DEPLOYING",
				newState: "ERROR",
				botId,
				reason: `Deployment failed: ${errorMessage}`,
			});

			await this.updateSlotDescription(
				slot.applicationUuid,
				"ERROR",
				undefined,
				errorMessage,
			);

			return;
		}

		// Container is running, transition from DEPLOYING to HEALTHY
		await this.db
			.update(botPoolSlotsTable)
			.set({ status: "HEALTHY" })
			.where(eq(botPoolSlotsTable.id, slot.id));

		logSlotTransition({
			slotId: slot.id,
			slotName: slot.slotName,
			coolifyUuid: slot.applicationUuid,
			previousState: "DEPLOYING",
			newState: "HEALTHY",
			botId,
			reason: "Container running",
		});

		await this.updateSlotDescription(slot.applicationUuid, "HEALTHY", botId);
	}

	/**
	 * Marks a slot as ERROR state
	 */
	async markSlotError(slotId: number, errorMessage: string): Promise<void> {
		const slotResult = await this.db
			.select({
				slotName: botPoolSlotsTable.slotName,
				applicationUuid: botPoolSlotsTable.applicationUuid,
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
				status: "ERROR",
				errorMessage,
			})
			.where(eq(botPoolSlotsTable.id, slotId));

		logSlotTransition({
			slotId,
			slotName: slot.slotName,
			coolifyUuid: slot.applicationUuid,
			previousState: slot.status as SlotStatus,
			newState: "ERROR",
			botId: slot.assignedBotId,
			reason: errorMessage,
		});

		await this.updateSlotDescription(
			slot.applicationUuid,
			"ERROR",
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
			IDLE: 0,
			DEPLOYING: 0,
			HEALTHY: 0,
			ERROR: 0,
			maxSize: MAX_POOL_SIZE,
		};

		for (const row of result) {
			const count = Number(row.count);
			stats.total += count;

			if (row.status === "IDLE") stats.IDLE = count;

			if (row.status === "DEPLOYING") stats.DEPLOYING = count;

			if (row.status === "HEALTHY") stats.HEALTHY = count;

			if (row.status === "ERROR") stats.ERROR = count;
		}

		return stats;
	}

	/**
	 * Gets all pool slots for table display
	 */
	async getAllSlots(): Promise<
		{
			id: number;
			slotName: string;
			status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
			assignedBotId: number | null;
			applicationUuid: string;
			createdAt: Date;
		}[]
	> {
		const slots = await this.db
			.select({
				id: botPoolSlotsTable.id,
				slotName: botPoolSlotsTable.slotName,
				status: botPoolSlotsTable.status,
				assignedBotId: botPoolSlotsTable.assignedBotId,
				applicationUuid: botPoolSlotsTable.applicationUuid,
				createdAt: botPoolSlotsTable.createdAt,
			})
			.from(botPoolSlotsTable)
			.orderBy(botPoolSlotsTable.createdAt);

		return slots as {
			id: number;
			slotName: string;
			status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
			assignedBotId: number | null;
			applicationUuid: string;
			createdAt: Date;
		}[];
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
				ERROR: "Bot not found in queue",
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

				if (slot.status === "DEPLOYING") {
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
			})
			.where(eq(botsTable.id, botId));

		return {
			success: false,
			ERROR: "Queue timeout - no pool slot became available",
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
			meeting: bot.meeting,
			startTime: bot.startTime,
			endTime: bot.endTime,
			displayName: bot.displayName,
			imageUrl: bot.imageUrl ?? undefined,
			recordingEnabled: bot.recordingEnabled,
			automaticLeave: bot.automaticLeave,
			callbackUrl: bot.callbackUrl ?? undefined,
		};

		const slot = await this.acquireOrCreateSlot(nextEntry.botId);

		if (!slot) {
			console.log(`[Queue] Still no slot available for bot ${nextEntry.botId}`);

			return;
		}

		await this.removeFromQueue(nextEntry.botId);

		// Set status to DEPLOYING, the bot itself will update to JOINING_CALL
		// when it actually starts attempting to join the meeting
		// Note: applicationUuid is stored on the pool slot, not on the bot
		await this.db
			.update(botsTable)
			.set({
				status: "DEPLOYING",
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
	 * Atomically acquires an IDLE slot using SELECT FOR UPDATE SKIP LOCKED
	 *
	 * Note: Drizzle ORM transforms raw SQL result columns back to TypeScript
	 * property names based on schema mapping, so we access results using
	 * camelCase (applicationUuid) not snake_case (application_uuid).
	 */
	private async acquireIdleSlot(botId: number): Promise<PoolSlot | null> {
		const result = await this.db.execute<{
			id: number;
			applicationUuid: string;
			slotName: string;
			status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
			assignedBotId: number | null;
		}>(sql`
			UPDATE ${botPoolSlotsTable}
			SET
				status = 'DEPLOYING',
				"assigned_bot_id" = ${botId},
				"last_used_at" = NOW()
			WHERE id = (
				SELECT id FROM ${botPoolSlotsTable}
				WHERE status = 'IDLE'
				ORDER BY "last_used_at" ASC NULLS FIRST
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, "application_uuid", "slot_name", status, "assigned_bot_id"
		`);

		if (result.length === 0) {
			console.log(`[BotPoolService] No IDLE slots available for bot ${botId}`);

			return null;
		}

		const row = result[0];

		console.log(
			`[BotPoolService] Acquired IDLE slot ${row.slotName} (id=${row.id}) for bot ${botId}`,
		);

		return {
			id: row.id,
			applicationUuid: row.applicationUuid,
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
			case "google-meet":
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
		const image = this.coolify.selectBotImage(bot.meeting);
		const platformName = this.getPlatformSlotName(bot.meeting.platform);

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
					applicationUuid: tempUuid,
					slotName: reservedSlotName,
					status: "DEPLOYING",
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
			meeting: bot.meeting,
			startTime: bot.startTime,
			endTime: bot.endTime,
			displayName: bot.displayName,
			imageUrl: bot.imageUrl ?? undefined,
			recordingEnabled: bot.recordingEnabled,
			automaticLeave: bot.automaticLeave,
			callbackUrl: bot.callbackUrl ?? undefined,
		};

		let applicationUuid: string;

		try {
			applicationUuid = await this.coolify.createApplication(
				botId,
				image,
				placeholderConfig,
				slotName,
			);

			// Update slot with real Coolify UUID
			await this.db
				.update(botPoolSlotsTable)
				.set({ applicationUuid })
				.where(eq(botPoolSlotsTable.id, slotId));

			await this.updateSlotDescription(applicationUuid, "DEPLOYING", botId);

			logSlotTransition({
				slotId,
				slotName,
				coolifyUuid: applicationUuid,
				newState: "DEPLOYING",
				botId,
				reason: "Created new slot",
			});

			return {
				id: slotId,
				applicationUuid,
				slotName,
				status: "DEPLOYING",
				assignedBotId: botId,
			};
		} catch (ERROR) {
			// Clean up the reserved slot on Coolify failure
			console.error(
				`[BotPoolService] Failed to create Coolify app for ${slotName}, cleaning up:`,
				ERROR,
			);

			await this.db
				.delete(botPoolSlotsTable)
				.where(eq(botPoolSlotsTable.id, slotId));

			throw ERROR;
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
		const image = this.coolify.selectBotImage(botConfig.meeting);

		console.log(
			`[BotPoolService] Creating new Coolify app for slot ${slot.slotName} (old UUID: ${slot.applicationUuid}, slot ID: ${slot.id})`,
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
				applicationUuid: newCoolifyUuid,
				errorMessage: null,
				recoveryAttempts: sql`${botPoolSlotsTable.recoveryAttempts} + 1`,
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(
			`[BotPoolService] Updated slot ${slot.slotName} with new UUID ${newCoolifyUuid}`,
		);

		return {
			...slot,
			applicationUuid: newCoolifyUuid,
		};
	}

	/**
	 * Updates the Coolify application description to reflect pool status
	 */
	private async updateSlotDescription(
		applicationUuid: string,
		status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR",
		botId?: number,
		errorMessage?: string,
	): Promise<void> {
		let description: string;

		switch (status) {
			case "DEPLOYING":
				description = `[DEPLOYING] Bot #${botId} - Starting container...`;

				break;
			case "HEALTHY":
				description = `[BUSY] Bot #${botId} - ${new Date().toISOString()}`;

				break;
			case "IDLE":
				description = `[IDLE] Available - Last used: ${new Date().toISOString()}`;

				break;
			case "ERROR":
				description = `[ERROR] ${errorMessage ?? "Unknown ERROR"} - ${new Date().toISOString()}`;

				break;
		}

		await this.coolify.updateDescription(applicationUuid, description);
	}
}
