/**
 * BotRecoveryWorker - Orchestrates recovery across all deployment platforms
 *
 * ## Workflow
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │                    BotRecoveryWorker                          │
 *   │                     (runs every 60s)                          │
 *   └───────────────────────────────┬───────────────────────────────┘
 *                                   │
 *      ┌────────────────────────────┼────────────────────────────┐
 *      ▼                            ▼                            ▼
 *   Orphaned              Platform-Specific               Process Queue
 *   Deploying             Recovery Strategies             (deploy waiting)
 *      │                            │
 *      │               ┌────────────┼────────────┐
 *      │               ▼            ▼            ▼
 *      │            Coolify       K8s          AWS
 *      │            (slots)      (jobs)      (tasks)
 *      ▼               ▼            ▼            ▼
 *   Mark FATAL     Reset IDLE   Delete Job   Stop Task
 *
 * ## Strategies
 *
 *   OrphanedDeploying: ALL stuck DEPLOYING bots (>15min) → FATAL
 *   CoolifyRecovery: ERROR/stale slots → reset to IDLE
 *   K8sRecovery: Orphaned Jobs → delete, stuck bots → FATAL
 *   AWSRecovery: Orphaned Tasks → stop, stuck bots → FATAL
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { Services } from "@/server/api/services";
import type * as schema from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "../base-worker";
import {
	AWSRecoveryStrategy,
	CoolifyRecoveryStrategy,
	K8sRecoveryStrategy,
	OrphanedDeployingStrategy,
} from "./strategies";

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Strategy interface for platform-specific recovery logic.
 * Each strategy handles all recovery scenarios for its platform.
 */
export interface RecoveryStrategy {
	/** Strategy name for logging */
	readonly name: string;

	/**
	 * Execute recovery logic for this platform.
	 * Returns empty result if platform is not configured.
	 */
	recover(): Promise<RecoveryResult>;
}

/**
 * Result from a single recovery strategy.
 * Strategies can add platform-specific metrics.
 */
export interface RecoveryResult {
	recovered: number;
	failed: number;
	[key: string]: number;
}

/**
 * Aggregated result from all recovery strategies.
 */
interface AggregatedRecoveryResult extends WorkerResult {
	totalRecovered: number;
	totalFailed: number;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

/**
 * Worker that orchestrates recovery across all deployment platforms.
 * Delegates to strategy classes for platform-specific logic.
 */
export class BotRecoveryWorker extends BaseWorker<AggregatedRecoveryResult> {
	readonly name = "BotRecoveryWorker";

	private readonly strategies: RecoveryStrategy[];

	constructor(
		db: PostgresJsDatabase<typeof schema>,
		services: Services,
		options: { intervalMs: number; runOnStart?: boolean },
	) {
		super(db, services, options);

		this.strategies = [
			new OrphanedDeployingStrategy(db),
			new K8sRecoveryStrategy(db, services.k8s),
			new AWSRecoveryStrategy(db, services.aws),
			new CoolifyRecoveryStrategy(db, services.coolify, services.pool),
		];
	}

	protected async execute(): Promise<AggregatedRecoveryResult> {
		let totalRecovered = 0;
		let totalFailed = 0;

		for (const strategy of this.strategies) {
			try {
				const result = await strategy.recover();
				totalRecovered += result.recovered;
				totalFailed += result.failed;

				// Log strategy-specific results
				const metrics = Object.entries(result)
					.filter(([k]) => k !== "recovered" && k !== "failed")
					.map(([k, v]) => `${k}=${v}`)
					.join(", ");

				if (metrics) {
					console.log(`[${this.name}] ${strategy.name}: ${metrics}`);
				}
			} catch (error) {
				console.error(
					`[${this.name}] Strategy ${strategy.name} failed:`,
					error,
				);

				totalFailed += 1;
			}
		}

		// Process global deployment queue (cleans up expired entries, deploys waiting bots)
		try {
			await this.services.hybrid.processQueue();
		} catch (error) {
			console.error(
				`[${this.name}] Failed to process deployment queue:`,
				error,
			);
		}

		return {
			totalRecovered,
			totalFailed,
		};
	}
}
