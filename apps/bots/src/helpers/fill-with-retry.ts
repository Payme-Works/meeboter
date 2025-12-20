import type { Page } from "playwright";

import type { BotLogger } from "../logger";

interface FillWithRetryOptions {
	/** Maximum number of retry attempts (default: 3) */
	maxRetries?: number;
	/** Base delay between retries in ms (default: 1000) */
	baseDelayMs?: number;
	/** Fill timeout in ms (default: 30000) */
	timeout?: number;
	/** Logger instance for structured logging */
	logger?: BotLogger;
}

/** Errors that are safe to retry for fill operations */
const RETRYABLE_ERRORS = [
	"Timeout",
	"timeout",
	"Target page, context or browser has been closed",
	"Element is not visible",
	"Element is not attached",
	"Element is outside of the viewport",
];

/**
 * Check if an error is retryable (transient DOM/timing error).
 */
function isRetryableError(errorMessage: string): boolean {
	return RETRYABLE_ERRORS.some((err) => errorMessage.includes(err));
}

/**
 * Fill an input field with retry logic for transient failures.
 *
 * @param page - Playwright page instance
 * @param selector - CSS selector for the input element
 * @param value - Value to fill
 * @param options - Fill options
 * @returns True if fill succeeded, throws on permanent failure
 */
export async function fillWithRetry(
	page: Page,
	selector: string,
	value: string,
	options: FillWithRetryOptions = {},
): Promise<boolean> {
	const {
		maxRetries = 3,
		baseDelayMs = 1000,
		timeout = 30000,
		logger,
	} = options;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			if (logger) {
				logger.debug(`Fill attempt ${attempt}/${maxRetries}`, { selector });
			}

			await page.fill(selector, value, { timeout });

			if (logger) {
				logger.debug("Successfully filled input", { selector });
			}

			return true;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			if (isRetryableError(errorMessage) && attempt < maxRetries) {
				const retryDelay = baseDelayMs * attempt;

				if (logger) {
					logger.warn(
						`Fill failed with retryable error, retrying in ${retryDelay}ms`,
						{ error: errorMessage, attempt, maxRetries },
					);
				}

				await page.waitForTimeout(retryDelay);
			} else {
				if (logger) {
					logger.error(
						`Fill failed after ${attempt} attempt(s)`,
						new Error(errorMessage),
						{ selector },
					);
				}

				throw new Error(
					`Cannot fill selector "${selector}" after ${attempt} attempts: ${errorMessage}`,
				);
			}
		}
	}

	return false;
}
