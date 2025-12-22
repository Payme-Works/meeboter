import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Services } from "@/server/api/services";
import type * as schema from "@/server/database/schema";

interface WorkerOptions {
	/** Interval in ms between executions. Set to 0 to disable auto-run. */
	intervalMs: number;

	/** Whether to run immediately on start. Defaults to true. */
	runOnStart?: boolean;
}

export interface WorkerResult {
	[key: string]: number;
}

/**
 * Abstract base class for background workers.
 *
 * Provides lifecycle management (start/stop), configurable intervals,
 * and manual execution for testing. Subclasses implement the `execute()` method.
 *
 * @example
 * ```typescript
 * // Production usage
 * const worker = new MyWorker(db, services, { intervalMs: 5 * 60 * 1000 });
 * worker.start();
 *
 * // Testing usage (no timers)
 * const worker = new MyWorker(mockDb, mockServices, { intervalMs: 0 });
 * const result = await worker.executeNow();
 * ```
 */
export abstract class BaseWorker<TResult extends WorkerResult = WorkerResult> {
	protected intervalId: NodeJS.Timeout | null = null;
	protected isRunning = false;

	constructor(
		protected readonly db: PostgresJsDatabase<typeof schema>,
		protected readonly services: Services,
		protected readonly options: WorkerOptions,
	) {}

	/** Worker name for logging */
	abstract readonly name: string;

	/** Main execution logic, implement in subclass */
	protected abstract execute(): Promise<TResult>;

	/**
	 * Starts the worker with the configured interval.
	 * Optionally runs immediately on start (default: true).
	 */
	start(): void {
		if (this.intervalId) {
			console.warn(`[${this.name}] Already running`);

			return;
		}

		const runOnStart = this.options.runOnStart !== false;

		console.log(
			`[${this.name}] Starting (interval: ${this.options.intervalMs}ms, runOnStart: ${runOnStart})`,
		);

		if (runOnStart) {
			this.executeNow().catch((error) => {
				console.error(`[${this.name}] Initial execution failed:`, error);
			});
		}

		if (this.options.intervalMs > 0) {
			this.intervalId = setInterval(() => {
				this.executeNow().catch((error) => {
					console.error(`[${this.name}] Scheduled execution failed:`, error);
				});
			}, this.options.intervalMs);
		}
	}

	/**
	 * Stops the worker and clears the interval.
	 */
	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
			console.log(`[${this.name}] Stopped`);
		}
	}

	/**
	 * Executes the worker logic once.
	 * Use this for testing or manual triggers.
	 * Guards against overlapping executions.
	 */
	async executeNow(): Promise<TResult> {
		if (this.isRunning) {
			console.warn(
				`[${this.name}] Skipping execution - previous run still in progress`,
			);

			return {} as TResult;
		}

		this.isRunning = true;

		try {
			const result = await this.execute();

			const resultStr = Object.entries(result)
				.map(([k, v]) => `${k}=${v}`)
				.join(" ");

			console.log(`[${this.name}] Results: ${resultStr}`);

			return result;
		} catch (error) {
			console.error(`[${this.name}] Execution failed:`, error);

			throw error;
		} finally {
			this.isRunning = false;
		}
	}

	/**
	 * Returns whether the worker is currently running an execution.
	 */
	get running(): boolean {
		return this.isRunning;
	}

	/**
	 * Returns whether the worker has an active interval.
	 */
	get active(): boolean {
		return this.intervalId !== null;
	}
}
