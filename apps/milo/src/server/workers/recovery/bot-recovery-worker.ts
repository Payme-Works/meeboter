/**
 * BotRecoveryWorker - Orchestrates recovery across all deployment platforms
 *
 * Uses the Strategy Pattern to delegate platform-specific recovery logic
 * to focused strategy classes. This improves:
 * - Testability: Each strategy can be tested in isolation
 * - Extensibility: Adding new platforms = adding new strategy class
 * - Maintainability: Each file is focused and small
 *
 * ## Recovery Strategies
 *
 * 1. OrphanedDeployingStrategy (platform-agnostic):
 *    - Bots stuck in DEPLOYING with NULL deploymentPlatform
 *
 * 2. K8sRecoveryStrategy:
 *    - Stuck DEPLOYING bots on K8s
 *    - Orphaned K8s Jobs for FATAL bots
 *
 * 3. AWSRecoveryStrategy:
 *    - Stuck DEPLOYING bots on AWS ECS
 *    - Orphaned ECS tasks for FATAL bots
 *
 * 4. CoolifyRecoveryStrategy:
 *    - Error slots, stale deploying slots, orphaned healthy slots
 *    - Deployment queue management
 *
 * @see docs/plans/2025-12-27-workers-oop-refactoring-design.md
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
			new CoolifyRecoveryStrategy(
				db,
				services.coolify,
				services.pool,
				services.deploymentQueue,
			),
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
