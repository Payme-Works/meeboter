/**
 * OrphanedDeployingStrategy - Recovers ALL bots stuck in DEPLOYING status
 *
 * ## Workflow
 *
 *   Bot with status = DEPLOYING
 *              │
 *              ▼
 *   ┌─────────────────────────┐
 *   │  createdAt > 15min ago? │
 *   └────────────┬────────────┘
 *          YES   │
 *                ▼
 *   ┌─────────────────────────┐
 *   │    Mark bot as FATAL    │
 *   └─────────────────────────┘
 *
 * ## Coverage (platform-agnostic safety net)
 *
 *   ✓ Deployment failed before platform was set
 *   ✓ Platform deployment succeeded but bot process never started
 *   ✓ Bot process started but never sent first heartbeat
 *   ✓ Container running (HEALTHY slot) but bot stuck in DEPLOYING
 */

import { and, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import { botsTable } from "@/server/database/schema";

import type { RecoveryResult, RecoveryStrategy } from "../bot-recovery-worker";

/** Timeout for deploying bots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

export class OrphanedDeployingStrategy implements RecoveryStrategy {
	readonly name = "OrphanedDeploying";

	constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

	async recover(): Promise<RecoveryResult> {
		const result: RecoveryResult = { recovered: 0, failed: 0 };

		const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		const orphanedBots = await this.db.query.botsTable.findMany({
			where: and(
				eq(botsTable.status, "DEPLOYING"),
				lt(botsTable.createdAt, staleDeployingCutoff),
			),
			columns: {
				id: true,
				createdAt: true,
			},
		});

		if (orphanedBots.length === 0) {
			return result;
		}

		console.log(
			`[${this.name}] Found ${orphanedBots.length} bots stuck in DEPLOYING status`,
		);

		for (const bot of orphanedBots) {
			try {
				console.log(
					`[${this.name}] Marking bot ${bot.id} as FATAL (created: ${bot.createdAt?.toISOString() ?? "unknown"})`,
				);

				await this.db
					.update(botsTable)
					.set({ status: "FATAL" })
					.where(eq(botsTable.id, bot.id));

				result.recovered++;
			} catch (error) {
				console.error(`[${this.name}] Failed to recover bot ${bot.id}:`, error);
				result.failed++;
			}
		}

		return result;
	}
}
