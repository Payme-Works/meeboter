/**
 * BotRecoveryWorker - Monitors and recovers stuck bots across all platforms
 *
 * ## Platform-Agnostic Bot Recovery
 *
 * This worker handles recovery for all deployment platforms:
 * - Coolify: Pool slot recovery (IDLE/DEPLOYING/HEALTHY/ERROR states)
 * - Kubernetes: Job cleanup for stuck deployments
 * - AWS ECS: Task cleanup for stuck deployments
 *
 * ## Coolify Slot Status Flow (when platform=coolify)
 *
 * Normal lifecycle:
 *   IDLE → DEPLOYING → HEALTHY → IDLE (released)
 *
 * Error scenarios handled by this worker:
 *   DEPLOYING → ERROR (deployment failed) → IDLE (recovered)
 *   DEPLOYING → [stuck >15min] → IDLE (recovered)
 *   HEALTHY → [bot deleted, FK sets assignedBotId=NULL] → IDLE (recovered)
 *
 * ## Recovery Scenarios
 *
 * 1. ERROR slots (Coolify only):
 *    - Slot status = "ERROR"
 *    - Action: Stop container, reset to IDLE
 *    - Example: Coolify deployment failed, container crashed
 *
 * 2. STALE DEPLOYING slots (Coolify only):
 *    - Slot status = "DEPLOYING" AND lastUsedAt > 15 minutes ago
 *    - BUT if bot has recent heartbeat, skip recovery (bot is alive)
 *    - After 3 skipped recoveries, fix status to "HEALTHY"
 *    - Example: Container started but status wasn't updated
 *
 * 3. ORPHANED HEALTHY slots (Coolify only):
 *    - Slot status = "HEALTHY" AND assignedBotId IS NULL
 *    - Action: Stop container, reset to IDLE
 *    - Example: Bot was deleted (via API or user cascade), FK set
 *      assignedBotId to NULL but status remained "HEALTHY"
 *
 * 4. Platform resource cleanup (all platforms):
 *    - Bots marked FATAL but platform resources not released
 *    - Action: Call platform.releaseBot() to clean up
 *
 * ## Recovery Process
 *
 * For each stuck slot (Coolify):
 *   1. If DEPLOYING with assigned bot → check bot heartbeat
 *      - Recent heartbeat? Skip recovery (bot is alive)
 *      - After 3 skips → fix status to "HEALTHY"
 *   2. If max attempts (3) reached → delete slot permanently
 *   3. Otherwise → attempt recovery:
 *      - Mark assigned bot as FATAL (if any)
 *      - Stop Coolify container
 *      - Reset slot to IDLE
 *
 * @see BotPoolService for slot acquisition and release logic
 * @see rules/PLATFORM_NOMENCLATURE.md
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";

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

/** Number of skipped recoveries before fixing slot status to "HEALTHY" */
const MAX_SKIPPED_RECOVERIES = 3;

interface BotRecoveryResult extends WorkerResult {
	recovered: number;
	failed: number;
	deleted: number;
	skipped: number;
	deploymentQueueReleased: number;
}

/**
 * Worker that monitors and recovers stuck bots across all platforms.
 *
 * Platform-specific behavior:
 * - Coolify: Recovers stuck pool slots (error, deploying, orphaned)
 * - K8s/AWS: Cleans up orphaned platform resources
 *
 * Handles:
 * - Error slots: attempts recovery by stopping container and resetting to idle
 * - Stale deploying slots: checks if bot has heartbeat before recovering
 * - Permanent deletion: removes slots after 3 failed recovery attempts
 * - Bot FATAL marking: marks assigned bots as FATAL when recovering/deleting
 */
export class BotRecoveryWorker extends BaseWorker<BotRecoveryResult> {
	readonly name = "BotRecoveryWorker";

	protected async execute(): Promise<BotRecoveryResult> {
		const result: BotRecoveryResult = {
			recovered: 0,
			failed: 0,
			deleted: 0,
			skipped: 0,
			deploymentQueueReleased: 0,
		};

		// Log deployment queue stats for observability (Coolify only)
		this.logDeploymentQueueStats();

		// Run Coolify-specific slot recovery if on Coolify platform
		if (this.services.coolify && this.services.pool) {
			await this.recoverCoolifySlots(result);
		}

		// Run platform-agnostic bot cleanup
		await this.cleanupOrphanedBotResources(result);

		return result;
	}

	// ─── Coolify-Specific Recovery ────────────────────────────────────────────────

	/**
	 * Recovers stuck Coolify pool slots.
	 * Only runs when platform is Coolify.
	 */
	private async recoverCoolifySlots(result: BotRecoveryResult): Promise<void> {
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

	// ─── Platform-Agnostic Recovery ───────────────────────────────────────────────

	/**
	 * Cleans up orphaned bot resources across all platforms.
	 *
	 * Finds bots that are FATAL but may still have platform resources
	 * (K8s Jobs, AWS tasks) that weren't properly cleaned up.
	 */
	private async cleanupOrphanedBotResources(
		result: BotRecoveryResult,
	): Promise<void> {
		// For K8s: Clean up Jobs for FATAL bots
		if (this.services.k8s) {
			await this.cleanupK8sOrphanedJobs(result);
		}

		// For AWS: Clean up ECS tasks for FATAL bots
		if (this.services.aws) {
			await this.cleanupAWSOrphanedTasks(result);
		}
	}

	/**
	 * Cleans up orphaned K8s Jobs for bots that are FATAL.
	 */
	private async cleanupK8sOrphanedJobs(
		result: BotRecoveryResult,
	): Promise<void> {
		// Find FATAL bots with K8s platform identifiers that might still have running Jobs
		const fatalBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.status, "FATAL"),
				eq(botsTable.deploymentPlatform, "k8s"),
			),
			columns: {
				id: true,
				platformIdentifier: true,
			},
		});

		for (const bot of fatalBots) {
			if (!bot.platformIdentifier) continue;

			try {
				// Check if Job still exists and stop it
				const job = await this.services.k8s!.getJob(bot.platformIdentifier);

				if (job) {
					console.log(
						`[${this.name}] Cleaning up orphaned K8s Job ${bot.platformIdentifier} for FATAL bot ${bot.id}`,
					);

					await this.services.k8s!.stopBot(bot.platformIdentifier);
					result.recovered++;
				}
			} catch (error) {
				// Job might already be deleted, which is fine
				console.log(
					`[${this.name}] K8s Job ${bot.platformIdentifier} already cleaned up or not found`,
				);
			}
		}
	}

	/**
	 * Cleans up orphaned AWS ECS tasks for bots that are FATAL.
	 */
	private async cleanupAWSOrphanedTasks(
		_result: BotRecoveryResult,
	): Promise<void> {
		// AWS ECS tasks are typically cleaned up automatically
		// This is a placeholder for future AWS-specific cleanup logic
		// The AWS platform service's stopBot() is called by BotHealthWorker
		// when marking bots as FATAL
	}

	// ─── Coolify Slot Recovery Helpers ────────────────────────────────────────────

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

	/**
	 * Attempts to recover a single slot by stopping container and resetting to idle.
	 *
	 * @returns Object with success status and whether deployment queue was released
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
			if (!this.services.coolify) {
				console.log(
					`[${this.name}] Coolify service not available, skipping recovery`,
				);

				return { success: false, deploymentQueueReleased: false };
			}

			// Update assigned bot status to FATAL before clearing the slot
			if (slot.assignedBotId) {
				await this.db
					.update(botsTable)
					.set({
						status: "FATAL",
					})
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
			await this.services.coolify.stopApplication(slot.applicationUuid);

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

			await this.services.coolify.updateDescription(
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
	 *
	 * @returns Whether the deployment queue slot was released
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
				.set({
					status: "FATAL",
				})
				.where(eq(botsTable.id, slot.assignedBotId));

			console.log(
				`[${this.name}] Updated bot ${slot.assignedBotId} status to FATAL (slot ${slot.slotName} deleted)`,
			);

			// Release from in-memory deployment queue to prevent stuck slots
			deploymentQueueReleased = this.releaseFromDeploymentQueue(
				slot.assignedBotId,
			);
		}

		// Try to delete from Coolify (only if service is available)
		if (this.services.coolify) {
			try {
				await this.services.coolify.deleteApplication(slot.applicationUuid);
			} catch (error) {
				console.error(
					`[${this.name}] Failed to delete Coolify app ${slot.applicationUuid}:`,
					error,
				);
			}
		}

		// Delete from database
		await this.db
			.delete(botPoolSlotsTable)
			.where(eq(botPoolSlotsTable.id, slot.id));

		console.log(`[${this.name}] Deleted slot ${slot.slotName}`);

		return deploymentQueueReleased;
	}

	/**
	 * Releases a bot from the in-memory deployment queue.
	 *
	 * This ensures the deployment queue stays in sync with recovered/deleted slots,
	 * preventing the queue from getting stuck with stale bot entries.
	 *
	 * @returns true if the bot was in the queue and released, false otherwise
	 */
	private releaseFromDeploymentQueue(botId: number): boolean {
		if (!this.services.deploymentQueue) {
			return false;
		}

		const botIdStr = String(botId);

		// The release method is idempotent, it will log if not found
		this.services.deploymentQueue.release(botIdStr);

		console.log(
			`[${this.name}] Released bot ${botId} from deployment queue (sync recovery)`,
		);

		return true;
	}

	/**
	 * Logs deployment queue statistics for observability.
	 *
	 * Runs every 5 minutes (same as worker interval) to track:
	 * - Active deployments vs max concurrent limit
	 * - Queue depth for waiting deployments
	 */
	private logDeploymentQueueStats(): void {
		if (!this.services.deploymentQueue) {
			return;
		}

		const stats = this.services.deploymentQueue.getStats();

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
