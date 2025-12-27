/**
 * CoolifyRecoveryStrategy - Recovers stuck pool slots on Coolify platform
 *
 * ## Workflow
 *
 *   Find slots: ERROR | DEPLOYING(>15min) | HEALTHY(no bot)
 *                              │
 *                              ▼
 *              ┌───────────────────────────────┐
 *              │  Bot has recent heartbeat?    │
 *              └───────────────┬───────────────┘
 *                    YES       │       NO
 *                     │        │        │
 *           ┌─────────┘        │        └─────────┐
 *           ▼                  │                  ▼
 *   Bump timestamp             │         ┌───────────────────┐
 *   (skip recovery)            │         │ attempts >= 3?    │
 *                              │         └─────────┬─────────┘
 *                              │            YES    │    NO
 *                              │             │     │     │
 *                              │    ┌────────┘     │     └────────┐
 *                              │    ▼              │              ▼
 *                              │ Delete slot       │    Stop container
 *                              │ permanently       │    Reset to IDLE
 *                              │                   │    Mark bot FATAL
 *                              └───────────────────┘
 *
 * Note: Stuck DEPLOYING bots handled by OrphanedDeployingStrategy
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { BotPoolService } from "@/server/api/services/platform/coolify/bot-pool-service";
import type { CoolifyService } from "@/server/api/services/platform/coolify/coolify-api-client";
import type * as schema from "@/server/database/schema";
import {
	botPoolSlotsTable,
	botsTable,
	type SelectBotPoolSlotType,
} from "@/server/database/schema";

import type { RecoveryResult, RecoveryStrategy } from "../bot-recovery-worker";

/** Maximum recovery attempts before deleting the slot */
const MAX_RECOVERY_ATTEMPTS = 3;

/** Timeout for deploying slots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" (5 minutes) */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

/** Number of skipped recoveries before fixing slot status to "HEALTHY" */
const MAX_SKIPPED_RECOVERIES = 3;

interface CoolifyRecoveryResult extends RecoveryResult {
	deleted: number;
	skipped: number;
}

export class CoolifyRecoveryStrategy implements RecoveryStrategy {
	readonly name = "CoolifyRecovery";

	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly coolifyService: CoolifyService | undefined,
		private readonly poolService: BotPoolService | undefined,
	) {}

	async recover(): Promise<CoolifyRecoveryResult> {
		const result: CoolifyRecoveryResult = {
			recovered: 0,
			failed: 0,
			deleted: 0,
			skipped: 0,
		};

		if (!this.coolifyService || !this.poolService) {
			return result;
		}

		await this.recoverStuckSlots(result);

		return result;
	}

	// ─── Slot Recovery ────────────────────────────────────────────────────────────

	/**
	 * Recovers stuck Coolify pool slots.
	 */
	private async recoverStuckSlots(
		result: CoolifyRecoveryResult,
	): Promise<void> {
		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		// Find slots that are:
		// 1. In error state
		// 2. Stuck in deploying state (>15 min)
		// 3. Busy but with no assigned bot (orphaned due to bot deletion)
		const stuckSlots = await this.db
			.select()
			.from(botPoolSlotsTable)
			.where(
				or(
					eq(botPoolSlotsTable.status, "ERROR"),
					and(
						eq(botPoolSlotsTable.status, "DEPLOYING"),
						lt(botPoolSlotsTable.lastUsedAt, staleDeployingCutoff),
					),
					and(
						eq(botPoolSlotsTable.status, "HEALTHY"),
						isNull(botPoolSlotsTable.assignedBotId),
					),
				),
			);

		if (stuckSlots.length === 0) {
			return;
		}

		console.log(
			`[${this.name}] Found ${stuckSlots.length} stuck Coolify slots to process`,
		);

		for (const slot of stuckSlots) {
			// Check if bot is actually alive before recovery (only for deploying slots with assigned bots)
			// Orphaned busy slots (no assignedBotId) skip this check and go straight to recovery
			if (slot.assignedBotId && slot.status === "DEPLOYING") {
				const skipResult = await this.checkBotHeartbeatBeforeRecovery(slot);

				if (skipResult.skip) {
					if (skipResult.fixStatus) {
						await this.fixSlotStatusToHealthy(slot);
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

			const recoveryResult = await this.attemptSlotRecovery(slot);

			if (recoveryResult.success) {
				result.recovered++;
			} else {
				result.failed++;
			}
		}
	}

	// ─── Heartbeat Checking ───────────────────────────────────────────────────────

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
	 * Fixes a slot's status to "HEALTHY" when the bot is clearly alive.
	 */
	private async fixSlotStatusToHealthy(
		slot: SelectBotPoolSlotType,
	): Promise<void> {
		await this.db
			.update(botPoolSlotsTable)
			.set({
				status: "HEALTHY",
				recoveryAttempts: 0,
				lastUsedAt: new Date(),
			})
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(
			`[${this.name}] Fixed slot ${slot.slotName} status to "HEALTHY" - bot is alive with heartbeats`,
		);
	}

	// ─── Slot Recovery Operations ─────────────────────────────────────────────────

	/**
	 * Attempts to recover a single slot by stopping container and resetting to idle.
	 */
	private async attemptSlotRecovery(
		slot: SelectBotPoolSlotType,
	): Promise<{ success: boolean }> {
		const attemptNumber = slot.recoveryAttempts + 1;

		console.log(
			`[${this.name}] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
		);

		try {
			// Update assigned bot status to FATAL before clearing the slot
			if (slot.assignedBotId) {
				await this.db
					.update(botsTable)
					.set({ status: "FATAL", endTime: new Date() })
					.where(eq(botsTable.id, slot.assignedBotId));

				console.log(
					`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} recovered)`,
				);
			}

			// Force stop the Coolify container
			await this.coolifyService?.stopApplication(slot.applicationUuid);

			// Reset slot to IDLE state
			await this.db
				.update(botPoolSlotsTable)
				.set({
					status: "IDLE",
					assignedBotId: null,
					errorMessage: null,
					recoveryAttempts: 0,
					lastUsedAt: new Date(),
				})
				.where(eq(botPoolSlotsTable.id, slot.id));

			// Update Coolify description
			const description = `[IDLE] Available - Last used: ${new Date().toISOString()}`;

			await this.coolifyService?.updateDescription(
				slot.applicationUuid,
				description,
			);

			console.log(`[${this.name}] Successfully recovered ${slot.slotName}`);

			return { success: true };
		} catch (error) {
			await this.db
				.update(botPoolSlotsTable)
				.set({ recoveryAttempts: attemptNumber })
				.where(eq(botPoolSlotsTable.id, slot.id));

			console.error(
				`[${this.name}] Failed to recover ${slot.slotName}:`,
				error,
			);

			return { success: false };
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
				.set({ status: "FATAL", endTime: new Date() })
				.where(eq(botsTable.id, slot.assignedBotId));

			console.log(
				`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} deleted)`,
			);
		}

		// Try to delete from Coolify
		try {
			await this.coolifyService?.deleteApplication(slot.applicationUuid);
		} catch (error) {
			console.error(
				`[${this.name}] Failed to delete Coolify app ${slot.applicationUuid}:`,
				error,
			);
		}

		// Delete from database
		await this.db
			.delete(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(`[${this.name}] Deleted slot ${slot.slotName}`);
	}
}
