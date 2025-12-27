/**
 * AWSRecoveryStrategy - Recovers stuck bots on AWS ECS platform
 *
 * Handles:
 * 1. Stuck DEPLOYING bots - Bots deploying >15min with no heartbeat
 * 2. Orphaned Bots - Active bots whose ECS tasks no longer exist
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { AWSPlatformService } from "@/server/api/services/platform/aws/aws-platform-service";
import type * as schema from "@/server/database/schema";
import { botsTable } from "@/server/database/schema";

import type { RecoveryResult, RecoveryStrategy } from "../bot-recovery-worker";

/** Timeout for deploying bots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" (5 minutes) */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

interface AWSRecoveryResult extends RecoveryResult {
	stuckDeploying: number;
	orphanedTasks: number;
}

export class AWSRecoveryStrategy implements RecoveryStrategy {
	readonly name = "AWSRecovery";

	constructor(
		private readonly db: PostgresJsDatabase<typeof schema>,
		private readonly awsService: AWSPlatformService | undefined,
	) {}

	async recover(): Promise<AWSRecoveryResult> {
		const result: AWSRecoveryResult = {
			recovered: 0,
			failed: 0,
			stuckDeploying: 0,
			orphanedTasks: 0,
		};

		if (!this.awsService) {
			return result;
		}

		await this.cleanupStuckDeployingBots(result);
		await this.cleanupOrphanedTasks(result);

		return result;
	}

	// ─── Stuck Deploying Bots ────────────────────────────────────────────────────

	private async cleanupStuckDeployingBots(
		result: AWSRecoveryResult,
	): Promise<void> {
		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		const heartbeatFreshnessCutoff = new Date(
			Date.now() - HEARTBEAT_FRESHNESS_MS,
		);

		const stuckBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.status, "DEPLOYING"),
				eq(botsTable.deploymentPlatform, "aws"),
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
			`[${this.name}] Found ${stuckBots.length} AWS bots stuck in DEPLOYING`,
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
						await this.awsService?.stopBot(bot.platformIdentifier);

						console.log(
							`[${this.name}] Stopped ECS task ${bot.platformIdentifier}`,
						);
					} catch {
						console.log(
							`[${this.name}] ECS task ${bot.platformIdentifier} already stopped`,
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

	// ─── Orphaned Tasks ──────────────────────────────────────────────────────────

	/**
	 * Finds active bots whose ECS tasks no longer exist and marks them as FATAL.
	 * Does NOT process FATAL bots (they're already terminal).
	 */
	private async cleanupOrphanedTasks(result: AWSRecoveryResult): Promise<void> {
		// Find active bots (not FATAL/DONE) that might have orphaned tasks
		const activeBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.deploymentPlatform, "aws"),
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

			// Skip bots with recent heartbeat (task is alive)
			if (bot.lastHeartbeat && bot.lastHeartbeat > staleHeartbeatThreshold) {
				continue;
			}

			// Check if task exists in ECS (returns FAILED if not found)
			const status = await this.awsService?.getBotStatus(
				bot.platformIdentifier,
			);

			if (status === "FAILED" || status === "STOPPED") {
				console.log(
					`[${this.name}] Found orphaned bot ${bot.id} - task ${bot.platformIdentifier} is ${status}`,
				);

				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, bot.id));

				result.recovered++;
				result.orphanedTasks++;
			}
		}
	}
}
