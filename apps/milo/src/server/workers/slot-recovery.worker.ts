import { and, eq, lt, or } from "drizzle-orm";

import {
	botPoolSlotsTable,
	botsTable,
	type SelectBotPoolSlotType,
} from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

/** Maximum recovery attempts before deleting the slot */
const MAX_RECOVERY_ATTEMPTS = 3;

/** Timeout for deploying slots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" (5 minutes) */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

/** Number of skipped recoveries before fixing slot status to "busy" */
const MAX_SKIPPED_RECOVERIES = 3;

interface SlotRecoveryResult extends WorkerResult {
	recovered: number;
	failed: number;
	deleted: number;
	skipped: number;
}

/**
 * Worker that monitors and recovers stuck pool slots.
 *
 * Handles:
 * - Error slots: attempts recovery by stopping container and resetting to idle
 * - Stale deploying slots: checks if bot has heartbeat before recovering
 * - Permanent deletion: removes slots after 3 failed recovery attempts
 * - Bot FATAL marking: marks assigned bots as FATAL when recovering/deleting
 */
export class SlotRecoveryWorker extends BaseWorker<SlotRecoveryResult> {
	readonly name = "SlotRecoveryWorker";

	protected async execute(): Promise<SlotRecoveryResult> {
		const result: SlotRecoveryResult = {
			recovered: 0,
			failed: 0,
			deleted: 0,
			skipped: 0,
		};

		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		// Find slots that are either in error state or stuck in deploying state
		const stuckSlots = await this.db
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

		console.log(
			`[${this.name}] Found ${stuckSlots.length} stuck slots to process`,
		);

		for (const slot of stuckSlots) {
			// Check if bot is actually alive before recovery (only for deploying slots)
			if (slot.assignedBotId && slot.status === "deploying") {
				const skipResult = await this.checkBotHeartbeatBeforeRecovery(slot);

				if (skipResult.skip) {
					if (skipResult.fixStatus) {
						await this.fixSlotStatusToBusy(slot);
					} else {
						await this.bumpSlotTimestamp(slot);
					}

					result.skipped++;

					continue;
				}
			}

			if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
				await this.deleteSlotPermanently(slot);
				result.deleted++;

				continue;
			}

			const success = await this.attemptSlotRecovery(slot);

			if (success) {
				result.recovered++;
			} else {
				result.failed++;
			}
		}

		return result;
	}

	/**
	 * Checks if a bot has a recent heartbeat, indicating it's still alive.
	 */
	private async checkBotHeartbeatBeforeRecovery(
		slot: SelectBotPoolSlotType,
	): Promise<{ skip: boolean; fixStatus: boolean }> {
		if (!slot.assignedBotId) {
			return { skip: false, fixStatus: false };
		}

		const bot = await this.db.query.botsTable.findFirst({
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

		const shouldFixStatus = slot.recoveryAttempts >= MAX_SKIPPED_RECOVERIES;

		return { skip: true, fixStatus: shouldFixStatus };
	}

	/**
	 * Bumps the slot's lastUsedAt timestamp to give it more time.
	 */
	private async bumpSlotTimestamp(slot: SelectBotPoolSlotType): Promise<void> {
		await this.db
			.update(botPoolSlotsTable)
			.set({
				lastUsedAt: new Date(),
				recoveryAttempts: slot.recoveryAttempts + 1,
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(
			`[${this.name}] Skipped recovery for ${slot.slotName} - bot has recent heartbeat (skip count: ${slot.recoveryAttempts + 1})`,
		);
	}

	/**
	 * Fixes a slot's status to "busy" when the bot is clearly alive.
	 */
	private async fixSlotStatusToBusy(
		slot: SelectBotPoolSlotType,
	): Promise<void> {
		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "busy",
				recoveryAttempts: 0,
				lastUsedAt: new Date(),
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(
			`[${this.name}] Fixed slot ${slot.slotName} status to "busy" - bot is alive with heartbeats`,
		);
	}

	/**
	 * Attempts to recover a single slot by stopping container and resetting to idle.
	 */
	private async attemptSlotRecovery(
		slot: SelectBotPoolSlotType,
	): Promise<boolean> {
		const attemptNumber = slot.recoveryAttempts + 1;

		console.log(
			`[${this.name}] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
		);

		try {
			if (!this.services.coolify) {
				console.log(
					`[${this.name}] Coolify service not available, skipping recovery`,
				);

				return false;
			}

			// Update assigned bot status to FATAL before clearing the slot
			if (slot.assignedBotId) {
				await this.db
					.update(botsTable)
					.set({
						status: "FATAL",
						deploymentError: `Slot ${slot.slotName} recovered due to ${slot.status} status`,
						coolifyServiceUuid: null,
					})
					.where(eq(botsTable.id, slot.assignedBotId));

				console.log(
					`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} recovered)`,
				);
			}

			// Force stop the Coolify container
			await this.services.coolify.stopApplication(slot.coolifyServiceUuid);

			// Reset slot to idle state
			await this.db
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

			await this.services.coolify.updateDescription(
				slot.coolifyServiceUuid,
				description,
			);

			console.log(`[${this.name}] Successfully recovered ${slot.slotName}`);

			return true;
		} catch (error) {
			await this.db
				.update(botPoolSlotsTable)
				.set({ recoveryAttempts: attemptNumber })
				.where(eq(botPoolSlotsTable.id, slot.id));

			console.error(
				`[${this.name}] Failed to recover ${slot.slotName}:`,
				error,
			);

			return false;
		}
	}

	/**
	 * Permanently deletes a slot that has exceeded max recovery attempts.
	 */
	private async deleteSlotPermanently(
		slot: SelectBotPoolSlotType,
	): Promise<void> {
		console.log(
			`[${this.name}] Deleting permanently failed slot ${slot.slotName} (attempts: ${slot.recoveryAttempts})`,
		);

		// Update assigned bot status to FATAL before deleting the slot
		if (slot.assignedBotId) {
			await this.db
				.update(botsTable)
				.set({
					status: "FATAL",
					deploymentError: `Slot ${slot.slotName} permanently deleted after ${slot.recoveryAttempts} failed recovery attempts`,
					coolifyServiceUuid: null,
				})
				.where(eq(botsTable.id, slot.assignedBotId));

			console.log(
				`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} deleted)`,
			);
		}

		// Try to delete from Coolify (only if service is available)
		if (this.services.coolify) {
			try {
				await this.services.coolify.deleteApplication(slot.coolifyServiceUuid);
			} catch (error) {
				console.error(
					`[${this.name}] Failed to delete Coolify app ${slot.coolifyServiceUuid}:`,
					error,
				);
			}
		}

		// Delete from database
		await this.db
			.delete(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(`[${this.name}] Deleted slot ${slot.slotName}`);
	}
}
