/**
 * K8sRecoveryStrategy - Recovers stuck bots on Kubernetes platform
 *
 * Handles:
 * 1. Stuck DEPLOYING bots - Bots deploying >15min with no heartbeat
 * 2. Orphaned Jobs - K8s Jobs for bots marked as FATAL
 */

import { and, eq, lt } from "drizzle-orm";
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

	private async cleanupOrphanedJobs(result: K8sRecoveryResult): Promise<void> {
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
				const job = await this.k8sService?.getJob(bot.platformIdentifier);

				if (job) {
					console.log(
						`[${this.name}] Cleaning up orphaned Job ${bot.platformIdentifier} for bot ${bot.id}`,
					);

					await this.k8sService?.stopBot(bot.platformIdentifier);
					result.recovered++;
					result.orphanedJobs++;
				}
			} catch {
				console.log(
					`[${this.name}] Job ${bot.platformIdentifier} already cleaned up`,
				);
			}
		}
	}
}
