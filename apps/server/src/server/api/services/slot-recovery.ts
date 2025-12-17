import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import {
	botPoolSlotsTable,
	type SelectBotPoolSlotType,
} from "@/server/database/schema";
import { updateSlotDescription } from "./bot-pool-manager";
import {
	deleteCoolifyApplication,
	stopCoolifyApplication,
} from "./coolify-deployment";

/** How often to run the recovery job (5 minutes) */
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

/** Maximum recovery attempts before deleting the slot */
const MAX_RECOVERY_ATTEMPTS = 3;

interface RecoveryResult {
	recovered: number;
	failed: number;
	deleted: number;
}

/**
 * Starts the background slot recovery job
 *
 * Runs every 5 minutes to attempt recovery of error slots.
 * Should be called once at server startup.
 *
 * @param db - Database instance
 */
export function startSlotRecoveryJob(
	db: PostgresJsDatabase<typeof schema>,
): void {
	console.log(
		"[Recovery] Starting slot recovery job (interval: 5min, max attempts: 3)",
	);

	// Run immediately on startup
	recoverErrorSlots(db);

	// Then run every interval
	setInterval(() => {
		recoverErrorSlots(db);
	}, RECOVERY_INTERVAL_MS);
}

/**
 * Attempts to recover all error slots
 *
 * For each slot in error state:
 * - If max attempts exceeded: delete slot permanently
 * - Otherwise: attempt recovery by stopping container and resetting to idle
 */
async function recoverErrorSlots(
	db: PostgresJsDatabase<typeof schema>,
): Promise<RecoveryResult> {
	const result: RecoveryResult = { recovered: 0, failed: 0, deleted: 0 };

	try {
		const errorSlots = await db
			.select()
			.from(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.status, "error"));

		if (errorSlots.length === 0) {
			return result;
		}

		console.log(`[Recovery] Found ${errorSlots.length} error slots to process`);

		for (const slot of errorSlots) {
			if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
				await deleteSlotPermanently(slot, db);
				result.deleted++;

				continue;
			}

			const success = await attemptSlotRecovery(slot, db);

			if (success) {
				result.recovered++;
			} else {
				result.failed++;
			}
		}

		console.log(
			`[Recovery] Results: recovered=${result.recovered} failed=${result.failed} deleted=${result.deleted}`,
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
	db: PostgresJsDatabase<typeof schema>,
): Promise<boolean> {
	const attemptNumber = slot.recoveryAttempts + 1;

	console.log(
		`[Recovery] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
	);

	try {
		// Force stop the Coolify container
		await stopCoolifyApplication(slot.coolifyServiceUuid);

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
		await updateSlotDescription(slot.coolifyServiceUuid, "idle");

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
	db: PostgresJsDatabase<typeof schema>,
): Promise<void> {
	console.log(
		`[Recovery] Deleting permanently failed slot ${slot.slotName} (attempts: ${slot.recoveryAttempts})`,
	);

	// Try to delete from Coolify
	try {
		await deleteCoolifyApplication(slot.coolifyServiceUuid);
	} catch (error) {
		console.error(
			`[Recovery] Failed to delete Coolify app ${slot.coolifyServiceUuid}:`,
			error,
		);
		// Continue with DB deletion anyway
	}

	// Delete from database
	await db.delete(botPoolSlotsTable).where(eq(botPoolSlotsTable.id, slot.id));

	console.log(`[Recovery] Deleted slot ${slot.slotName}`);
}
