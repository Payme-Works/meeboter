import { eq, gt, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import {
	type BotConfig,
	botPoolQueueTable,
	botsTable,
} from "@/server/database/schema";
import {
	acquireOrCreateSlot,
	configureAndStartSlot,
	type PoolSlot,
} from "./bot-pool-manager";

/** Default queue timeout in milliseconds (5 minutes) */
const DEFAULT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum queue timeout in milliseconds (10 minutes) */
const MAX_QUEUE_TIMEOUT_MS = 10 * 60 * 1000;

/** Polling interval for queue checks (1 second) */
const QUEUE_POLL_INTERVAL_MS = 1000;

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
 * Adds a bot to the queue
 *
 * @param botId - The bot ID to queue
 * @param timeoutMs - How long to wait before timing out
 * @param priority - Priority level (lower = higher priority)
 * @param db - Database instance
 * @returns Queue position
 */
export async function addToQueue(
	botId: number,
	timeoutMs: number = DEFAULT_QUEUE_TIMEOUT_MS,
	priority: number = 100,
	db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
	// Clamp timeout to max
	const clampedTimeout = Math.min(timeoutMs, MAX_QUEUE_TIMEOUT_MS);

	const timeoutAt = new Date(Date.now() + clampedTimeout);

	await db.insert(botPoolQueueTable).values({
		botId,
		priority,
		timeoutAt,
	});

	// Update bot status to QUEUED
	await db
		.update(botsTable)
		.set({ status: "QUEUED" })
		.where(eq(botsTable.id, botId));

	// Get queue position
	const position = await getQueuePosition(botId, db);

	console.log(`[Queue] Bot ${botId} added to queue at position ${position}`);

	return position;
}

/**
 * Gets the current position of a bot in the queue
 */
export async function getQueuePosition(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
	const entry = await db
		.select()
		.from(botPoolQueueTable)
		.where(eq(botPoolQueueTable.botId, botId));

	if (!entry[0]) return -1;

	const ahead = await db
		.select({ count: sql<number>`count(*)` })
		.from(botPoolQueueTable)
		.where(
			sql`(${botPoolQueueTable.priority} < ${entry[0].priority}) OR
			    (${botPoolQueueTable.priority} = ${entry[0].priority} AND ${botPoolQueueTable.queuedAt} < ${entry[0].queuedAt})`,
		);

	return Number(ahead[0]?.count ?? 0) + 1;
}

/**
 * Gets estimated wait time based on queue position and average slot release time
 */
export async function getEstimatedWaitMs(
	queuePosition: number,
): Promise<number> {
	// Rough estimate: 30 seconds per bot ahead (assuming ~30s to process each)
	// This could be improved with actual metrics
	const avgProcessingTimeMs = 30 * 1000;

	return queuePosition * avgProcessingTimeMs;
}

/**
 * Removes a bot from the queue
 */
export async function removeFromQueue(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	await db.delete(botPoolQueueTable).where(eq(botPoolQueueTable.botId, botId));
	console.log(`[Queue] Bot ${botId} removed from queue`);
}

/**
 * Gets the next bot in the queue (highest priority, oldest first)
 */
export async function getNextInQueue(
	db: PostgresJsDatabase<typeof schema>,
): Promise<QueueEntry | null> {
	const result = await db
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
export async function cleanupTimedOutEntries(
	db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
	const timedOut = await db
		.select()
		.from(botPoolQueueTable)
		.where(lt(botPoolQueueTable.timeoutAt, new Date()));

	for (const entry of timedOut) {
		// Update bot status to FATAL with timeout error
		await db
			.update(botsTable)
			.set({
				status: "FATAL",
				deploymentError: "Queue timeout - no pool slot became available",
			})
			.where(eq(botsTable.id, entry.botId));
	}

	// Delete timed out entries
	const result = await db
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
 *
 * @param botId - The bot ID waiting for a slot
 * @param botConfig - Bot configuration to use once slot is acquired
 * @param db - Database instance
 * @returns Deploy result with slot if successful
 */
export async function waitForSlot(
	botId: number,
	botConfig: BotConfig,
	db: PostgresJsDatabase<typeof schema>,
): Promise<DeployResult> {
	// Get queue entry for timeout info
	const entry = await db
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
		// Check if we're still first in queue
		const nextInQueue = await getNextInQueue(db);

		if (!nextInQueue || nextInQueue.botId !== botId) {
			// Not our turn yet, wait
			await new Promise((resolve) =>
				setTimeout(resolve, QUEUE_POLL_INTERVAL_MS),
			);

			continue;
		}

		// Try to acquire a slot
		const slot = await acquireOrCreateSlot(botId, db);

		if (slot) {
			// Got a slot! Remove from queue and configure
			await removeFromQueue(botId, db);

			// If this is an existing slot (not newly created), configure and start it
			// New slots are already started by createAndAcquireNewSlot
			if (slot.status === "busy") {
				await configureAndStartSlot(slot, botConfig, db);
			}

			return {
				success: true,
				slot,
			};
		}

		// No slot available, wait and retry
		await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_INTERVAL_MS));
	}

	// Timed out
	await removeFromQueue(botId, db);

	await db
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
export async function processQueueOnSlotRelease(
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	// Clean up any timed-out entries first
	await cleanupTimedOutEntries(db);

	// Get next bot in queue
	const nextEntry = await getNextInQueue(db);

	if (!nextEntry) {
		console.log("[Queue] No bots waiting in queue");

		return;
	}

	console.log(`[Queue] Processing queued bot ${nextEntry.botId}`);

	// Get bot config
	const botResult = await db
		.select()
		.from(botsTable)
		.where(eq(botsTable.id, nextEntry.botId));

	if (!botResult[0]) {
		console.error(
			`[Queue] Bot ${nextEntry.botId} not found, removing from queue`,
		);

		await removeFromQueue(nextEntry.botId, db);

		return;
	}

	const bot = botResult[0];

	// Build bot config
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

	// Try to acquire slot
	const slot = await acquireOrCreateSlot(nextEntry.botId, db);

	if (!slot) {
		console.log(`[Queue] Still no slot available for bot ${nextEntry.botId}`);

		return;
	}

	// Got a slot! Remove from queue and start
	await removeFromQueue(nextEntry.botId, db);

	// Configure and start the slot
	await configureAndStartSlot(slot, botConfig, db);

	// Update bot status
	await db
		.update(botsTable)
		.set({
			status: "JOINING_CALL",
			coolifyServiceUuid: slot.coolifyServiceUuid,
		})
		.where(eq(botsTable.id, nextEntry.botId));

	console.log(
		`[Queue] Bot ${nextEntry.botId} deployed to slot ${slot.slotName}`,
	);
}

/**
 * Gets queue statistics for monitoring
 */
export async function getQueueStats(
	db: PostgresJsDatabase<typeof schema>,
): Promise<{
	length: number;
	oldestQueuedAt: Date | null;
	avgWaitMs: number;
}> {
	const entries = await db.select().from(botPoolQueueTable);

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
