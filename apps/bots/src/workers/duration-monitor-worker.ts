import { setTimeout } from "node:timers/promises";

import type { BotLogger } from "../logger";

/**
 * Maximum allowed bot duration in milliseconds (1 hour)
 */
const MAX_BOT_DURATION_MS = 1 * 60 * 60 * 1000;

/**
 * Worker for monitoring bot duration and enforcing maximum runtime.
 * Will terminate the bot if it exceeds the maximum allowed duration.
 */
export class DurationMonitorWorker {
	private abortController: AbortController | null = null;
	private running = false;

	constructor(
		private readonly logger: BotLogger,
		private readonly maxDurationMs = MAX_BOT_DURATION_MS,
		private readonly checkIntervalMs = 60000, // Check every minute
	) {}

	/**
	 * Starts the duration monitor worker
	 */
	start(startTime: Date, onMaxDurationReached: () => Promise<void>): void {
		if (this.running) {
			this.logger.warn("Duration monitor worker already running");

			return;
		}

		this.running = true;
		this.abortController = new AbortController();

		this.runMonitorLoop(
			startTime,
			onMaxDurationReached,
			this.abortController.signal,
		);
	}

	/**
	 * Stops the duration monitor worker
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		this.running = false;
		this.logger.debug("Duration monitor worker stopped");
	}

	/**
	 * Checks if the worker is running
	 */
	isRunning(): boolean {
		return this.running;
	}

	/**
	 * Gets the maximum duration in milliseconds
	 */
	getMaxDurationMs(): number {
		return this.maxDurationMs;
	}

	/**
	 * Internal monitor loop
	 */
	private async runMonitorLoop(
		startTime: Date,
		onMaxDurationReached: () => Promise<void>,
		abortSignal: AbortSignal,
	): Promise<void> {
		while (!abortSignal.aborted) {
			const elapsedTime = Date.now() - startTime.getTime();

			if (elapsedTime >= this.maxDurationMs) {
				this.logger.error(
					`Bot exceeded maximum duration of ${this.maxDurationMs / 1000 / 60} minutes, terminating...`,
				);

				await onMaxDurationReached();

				return;
			}

			const remainingTime = this.maxDurationMs - elapsedTime;
			const remainingMinutes = Math.floor(remainingTime / 1000 / 60);

			// Log warning when 15 minutes remaining
			if (remainingMinutes === 15) {
				this.logger.warn(
					`Bot has 15 minutes remaining before automatic termination`,
				);
			}

			// Log warning when 5 minutes remaining
			if (remainingMinutes === 5) {
				this.logger.warn(
					`Bot has 5 minutes remaining before automatic termination`,
				);
			}

			await setTimeout(this.checkIntervalMs);
		}
	}
}
