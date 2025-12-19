import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Services } from "@/server/api/services";
import type * as schema from "@/server/database/schema";

import {
	BaseWorker,
	type WorkerOptions,
	type WorkerResult,
} from "./base-worker";
import { BotHealthWorker } from "./bot-health.worker";
import { SlotRecoveryWorker } from "./slot-recovery.worker";

export { BaseWorker, BotHealthWorker, SlotRecoveryWorker };
export type { WorkerOptions, WorkerResult };

/** Default interval for all workers (5 minutes) */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Creates and starts all background workers.
 *
 * Workers are only started in production to avoid interference during development.
 * Returns the array of workers for lifecycle control (stopping, monitoring).
 *
 * @param db - Database instance for queries
 * @param services - Service container for platform operations
 * @returns Array of started workers
 */
export function startWorkers(
	db: PostgresJsDatabase<typeof schema>,
	services: Services,
): BaseWorker[] {
	const workers: BaseWorker[] = [
		new SlotRecoveryWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
		new BotHealthWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
	];

	console.log(`[Workers] Starting ${workers.length} background workers...`);

	for (const worker of workers) {
		worker.start();
	}

	return workers;
}

/**
 * Stops all workers gracefully.
 *
 * @param workers - Array of workers to stop
 */
export function stopWorkers(workers: BaseWorker[]): void {
	console.log(`[Workers] Stopping ${workers.length} workers...`);

	for (const worker of workers) {
		worker.stop();
	}
}
