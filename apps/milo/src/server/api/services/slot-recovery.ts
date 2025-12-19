import { and, eq, lt, or } from "drizzle-orm";

import { db } from "@/server/database/db";
import {
	botPoolSlotsTable,
	botsTable,
	type SelectBotPoolSlotType,
} from "@/server/database/schema";
import type { Services } from "./index";

/**
 * Lazily imports services to avoid circular dependency
 * (db.ts -> slot-recovery.ts -> services/index.ts -> db.ts)
 */
async function getServices(): Promise<Services> {
	const { services } = await import("./index");

	return services;
}

/** How often to run the recovery job (5 minutes) */
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum recovery attempts before deleting the slot */
const MAX_RECOVERY_ATTEMPTS = 3;

/** Timeout for deploying slots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" (5 minutes) */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

/** Number of skipped recoveries before fixing slot status to "busy" */
const MAX_SKIPPED_RECOVERIES = 3;

interface RecoveryResult {
	recovered: number;
	failed: number;
	deleted: number;
	skipped: number;
}

/**
 * Checks if a bot has a recent heartbeat, indicating it's still alive.
 * Used to prevent killing active deployments that are just slow.
 *
 * @returns skip: true if recovery should be skipped, fixStatus: true if slot should be fixed to "busy"
 */
async function checkBotHeartbeatBeforeRecovery(
	slot: SelectBotPoolSlotType,
): Promise<{ skip: boolean; fixStatus: boolean }> {
	if (!slot.assignedBotId) {
		return { skip: false, fixStatus: false };
	}

	const bot = await db.query.botsTable.findFirst({
		where: eq(botsTable.id, slot.assignedBotId),
		columns: { lastHeartbeat: true, status: true },
	});

	if (!bot?.lastHeartbeat) {
		return { skip: false, fixStatus: false };
	}

	const heartbeatAge = Date.now() - bot.lastHeartbeat.getTime();

	if (heartbeatAge > HEARTBEAT_FRESHNESS_MS) {
		return { skip: false, fixStatus: false };
	}

	// Bot is alive! Should we fix status or just bump timestamp?
	const shouldFixStatus = slot.recoveryAttempts >= MAX_SKIPPED_RECOVERIES;

	return { skip: true, fixStatus: shouldFixStatus };
}

/**
 * Bumps the slot's lastUsedAt timestamp to give it more time before next check.
 * Also increments recoveryAttempts to track consecutive skips.
 */
async function bumpSlotTimestamp(slot: SelectBotPoolSlotType): Promise<void> {
	await db
		.update(botPoolSlotsTable)
		.set({
			lastUsedAt: new Date(),
			recoveryAttempts: slot.recoveryAttempts + 1,
		})
		.where(eq(botPoolSlotsTable.id, slot.id));

	console.log(
		`[Recovery] Skipped recovery for ${slot.slotName} - bot has recent heartbeat (skip count: ${slot.recoveryAttempts + 1})`,
	);
}

/**
 * Fixes a slot's status to "busy" when the bot is clearly alive (has heartbeats)
 * but the slot is stuck in "deploying" state due to a missed status transition.
 */
async function fixSlotStatusToBusy(slot: SelectBotPoolSlotType): Promise<void> {
	await db
		.update(botPoolSlotsTable)
		.set({
			status: "busy",
			recoveryAttempts: 0,
			lastUsedAt: new Date(),
		})
		.where(eq(botPoolSlotsTable.id, slot.id));

	console.log(
		`[Recovery] Fixed slot ${slot.slotName} status to "busy" - bot is alive with heartbeats`,
	);
}

/**
 * Starts the background slot recovery job
 *
 * Runs every 5 minutes to attempt recovery of error slots and stale deploying slots.
 * Should be called once at server startup.
 */
export function startSlotRecoveryJob(): void {
	console.log(
		"[Recovery] Starting slot recovery job (interval: 5min, max attempts: 3)",
	);

	// Run immediately on startup
	recoverStuckSlots();

	// Then run every interval
	setInterval(() => {
		recoverStuckSlots();
	}, RECOVERY_INTERVAL_MS);
}

/**
 * Attempts to recover stuck slots (error status or stale deploying status)
 *
 * For each stuck slot:
 * - If bot has recent heartbeat: skip recovery (bot is alive, just slow)
 * - If max attempts exceeded: delete slot permanently
 * - Otherwise: attempt recovery by stopping container and resetting to idle
 *
 * A slot in "deploying" status is considered stale if it has been in that
 * state for longer than DEPLOYING_TIMEOUT_MS (15 minutes).
 */
async function recoverStuckSlots(): Promise<RecoveryResult> {
	const result: RecoveryResult = {
		recovered: 0,
		failed: 0,
		deleted: 0,
		skipped: 0,
	};

	try {
		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		// Find slots that are either in error state or stuck in deploying state
		const stuckSlots = await db
			.select()
			.from(botPoolSlotsTable)
			.where(
				or(
					eq(botPoolSlotsTable.status, "error"),
					and(
						eq(botPoolSlotsTable.status, "deploying"),
						lt(botPoolSlotsTable.lastUsedAt, staleDeployingCutoff),
					),
				),
			);

		if (stuckSlots.length === 0) {
			return result;
		}

		console.log(`[Recovery] Found ${stuckSlots.length} stuck slots to process`);

		for (const slot of stuckSlots) {
			// Check if bot is actually alive before recovery (only for deploying slots)
			if (slot.assignedBotId && slot.status === "deploying") {
				const skipResult = await checkBotHeartbeatBeforeRecovery(slot);

				if (skipResult.skip) {
					if (skipResult.fixStatus) {
						// Bot is alive, fix the slot status to "busy"
						await fixSlotStatusToBusy(slot);
					} else {
						// Bot is alive, just bump lastUsedAt to give it more time
						await bumpSlotTimestamp(slot);
					}

					result.skipped++;

					continue;
				}
			}

			if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
				await deleteSlotPermanently(slot);
				result.deleted++;

				continue;
			}

			const success = await attemptSlotRecovery(slot);

			if (success) {
				result.recovered++;
			} else {
				result.failed++;
			}
		}

		console.log(
			`[Recovery] Results: recovered=${result.recovered} failed=${result.failed} deleted=${result.deleted} skipped=${result.skipped}`,
		);
	} catch (error) {
		console.error("[Recovery] Job failed:", error);
	}

	return result;
}

/**
 * Attempts to recover a single slot by stopping container and resetting to idle
 *
 * @returns true if recovery succeeded, false otherwise
 */
async function attemptSlotRecovery(
	slot: SelectBotPoolSlotType,
): Promise<boolean> {
	const attemptNumber = slot.recoveryAttempts + 1;

	console.log(
		`[Recovery] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
	);

	try {
		const services = await getServices();

		if (!services.coolify) {
			console.log(
				"[Recovery] Coolify service not available, skipping recovery",
			);

			return false;
		}

		// Update assigned bot status to FATAL before clearing the slot
		if (slot.assignedBotId) {
			await db
				.update(botsTable)
				.set({
					status: "FATAL",
					deploymentError: `Slot ${slot.slotName} recovered due to ${slot.status} status`,
					coolifyServiceUuid: null,
				})
				.where(eq(botsTable.id, slot.assignedBotId));

			console.log(
				`[Recovery] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} recovered)`,
			);
		}

		// Force stop the Coolify container
		await services.coolify.stopApplication(slot.coolifyServiceUuid);

		// Reset slot to idle state
		await db
			.update(botPoolSlotsTable)
			.set({
				status: "idle",
				assignedBotId: null,
				errorMessage: null,
				recoveryAttempts: 0,
				lastUsedAt: new Date(),
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		// Update Coolify description
		const description = `[IDLE] Available - Last used: ${new Date().toISOString()}`;

		await services.coolify.updateDescription(
			slot.coolifyServiceUuid,
			description,
		);

		console.log(`[Recovery] Successfully recovered ${slot.slotName}`);

		return true;
	} catch (error) {
		// Increment attempt counter
		await db
			.update(botPoolSlotsTable)
			.set({ recoveryAttempts: attemptNumber })
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.error(`[Recovery] Failed to recover ${slot.slotName}:`, error);

		return false;
	}
}

/**
 * Permanently deletes a slot that has exceeded max recovery attempts
 *
 * Deletes from both Coolify and database. The pool will self-heal
 * by creating new slots on demand.
 */
async function deleteSlotPermanently(
	slot: SelectBotPoolSlotType,
): Promise<void> {
	console.log(
		`[Recovery] Deleting permanently failed slot ${slot.slotName} (attempts: ${slot.recoveryAttempts})`,
	);

	// Update assigned bot status to FATAL before deleting the slot
	if (slot.assignedBotId) {
		await db
			.update(botsTable)
			.set({
				status: "FATAL",
				deploymentError: `Slot ${slot.slotName} permanently deleted after ${slot.recoveryAttempts} failed recovery attempts`,
				coolifyServiceUuid: null,
			})
			.where(eq(botsTable.id, slot.assignedBotId));

		console.log(
			`[Recovery] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} deleted)`,
		);
	}

	const services = await getServices();

	// Try to delete from Coolify (only if service is available)
	if (services.coolify) {
		try {
			await services.coolify.deleteApplication(slot.coolifyServiceUuid);
		} catch (error) {
			console.error(
				`[Recovery] Failed to delete Coolify app ${slot.coolifyServiceUuid}:`,
				error,
			);
			// Continue with DB deletion anyway
		}
	}

	// Delete from database
	await db.delete(botPoolSlotsTable).where(eq(botPoolSlotsTable.id, slot.id));

	console.log(`[Recovery] Deleted slot ${slot.slotName}`);
}
