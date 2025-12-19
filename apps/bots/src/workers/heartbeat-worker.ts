import { setTimeout } from "node:timers/promises";

import { env } from "../config/env";
import type { BotLogger } from "../logger";
import type { TrpcClient } from "../trpc";

/**
 * Retry configuration for backend communication
 */
const RETRY_CONFIG = {
	maxRetries: 3,
	initialDelayMs: 1000,
	multiplier: 2,
	maxDelayMs: 10000,
} as const;

/**
 * Implements exponential backoff with jitter for retrying failed operations
 */
function getRetryDelay(attempt: number): number {
	const baseDelay =
		RETRY_CONFIG.initialDelayMs * RETRY_CONFIG.multiplier ** attempt;

	const cappedDelay = Math.min(baseDelay, RETRY_CONFIG.maxDelayMs);
	// Add jitter: ±25% of the delay
	const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

	return Math.max(100, cappedDelay + jitter);
}

/**
 * Retries an async operation with exponential backoff
 */
async function retryOperation<T>(
	operation: () => Promise<T>,
	operationName: string,
): Promise<T | null> {
	for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt === RETRY_CONFIG.maxRetries) {
				console.error(
					`${operationName} failed after ${RETRY_CONFIG.maxRetries + 1} attempts:`,
					error,
				);

				return null;
			}

			const delay = getRetryDelay(attempt);

			console.warn(
				`${operationName} failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`,
				error instanceof Error ? error.message : String(error),
			);

			await setTimeout(delay);
		}
	}

	return null;
}

/**
 * Callbacks for heartbeat events
 */
export interface HeartbeatCallbacks {
	onLeaveRequested: () => void;
	onLogLevelChange: (logLevel: string) => void;
}

/**
 * Worker for sending periodic heartbeats to the backend.
 * Monitors for leave requests and log level changes.
 */
export class HeartbeatWorker {
	private abortController: AbortController | null = null;
	private running = false;
	private lastLogLevel: string | null = null;

	constructor(
		private readonly trpc: TrpcClient,
		private readonly logger: BotLogger,
		private readonly intervalMs = 10000,
	) {}

	/**
	 * Starts the heartbeat worker
	 */
	start(botId: number, callbacks: HeartbeatCallbacks): void {
		if (this.running) {
			this.logger.warn("Heartbeat worker already running");

			return;
		}

		this.running = true;
		this.abortController = new AbortController();

		this.runHeartbeatLoop(botId, callbacks, this.abortController.signal);
	}

	/**
	 * Stops the heartbeat worker
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		this.running = false;
		this.logger.debug("Heartbeat worker stopped");
	}

	/**
	 * Checks if the worker is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Internal heartbeat loop
	 */
	private async runHeartbeatLoop(
		botId: number,
		callbacks: HeartbeatCallbacks,
		abortSignal: AbortSignal,
	): Promise<void> {
		while (!abortSignal.aborted) {
			const result = await retryOperation(async () => {
				return await this.trpc.bots.heartbeat.mutate({
					id: String(botId),
				});
			}, "Heartbeat");

			if (result !== null) {
				console.log(`[${new Date().toISOString()}] Heartbeat sent`);

				// Check if user requested bot to leave
				if (result.shouldLeave) {
					console.log(
						`[${new Date().toISOString()}] Received leave request from backend, signaling bot to leave`,
					);

					callbacks.onLeaveRequested();

					return; // Stop heartbeat loop
				}

				// Check if log level changed
				if (result.logLevel && result.logLevel !== this.lastLogLevel) {
					console.log(
						`[${new Date().toISOString()}] Log level changed: ${this.lastLogLevel} -> ${result.logLevel}`,
					);

					this.lastLogLevel = result.logLevel;
					callbacks.onLogLevelChange(result.logLevel);
				}
			} else {
				// Do not log the entire heartbeat error if the user has set HEARTBEAT_DEBUG to false
				if (env.HEARTBEAT_DEBUG) {
					console.error(
						`[${new Date().toISOString()}] Heartbeat failed after all retries, continuing bot operation`,
					);
				}
			}

			await setTimeout(this.intervalMs);
		}
	}
}
