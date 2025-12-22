import type { Bot } from "../bot";

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Configuration for auto-restart behavior
 */
export interface AutoRestartConfig {
	/** Maximum number of restart attempts (default: 3) */
	maxRestarts?: number;
	/** Delay between restart attempts in ms (default: 5000) */
	delayBetweenRestarts?: number;
}

/**
 * Callbacks for auto-restart lifecycle events
 */
export interface AutoRestartCallbacks {
	/** Called before each restart attempt */
	onRestart?: (attempt: number, error: Error) => Promise<void>;
	/** Called when all retries are exhausted */
	onFatalError?: (error: Error, totalAttempts: number) => Promise<void>;
}

/**
 * Result of the auto-restart execution
 */
export interface AutoRestartResult {
	/** Whether the bot completed successfully */
	success: boolean;
	/** Number of attempts made (1 = no restarts needed) */
	attempts: number;
	/** The final error if failed */
	error?: Error;
}

/**
 * Wraps bot execution with automatic restart on failure.
 *
 * This function handles the complete bot lifecycle with retry logic:
 * 1. Creates a fresh bot instance for each attempt
 * 2. Runs the bot until completion or error
 * 3. On error, cleans up and retries up to maxRestarts times
 * 4. Reports restart events via callbacks
 *
 * @example
 * ```typescript
 * const result = await withAutoRestart(
 *   async () => {
 *     const bot = await createBot(config, services);
 *     return { bot, run: () => bot.run(), cleanup: () => bot.cleanup() };
 *   },
 *   { maxRestarts: 3, delayBetweenRestarts: 5000 },
 *   {
 *     onRestart: async (attempt, error) => {
 *       await reportEvent(EventCode.RESTARTING, { attempt, error: error.message });
 *     },
 *     onFatalError: async (error, attempts) => {
 *       await reportEvent(EventCode.FATAL, { error: error.message, attempts });
 *     },
 *   }
 * );
 * ```
 */
export async function withAutoRestart(
	createBotRunner: () => Promise<{
		bot: Bot;
		run: () => Promise<void>;
		cleanup: () => Promise<void>;
	}>,
	config: AutoRestartConfig = {},
	callbacks: AutoRestartCallbacks = {},
): Promise<AutoRestartResult> {
	const { maxRestarts = 3, delayBetweenRestarts = 5000 } = config;
	const { onRestart, onFatalError } = callbacks;

	let lastError: Error | undefined;
	const totalAttempts = maxRestarts + 1; // Initial attempt + restarts

	for (let attempt = 1; attempt <= totalAttempts; attempt++) {
		let runner: Awaited<ReturnType<typeof createBotRunner>> | null = null;

		try {
			// Create fresh bot instance for this attempt
			runner = await createBotRunner();

			// Run the bot
			await runner.run();

			// Success - return immediately
			return {
				success: true,
				attempts: attempt,
			};
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Always cleanup on error
			if (runner) {
				try {
					await runner.cleanup();
				} catch (cleanupError) {
					// Log but don't throw - we want to continue with restart
					console.error(
						`[withAutoRestart] Cleanup failed on attempt ${attempt}:`,
						cleanupError,
					);
				}
			}

			// Check if we should retry
			const hasMoreAttempts = attempt < totalAttempts;

			if (hasMoreAttempts) {
				// Notify about restart
				if (onRestart) {
					try {
						await onRestart(attempt, lastError);
					} catch (callbackError) {
						console.error(
							"[withAutoRestart] onRestart callback failed:",
							callbackError,
						);
					}
				}

				console.log(
					`[withAutoRestart] Attempt ${attempt}/${totalAttempts} failed, restarting in ${delayBetweenRestarts}ms...`,
					{ error: lastError.message },
				);

				// Wait before next attempt
				await sleep(delayBetweenRestarts);
			} else {
				// All retries exhausted
				console.error(
					`[withAutoRestart] All ${totalAttempts} attempts failed`,
					{ error: lastError.message },
				);

				if (onFatalError) {
					try {
						await onFatalError(lastError, totalAttempts);
					} catch (callbackError) {
						console.error(
							"[withAutoRestart] onFatalError callback failed:",
							callbackError,
						);
					}
				}
			}
		}
	}

	// All attempts failed
	return {
		success: false,
		attempts: totalAttempts,
		error: lastError,
	};
}
