import { eq, gt, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import {
	type BotConfig,
	botPoolQueueTable,
	botPoolSlotsTable,
	botsTable,
} from "@/server/database/schema";
import type { CoolifyService } from "./coolify-service";

/** Maximum number of pool slots allowed */
const MAX_POOL_SIZE = 100;

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
	teams: 100002,
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
	) {}

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
			console.log(
				`[Pool] Acquired existing slot ${idleSlot.slotName} for bot ${botId}`,
			);

			return idleSlot;
		}

		const currentPoolSize = await this.getPoolSize();

		if (currentPoolSize >= MAX_POOL_SIZE) {
			console.log(
				`[Pool] Pool exhausted (${currentPoolSize}/${MAX_POOL_SIZE}), bot ${botId} must queue`,
			);

			return null;
		}

		console.log(
			`[Pool] Creating new slot for bot ${botId} (current size: ${currentPoolSize})`,
		);

		return await this.createAndAcquireNewSlot(botId);
	}

	/**
	 * Releases a slot back to the pool after bot completion
	 */
	async releaseSlot(botId: number): Promise<void> {
		const slotResult = await this.db
			.select()
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.assignedBotId, botId));

		if (!slotResult[0]) {
			console.warn(`[Pool] No slot found for bot ${botId}, nothing to release`);

			return;
		}

		const slot = slotResult[0];

		try {
			console.log(`[Pool] Stopping container for slot ${slot.slotName}`);
			await this.coolify.stopApplication(slot.coolifyServiceUuid);

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "idle",
					assignedBotId: null,
					lastUsedAt: new Date(),
					errorMessage: null,
					recoveryAttempts: 0,
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			await this.updateSlotDescription(slot.coolifyServiceUuid, "idle");

			console.log(`[Pool] Released slot ${slot.slotName}`);
		} catch (error) {
			console.error(`[Pool] Error releasing slot ${slot.slotName}:`, error);

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "error",
					errorMessage:
						error instanceof Error ? error.message : "Unknown error",
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			await this.updateSlotDescription(
				slot.coolifyServiceUuid,
				"error",
				undefined,
				error instanceof Error ? error.message : "Unknown error",
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
	 * Returns immediately with `deploying` status for optimistic UI feedback.
	 * The status transition to `busy` or `error` happens in the background.
	 */
	async configureAndStartSlot(
		slot: PoolSlot,
		botConfig: BotConfig,
	): Promise<PoolSlot> {
		console.log(
			`[Pool] Starting slot ${slot.slotName} for bot ${botConfig.id} (config fetched via API)`,
		);

		const appExists = await this.coolify.applicationExists(
			slot.coolifyServiceUuid,
		);

		let activeSlot = slot;

		if (!appExists) {
			console.warn(
				`[Pool] Coolify application ${slot.coolifyServiceUuid} not found for slot ${slot.slotName}. Recreating...`,
			);

			activeSlot = await this.recreateSlotApplication(slot, botConfig);

			console.log(
				`[Pool] Recreated slot ${activeSlot.slotName} with new UUID ${activeSlot.coolifyServiceUuid}`,
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

		console.log(`[Pool] Starting container for slot ${activeSlot.slotName}`);
		await this.coolify.startApplication(activeSlot.coolifyServiceUuid);

		// Fire-and-forget: wait for deployment in background, return immediately
		// This provides optimistic feedback to the user
		this.waitAndTransitionStatus(activeSlot, botConfig.id).catch((error) => {
			console.error(
				`[Pool] Background status transition failed for ${activeSlot.slotName}:`,
				error,
			);
		});

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
			`[Pool] Background: Waiting for container ${slot.slotName} to be running...`,
		);

		const deploymentResult = await this.coolify.waitForDeployment(
			slot.coolifyServiceUuid,
		);

		if (!deploymentResult.success) {
			console.error(
				`[Pool] Container ${slot.slotName} failed to start: ${deploymentResult.error}`,
			);

			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "error",
					errorMessage: deploymentResult.error ?? "Container failed to start",
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			await this.updateSlotDescription(
				slot.coolifyServiceUuid,
				"error",
				undefined,
				deploymentResult.error ?? "Container failed to start",
			);

			return;
		}

		// Container is running, transition from deploying to busy
		console.log(`[Pool] Container ${slot.slotName} is now running`);

		await this.db
			.update(botPoolSlotsTable)
			.set({ status: "busy" })
			.where(eq(botPoolSlotsTable.id, slot.id));

		await this.updateSlotDescription(slot.coolifyServiceUuid, "busy", botId);
	}

	/**
	 * Marks a slot as error state
	 */
	async markSlotError(slotId: number, errorMessage: string): Promise<void> {
		const slotResult = await this.db
			.select()
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slotId));

		if (!slotResult[0]) return;

		const slot = slotResult[0];

		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "error",
				errorMessage,
			})
			.where(eq(botPoolSlotsTable.id, slotId));

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

		await this.db
			.update(botsTable)
			.set({ status: "QUEUED" })
			.where(eq(botsTable.id, botId));

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
			miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
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
				"assignedBotId" = ${botId},
				"lastUsedAt" = NOW()
			WHERE id = (
				SELECT id FROM ${botPoolSlotsTable}
				WHERE status = 'idle'
				ORDER BY "lastUsedAt" ASC NULLS FIRST
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, "coolifyServiceUuid", "slotName", status, "assignedBotId"
		`);

		if (result.length === 0) {
			return null;
		}

		const row = result[0];

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
			case "teams":
				return "teams";
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

			const existingSlots = await tx.execute<{ slotName: string }>(sql`
				SELECT "slotName"
				FROM ${botPoolSlotsTable}
				WHERE "slotName" LIKE ${`${prefix}%`}
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
		console.log(`[Pool] Creating Coolify application ${slotName}...`);

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
			miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
		};

		try {
			const coolifyServiceUuid = await this.coolify.createApplication(
				botId,
				image,
				placeholderConfig,
				slotName,
			);

			// Update with real Coolify UUID
			await this.db
				.update(botPoolSlotsTable)
				.set({ coolifyServiceUuid })
				.where(eq(botPoolSlotsTable.id, slotId));

			await this.updateSlotDescription(coolifyServiceUuid, "deploying", botId);

			console.log(
				`[Pool] Created new slot ${slotName} with UUID ${coolifyServiceUuid}`,
			);

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
				`[Pool] Failed to create Coolify app for ${slotName}, cleaning up:`,
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
	 */
	private async recreateSlotApplication(
		slot: PoolSlot,
		botConfig: BotConfig,
	): Promise<PoolSlot> {
		const image = this.coolify.selectBotImage(botConfig.meetingInfo);

		const newCoolifyUuid = await this.coolify.createApplication(
			botConfig.id,
			image,
			botConfig,
			slot.slotName,
		);

		await this.db
			.update(botPoolSlotsTable)
			.set({
				coolifyServiceUuid: newCoolifyUuid,
				errorMessage: null,
				recoveryAttempts: sql`${botPoolSlotsTable.recoveryAttempts} + 1`,
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

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
