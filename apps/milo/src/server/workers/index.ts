import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Services } from "@/server/api/services";
import type * as schema from "@/server/database/schema";

import { BotHealthWorker } from "./bot-health-worker";
import { PoolSlotSyncWorker } from "./pool-slot-sync-worker";
import { SlotRecoveryWorker } from "./slot-recovery-worker";

/** Default interval for all workers (5 minutes) */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Container for named worker instances.
 * Allows access to specific workers for manual execution.
 */
interface WorkerInstances {
	slotRecovery: SlotRecoveryWorker;
	botHealth: BotHealthWorker;
	poolSlotSync: PoolSlotSyncWorker;
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
		slotRecovery: new SlotRecoveryWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
		botHealth: new BotHealthWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
		poolSlotSync: new PoolSlotSyncWorker(db, services, {
			intervalMs: DEFAULT_INTERVAL_MS,
			runOnStart: true,
		}),
	};

	const workerList = Object.values(workers);

	console.log(`[Workers] Starting ${workerList.length} background workers...`);

	for (const worker of workerList) {
		worker.start();
	}

	return workers;
}
