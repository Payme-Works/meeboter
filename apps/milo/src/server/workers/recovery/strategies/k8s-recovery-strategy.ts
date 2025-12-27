/**
 * K8sRecoveryStrategy - Recovers stuck bots on Kubernetes platform
 *
 * ## Workflow
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                  K8sRecoveryStrategy                    │
 *   └────────────────────────┬────────────────────────────────┘
 *                            │
 *          ┌─────────────────┴─────────────────┐
 *          ▼                                   ▼
 *   Stuck DEPLOYING                      Orphaned Bots
 *   (>15min, no heartbeat)               (Job doesn't exist)
 *          │                                   │
 *          ▼                                   ▼
 *   ┌─────────────────┐                ┌─────────────────┐
 *   │ Recent heartbeat│─YES─► JOINING  │  Check K8s API  │
 *   └────────┬────────┘       _CALL    └────────┬────────┘
 *       NO   │                            404   │
 *            ▼                                  ▼
 *   Stop Job + Mark FATAL               Mark bot as FATAL
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { KubernetesPlatformService } from "@/server/api/services/platform/kubernetes/kubernetes-platform-service";
import type * as schema from "@/server/database/schema";
import { botsTable } from "@/server/database/schema";

import type { RecoveryResult, RecoveryStrategy } from "../bot-recovery-worker";

/** Timeout for deploying bots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" (5 minutes) */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

interface K8sRecoveryResult extends RecoveryResult {
	stuckDeploying: number;
	orphanedJobs: number;
}

export class K8sRecoveryStrategy implements RecoveryStrategy {
	readonly name = "K8sRecovery";

	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly k8sService: KubernetesPlatformService | undefined,
	) {}

	async recover(): Promise<K8sRecoveryResult> {
		const result: K8sRecoveryResult = {
			recovered: 0,
			failed: 0,
			stuckDeploying: 0,
			orphanedJobs: 0,
		};

		if (!this.k8sService) {
			return result;
		}

		await this.cleanupStuckDeployingBots(result);
		await this.cleanupOrphanedJobs(result);

		return result;
	}

	// ─── Stuck Deploying Bots ────────────────────────────────────────────────────

	private async cleanupStuckDeployingBots(
		result: K8sRecoveryResult,
	): Promise<void> {
		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		const heartbeatFreshnessCutoff = new Date(
			Date.now() - HEARTBEAT_FRESHNESS_MS,
		);

		const stuckBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.status, "DEPLOYING"),
				eq(botsTable.deploymentPlatform, "k8s"),
				lt(botsTable.createdAt, staleDeployingCutoff),
			),
			columns: {
				id: true,
				platformIdentifier: true,
				lastHeartbeat: true,
				createdAt: true,
			},
		});

		if (stuckBots.length === 0) {
			return;
		}

		console.log(
			`[${this.name}] Found ${stuckBots.length} K8s bots stuck in DEPLOYING`,
		);

		for (const bot of stuckBots) {
			try {
				// Skip if bot has recent heartbeat (it's alive, just status wasn't updated)
				if (
					bot.lastHeartbeat &&
					bot.lastHeartbeat.getTime() > heartbeatFreshnessCutoff.getTime()
				) {
					console.log(
						`[${this.name}] Bot ${bot.id} has recent heartbeat, updating to JOINING_CALL`,
					);

					await this.db
						.update(botsTable)
						.set({ status: "JOINING_CALL" })
						.where(eq(botsTable.id, bot.id));

					result.recovered++;
					result.stuckDeploying++;

					continue;
				}

				// Bot is truly stuck - clean up
				console.log(
					`[${this.name}] Cleaning up stuck bot ${bot.id} (created: ${bot.createdAt?.toISOString() ?? "unknown"})`,
				);

				if (bot.platformIdentifier) {
					try {
						await this.k8sService?.stopBot(bot.platformIdentifier);

						console.log(
							`[${this.name}] Stopped K8s Job ${bot.platformIdentifier}`,
						);
					} catch {
						console.log(
							`[${this.name}] K8s Job ${bot.platformIdentifier} already stopped`,
						);
					}
				}

				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, bot.id));

				result.recovered++;
				result.stuckDeploying++;
			} catch (error) {
				console.error(`[${this.name}] Failed to recover bot ${bot.id}:`, error);
				result.failed++;
			}
		}
	}

	// ─── Orphaned Jobs ───────────────────────────────────────────────────────────

	/**
	 * Finds active bots whose K8s Jobs no longer exist and marks them as FATAL.
	 * Does NOT process FATAL bots (they're already terminal).
	 */
	private async cleanupOrphanedJobs(result: K8sRecoveryResult): Promise<void> {
		// Find active bots (not FATAL/DONE) that might have orphaned jobs
		const activeBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.deploymentPlatform, "k8s"),
				inArray(botsTable.status, [
					"DEPLOYING",
					"JOINING_CALL",
					"IN_WAITING_ROOM",
					"IN_CALL",
					"LEAVING",
				]),
			),
			columns: {
				id: true,
				platformIdentifier: true,
				lastHeartbeat: true,
			},
		});

		const staleHeartbeatThreshold = new Date(Date.now() - 5 * 60 * 1000);

		for (const bot of activeBots) {
			if (!bot.platformIdentifier) continue;

			// Skip bots with recent heartbeat (job is alive)
			if (bot.lastHeartbeat && bot.lastHeartbeat > staleHeartbeatThreshold) {
				continue;
			}

			try {
				// Check if job exists in K8s
				const job = await this.k8sService?.getJob(bot.platformIdentifier);

				// If job doesn't exist, mark bot as FATAL
				if (!job) {
					console.log(
						`[${this.name}] Found orphaned bot ${bot.id} - job ${bot.platformIdentifier} no longer exists`,
					);

					await this.db
						.update(botsTable)
						.set({ status: "FATAL" })
						.where(eq(botsTable.id, bot.id));

					result.recovered++;
					result.orphanedJobs++;
				}
			} catch {
				// Job lookup failed - likely doesn't exist, mark as FATAL
				console.log(
					`[${this.name}] Found orphaned bot ${bot.id} - job ${bot.platformIdentifier} lookup failed`,
				);

				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, bot.id));

				result.recovered++;
				result.orphanedJobs++;
			}
		}
	}
}
