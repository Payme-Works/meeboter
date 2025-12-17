import { eq } from "drizzle-orm";

import { db } from "@/server/database/db";
import {
	botPoolSlotsTable,
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
 */
export function startSlotRecoveryJob(): void {
	console.log(
		"[Recovery] Starting slot recovery job (interval: 5min, max attempts: 3)",
	);

	// Run immediately on startup
	recoverErrorSlots();

	// Then run every interval
	setInterval(() => {
		recoverErrorSlots();
	}, RECOVERY_INTERVAL_MS);
}

/**
 * Attempts to recover all error slots
 *
 * For each slot in error state:
 * - If max attempts exceeded: delete slot permanently
 * - Otherwise: attempt recovery by stopping container and resetting to idle
 */
async function recoverErrorSlots(): Promise<RecoveryResult> {
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
): Promise<boolean> {
	const attemptNumber = slot.recoveryAttempts + 1;

	console.log(
		`[Recovery] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
	);

	try {
		const services = await getServices();

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

	const services = await getServices();

	// Try to delete from Coolify
	try {
		await services.coolify.deleteApplication(slot.coolifyServiceUuid);
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
