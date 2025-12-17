import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import {
	type BotConfig,
	botPoolSlotsTable,
	botsTable,
} from "@/server/database/schema";
import {
	createCoolifyApplication,
	selectBotImage,
	startCoolifyApplication,
	stopCoolifyApplication,
} from "./coolify-deployment";

/** Maximum number of pool slots allowed */
const MAX_POOL_SIZE = 100;

/**
 * Maps platform identifier to slot name component
 * @param platform - Platform from meetingInfo (google, teams, zoom)
 * @returns Slot name component (meet, teams, zoom)
 */
function getPlatformSlotName(platform: string | undefined): string {
	switch (platform?.toLowerCase()) {
		case "google":
			return "meet";
		case "teams":
			return "teams";
		case "zoom":
			return "zoom";
		default:
			return "unknown";
	}
}

/** Pool slot with database fields */
export interface PoolSlot {
	id: number;
	coolifyServiceUuid: string;
	slotName: string;
	status: "idle" | "busy" | "error";
	assignedBotId: number | null;
}

/**
 * Acquires an idle slot or creates a new one if pool has capacity
 *
 * @param botId - The bot ID to assign to the slot
 * @param db - Database instance
 * @returns Pool slot if available/created, null if pool exhausted
 */
export async function acquireOrCreateSlot(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<PoolSlot | null> {
	// 1. Try to acquire an existing idle slot (atomic operation)
	const idleSlot = await acquireIdleSlot(botId, db);

	if (idleSlot) {
		console.log(
			`[Pool] Acquired existing slot ${idleSlot.slotName} for bot ${botId}`,
		);

		return idleSlot;
	}

	// 2. Check if we can grow the pool
	const currentPoolSize = await getPoolSize(db);

	if (currentPoolSize >= MAX_POOL_SIZE) {
		console.log(
			`[Pool] Pool exhausted (${currentPoolSize}/${MAX_POOL_SIZE}), bot ${botId} must queue`,
		);

		return null;
	}

	// 3. Create a new slot (slow - involves image pull)
	console.log(
		`[Pool] Creating new slot for bot ${botId} (current size: ${currentPoolSize})`,
	);

	return await createAndAcquireNewSlot(botId, db);
}

/**
 * Atomically acquires an idle slot using SELECT FOR UPDATE SKIP LOCKED
 */
async function acquireIdleSlot(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<PoolSlot | null> {
	// Use raw SQL for atomic acquisition with FOR UPDATE SKIP LOCKED
	// Note: db.execute() returns a RowList (array-like), not { rows: [...] }
	const result = await db.execute<{
		id: number;
		coolifyServiceUuid: string;
		slotName: string;
		status: "idle" | "busy" | "error";
		assignedBotId: number | null;
	}>(sql`
		UPDATE ${botPoolSlotsTable}
		SET
			status = 'busy',
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
async function getPoolSize(
	db: PostgresJsDatabase<typeof schema>,
): Promise<number> {
	const result = await db
		.select({ count: sql<number>`count(*)` })
		.from(botPoolSlotsTable);

	return Number(result[0]?.count ?? 0);
}

/**
 * Creates a new pool slot and assigns it to the bot
 * This is slow as it involves creating a Coolify app and pulling the image
 */
async function createAndAcquireNewSlot(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<PoolSlot> {
	// Get bot info to determine the platform/image
	const botResult = await db
		.select()
		.from(botsTable)
		.where(eq(botsTable.id, botId));

	if (!botResult[0]) {
		throw new Error(`Bot ${botId} not found`);
	}

	const bot = botResult[0];
	const image = selectBotImage(bot.meetingInfo);

	// Get platform name for slot naming
	const platformName = getPlatformSlotName(bot.meetingInfo.platform);

	// Generate slot name with platform prefix
	const currentSize = await getPoolSize(db);
	const slotName = `meeboter-pool-${platformName}-${String(currentSize + 1).padStart(3, "0")}`;

	// Create placeholder config for initial deployment
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

	// Create Coolify application (this pulls the image - slow)
	console.log(`[Pool] Creating Coolify application ${slotName}...`);

	const coolifyServiceUuid = await createCoolifyApplication(
		botId,
		image,
		placeholderConfig,
		slotName,
	);

	// Insert slot record
	const insertResult = await db
		.insert(botPoolSlotsTable)
		.values({
			coolifyServiceUuid,
			slotName,
			status: "busy",
			assignedBotId: botId,
			lastUsedAt: new Date(),
		})
		.returning();

	const slot = insertResult[0];

	if (!slot) {
		throw new Error("Failed to insert pool slot");
	}

	// Update Coolify description
	await updateSlotDescription(coolifyServiceUuid, "busy", botId);

	console.log(
		`[Pool] Created new slot ${slotName} with UUID ${coolifyServiceUuid}`,
	);

	return {
		id: slot.id,
		coolifyServiceUuid: slot.coolifyServiceUuid,
		slotName: slot.slotName,
		status: "busy",
		assignedBotId: botId,
	};
}

/**
 * Releases a slot back to the pool after bot completion
 *
 * @param botId - The bot ID to release
 * @param db - Database instance
 */
export async function releaseSlot(
	botId: number,
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	// Find the slot assigned to this bot
	const slotResult = await db
		.select()
		.from(botPoolSlotsTable)
		.where(eq(botPoolSlotsTable.assignedBotId, botId));

	if (!slotResult[0]) {
		console.warn(`[Pool] No slot found for bot ${botId}, nothing to release`);

		return;
	}

	const slot = slotResult[0];

	try {
		// Stop the Coolify container
		console.log(`[Pool] Stopping container for slot ${slot.slotName}`);
		await stopCoolifyApplication(slot.coolifyServiceUuid);

		// Mark slot as idle
		await db
			.update(botPoolSlotsTable)
			.set({
				status: "idle",
				assignedBotId: null,
				lastUsedAt: new Date(),
				errorMessage: null,
				recoveryAttempts: 0,
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		// Update Coolify description
		await updateSlotDescription(slot.coolifyServiceUuid, "idle");

		console.log(`[Pool] Released slot ${slot.slotName}`);
	} catch (error) {
		console.error(`[Pool] Error releasing slot ${slot.slotName}:`, error);

		// Mark slot as error
		await db
			.update(botPoolSlotsTable)
			.set({
				status: "error",
				errorMessage: error instanceof Error ? error.message : "Unknown error",
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		await updateSlotDescription(
			slot.coolifyServiceUuid,
			"error",
			undefined,
			error instanceof Error ? error.message : "Unknown error",
		);
	}
}

/**
 * Updates environment variables and starts a pool slot for a bot
 *
 * @param slot - The pool slot to configure
 * @param botConfig - Bot configuration
 * @param _db - Database instance (reserved for future use)
 */
export async function configureAndStartSlot(
	slot: PoolSlot,
	botConfig: BotConfig,
	_db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	console.log(
		`[Pool] Configuring slot ${slot.slotName} for bot ${botConfig.id}`,
	);

	// Update environment variables
	await updateSlotEnvVars(slot.coolifyServiceUuid, botConfig);

	// Start the container
	console.log(`[Pool] Starting container for slot ${slot.slotName}`);
	await startCoolifyApplication(slot.coolifyServiceUuid);

	// Update description
	await updateSlotDescription(slot.coolifyServiceUuid, "busy", botConfig.id);
}

/**
 * Updates the BOT_DATA environment variable for a slot
 */
async function updateSlotEnvVars(
	applicationUuid: string,
	botConfig: BotConfig,
): Promise<void> {
	// Base64 encode to avoid JSON escaping issues
	const botDataBase64 = Buffer.from(JSON.stringify(botConfig)).toString(
		"base64",
	);

	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}/envs/bulk`,
		{
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				data: [{ key: "BOT_DATA", value: botDataBase64 }],
			}),
		},
	);

	if (!response.ok) {
		console.error(
			`[Pool] Failed to update env vars for ${applicationUuid}:`,
			await response.text(),
		);
	}
}

/**
 * Updates the Coolify application description to reflect pool status
 */
export async function updateSlotDescription(
	applicationUuid: string,
	status: "idle" | "busy" | "error",
	botId?: number,
	errorMessage?: string,
): Promise<void> {
	let description: string;

	switch (status) {
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

	try {
		const response = await fetch(
			`${env.COOLIFY_API_URL}/applications/${applicationUuid}`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ description }),
			},
		);

		if (!response.ok) {
			console.error(
				`[Pool] Failed to update description for ${applicationUuid}:`,
				await response.text(),
			);
		}
	} catch (error) {
		console.error(`[Pool] Error updating description:`, error);
	}
}

/**
 * Marks a slot as error state
 */
export async function markSlotError(
	slotId: number,
	errorMessage: string,
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	const slotResult = await db
		.select()
		.from(botPoolSlotsTable)
		.where(eq(botPoolSlotsTable.id, slotId));

	if (!slotResult[0]) return;

	const slot = slotResult[0];

	await db
		.update(botPoolSlotsTable)
		.set({
			status: "error",
			errorMessage,
		})
		.where(eq(botPoolSlotsTable.id, slotId));

	await updateSlotDescription(
		slot.coolifyServiceUuid,
		"error",
		undefined,
		errorMessage,
	);
}

/**
 * Gets pool statistics for monitoring
 */
export async function getPoolStats(
	db: PostgresJsDatabase<typeof schema>,
): Promise<{
	total: number;
	idle: number;
	busy: number;
	error: number;
	maxSize: number;
}> {
	const result = await db
		.select({
			status: botPoolSlotsTable.status,
			count: sql<number>`count(*)`,
		})
		.from(botPoolSlotsTable)
		.groupBy(botPoolSlotsTable.status);

	const stats = {
		total: 0,
		idle: 0,
		busy: 0,
		error: 0,
		maxSize: MAX_POOL_SIZE,
	};

	for (const row of result) {
		const count = Number(row.count);
		stats.total += count;

		if (row.status === "idle") stats.idle = count;

		if (row.status === "busy") stats.busy = count;

		if (row.status === "error") stats.error = count;
	}

	return stats;
}
