import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Services } from "@/server/api/services";
import type * as schema from "@/server/database/schema";

import { BotHealthWorker } from "./bot-health-worker";
import { BotRecoveryWorker } from "./bot-recovery-worker";
import { CoolifyPoolSlotSyncWorker } from "./coolify-pool-slot-sync-worker";

/** Default interval for all workers (1 minute) */
const DEFAULT_INTERVAL_MS = 60 * 1000;

/**
 * Container for named worker instances.
 * Allows access to specific workers for manual execution.
 */
interface WorkerInstances {
	botRecovery: BotRecoveryWorker;
	botHealth: BotHealthWorker;
	coolifyPoolSlotSync: CoolifyPoolSlotSyncWorker;
}

/**
 * Creates and starts all background workers.
 *
 * Workers are only started in production to avoid interference during development.
 * Returns named worker instances for lifecycle control and manual execution.
 *
 * @param db - Database instance for queries
 * @param services - Service container for platform operations
 * @returns Named worker instances
 */
export function startWorkers(
	db: PostgresJsDatabase<typeof schema>,
	services: Services,
): WorkerInstances {
	const workers: WorkerInstances = {
		botRecovery: new BotRecoveryWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
		botHealth: new BotHealthWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
		coolifyPoolSlotSync: new CoolifyPoolSlotSyncWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
	};

	const workerEntries = Object.values(workers);

	console.log(
		`[Workers] Starting ${workerEntries.length} background workers...`,
	);

	for (const worker of workerEntries) {
		worker.start();
	}

	return workers;
}
