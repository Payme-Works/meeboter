import type { BotLogger } from "../logger";

/**
 * Options for retry wrapper
 */
interface WithRetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Minimum delay between retries in ms, scales linearly with attempt (default: 1000) */
	minDelayMs?: number;
	/** Logger instance for structured logging */
	logger?: BotLogger;
	/** Operation name for logging (default: "Operation") */
	operationName?: string;
	/** Function to determine if an error is retryable (default: always retry) */
	isRetryable?: (error: Error) => boolean;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Generic retry wrapper that accepts any async operation.
 *
 * @param operation - Async function to execute with retry logic
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Error if operation fails after all retries
 *
 * @example
 * // Simple usage
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 3, operationName: "fetchData" }
 * );
 *
 * @example
 * // With custom retry logic
 * const result = await withRetry(
 *   () => page.fill(selector, value),
 *   {
 *     maxRetries: 3,
 *     isRetryable: (error) => error.message.includes("Timeout"),
 *     operationName: "fill input",
 *     logger,
 *   }
 * );
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	options: WithRetryOptions = {},
): Promise<T> {
	const {
		maxRetries = 3,
		minDelayMs = 1000,
		logger,
		operationName = "Operation",
		isRetryable = () => true,
	} = options;

	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			if (logger && attempt > 1) {
				logger.debug(`${operationName} attempt ${attempt}/${maxRetries}`);
			}

			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			const canRetry = isRetryable(lastError) && attempt < maxRetries;

			if (canRetry) {
				const retryDelay = minDelayMs * attempt;

				if (logger) {
					logger.warn(`${operationName} failed, retrying in ${retryDelay}ms`, {
						error: lastError.message,
						attempt,
						maxRetries,
					});
				}

				await sleep(retryDelay);
			} else {
				if (logger) {
					logger.error(
						`${operationName} failed after ${attempt} attempt(s)`,
						lastError,
					);
				}

				throw new Error(
					`${operationName} failed after ${attempt} attempts: ${lastError.message}`,
				);
			}
		}
	}

	// This should never be reached, but TypeScript needs it
	throw lastError ?? new Error(`${operationName} failed`);
}
