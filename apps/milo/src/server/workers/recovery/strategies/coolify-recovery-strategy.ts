/**
 * CoolifyRecoveryStrategy - Recovers stuck pool slots on Coolify platform
 *
 * Handles:
 * 1. ERROR slots - Deployment failed, container crashed
 * 2. Stale DEPLOYING slots - Stuck >15min without heartbeat
 * 3. Orphaned HEALTHY slots - Bot deleted but slot still marked as busy
 * 4. Stuck DEPLOYING bots - Bot stuck in DEPLOYING status with HEALTHY slot
 *
 * Recovery process:
 * - Check if bot has recent heartbeat before recovery
 * - After 3 skipped recoveries, fix status to "HEALTHY"
 * - After 3 failed recoveries, delete slot permanently
 * - Release bot from deployment queue on recovery/deletion
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { DeploymentQueueService } from "@/server/api/services/deployment-queue-service";
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
	deploymentQueueReleased: number;
}

export class CoolifyRecoveryStrategy implements RecoveryStrategy {
	readonly name = "CoolifyRecovery";

	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly coolifyService: CoolifyService | undefined,
		private readonly poolService: BotPoolService | undefined,
		private readonly deploymentQueue: DeploymentQueueService | undefined,
	) {}

	async recover(): Promise<CoolifyRecoveryResult> {
		const result: CoolifyRecoveryResult = {
			recovered: 0,
			failed: 0,
			deleted: 0,
			skipped: 0,
			deploymentQueueReleased: 0,
		};

		if (!this.coolifyService || !this.poolService) {
			return result;
		}

		// Log deployment queue stats for observability
		this.logDeploymentQueueStats();

		await this.recoverStuckSlots(result);
		await this.recoverStuckDeployingBots(result);

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
				const released = await this.deleteSlotPermanently(slot);
				result.deleted++;

				if (released) {
					result.deploymentQueueReleased++;
				}

				continue;
			}

			const recoveryResult = await this.attemptSlotRecovery(slot);

			if (recoveryResult.success) {
				result.recovered++;
			} else {
				result.failed++;
			}

			if (recoveryResult.deploymentQueueReleased) {
				result.deploymentQueueReleased++;
			}
		}
	}

	// ─── Stuck DEPLOYING Bots ────────────────────────────────────────────────────

	/**
	 * Recovers bots stuck in DEPLOYING status with HEALTHY slots.
	 *
	 * This catches a gap where:
	 * - Slot transitioned to HEALTHY (container started)
	 * - But bot never sent a heartbeat (process crashed or failed to start)
	 * - Bot remains in DEPLOYING status forever
	 *
	 * This is NOT caught by recoverStuckSlots because the slot is HEALTHY.
	 */
	private async recoverStuckDeployingBots(
		result: CoolifyRecoveryResult,
	): Promise<void> {
		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		const heartbeatFreshnessCutoff = new Date(
			Date.now() - HEARTBEAT_FRESHNESS_MS,
		);

		// Find HEALTHY slots where the assigned bot is stuck in DEPLOYING
		const stuckBots = await this.db
			.select({
				botId: botsTable.id,
				botCreatedAt: botsTable.createdAt,
				botLastHeartbeat: botsTable.lastHeartbeat,
				slotId: botPoolSlotsTable.id,
				slotName: botPoolSlotsTable.slotName,
				applicationUuid: botPoolSlotsTable.applicationUuid,
			})
			.from(botPoolSlotsTable)
			.innerJoin(botsTable, eq(botPoolSlotsTable.assignedBotId, botsTable.id))
			.where(
				and(
					eq(botPoolSlotsTable.status, "HEALTHY"),
					eq(botsTable.status, "DEPLOYING"),
					lt(botsTable.createdAt, staleDeployingCutoff),
				),
			);

		if (stuckBots.length === 0) {
			return;
		}

		console.log(
			`[${this.name}] Found ${stuckBots.length} bots stuck in DEPLOYING with HEALTHY slots`,
		);

		for (const bot of stuckBots) {
			// Skip if bot has recent heartbeat (it's alive, just status wasn't updated)
			if (
				bot.botLastHeartbeat &&
				bot.botLastHeartbeat.getTime() > heartbeatFreshnessCutoff.getTime()
			) {
				console.log(
					`[${this.name}] Bot ${bot.botId} has recent heartbeat, updating to JOINING_CALL`,
				);

				await this.db
					.update(botsTable)
					.set({ status: "JOINING_CALL" })
					.where(eq(botsTable.id, bot.botId));

				result.recovered++;

				continue;
			}

			// Bot is truly stuck - mark as FATAL and recover slot
			console.log(
				`[${this.name}] Recovering stuck bot ${bot.botId} (slot: ${bot.slotName}, created: ${bot.botCreatedAt?.toISOString() ?? "unknown"})`,
			);

			try {
				// Mark bot as FATAL
				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, bot.botId));

				// Release from deployment queue
				this.releaseFromDeploymentQueue(bot.botId);
				result.deploymentQueueReleased++;

				// Stop the Coolify container
				await this.coolifyService?.stopApplication(bot.applicationUuid);

				// Reset slot to IDLE
				await this.db
					.update(botPoolSlotsTable)
					.set({
						status: "IDLE",
						assignedBotId: null,
						errorMessage: null,
						recoveryAttempts: 0,
						lastUsedAt: new Date(),
					})
					.where(eq(botPoolSlotsTable.id, bot.slotId));

				// Update Coolify description
				const description = `[IDLE] Available - Last used: ${new Date().toISOString()}`;

				await this.coolifyService?.updateDescription(
					bot.applicationUuid,
					description,
				);

				console.log(
					`[${this.name}] Recovered stuck bot ${bot.botId} and released slot ${bot.slotName}`,
				);

				result.recovered++;
			} catch (error) {
				console.error(
					`[${this.name}] Failed to recover stuck bot ${bot.botId}:`,
					error,
				);

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
	): Promise<{ success: boolean; deploymentQueueReleased: boolean }> {
		const attemptNumber = slot.recoveryAttempts + 1;
		let deploymentQueueReleased = false;

		console.log(
			`[${this.name}] Attempting recovery for ${slot.slotName} (attempt ${attemptNumber}/${MAX_RECOVERY_ATTEMPTS})`,
		);

		try {
			// Update assigned bot status to FATAL before clearing the slot
			if (slot.assignedBotId) {
				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, slot.assignedBotId));

				console.log(
					`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} recovered)`,
				);

				// Release from in-memory deployment queue to prevent stuck slots
				deploymentQueueReleased = this.releaseFromDeploymentQueue(
					slot.assignedBotId,
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

			return { success: true, deploymentQueueReleased };
		} catch (error) {
			await this.db
				.update(botPoolSlotsTable)
				.set({ recoveryAttempts: attemptNumber })
				.where(eq(botPoolSlotsTable.id, slot.id));

			console.error(
				`[${this.name}] Failed to recover ${slot.slotName}:`,
				error,
			);

			return { success: false, deploymentQueueReleased };
		}
	}

	/**
	 * Permanently deletes a slot that has exceeded max recovery attempts.
	 */
	private async deleteSlotPermanently(
		slot: SelectBotPoolSlotType,
	): Promise<boolean> {
		let deploymentQueueReleased = false;

		console.log(
			`[${this.name}] Deleting permanently failed slot ${slot.slotName} (attempts: ${slot.recoveryAttempts})`,
		);

		// Update assigned bot status to FATAL before deleting the slot
		if (slot.assignedBotId) {
			await this.db
				.update(botsTable)
				.set({ status: "FATAL" })
				.where(eq(botsTable.id, slot.assignedBotId));

			console.log(
				`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} deleted)`,
			);

			// Release from in-memory deployment queue to prevent stuck slots
			deploymentQueueReleased = this.releaseFromDeploymentQueue(
				slot.assignedBotId,
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

		return deploymentQueueReleased;
	}

	// ─── Deployment Queue Management ──────────────────────────────────────────────

	/**
	 * Releases a bot from the in-memory deployment queue.
	 */
	private releaseFromDeploymentQueue(botId: number): boolean {
		if (!this.deploymentQueue) {
			return false;
		}

		const botIdStr = String(botId);

		// The release method is idempotent, it will log if not found
		this.deploymentQueue.release(botIdStr);

		console.log(
			`[${this.name}] Released bot ${botId} from deployment queue (sync recovery)`,
		);

		return true;
	}

	/**
	 * Logs deployment queue statistics for observability.
	 */
	private logDeploymentQueueStats(): void {
		if (!this.deploymentQueue) {
			return;
		}

		const stats = this.deploymentQueue.getStats();

		console.log(
			`[${this.name}] DeploymentQueue stats: active=${stats.active}/${stats.maxConcurrent}, queued=${stats.queued}`,
		);

		// Warn if queue is building up (potential stuck condition)
		if (stats.queued > 10) {
			console.warn(
				`[${this.name}] DeploymentQueue has ${stats.queued} waiting deployments (possible stuck condition)`,
			);
		}

		// Warn if at capacity for extended period
		if (stats.active >= stats.maxConcurrent && stats.queued > 0) {
			console.warn(
				`[${this.name}] DeploymentQueue at capacity (${stats.active}/${stats.maxConcurrent}) with ${stats.queued} waiting`,
			);
		}
	}
}
