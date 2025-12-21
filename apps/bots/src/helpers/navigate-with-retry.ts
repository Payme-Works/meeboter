import type { Page } from "playwright";

import type { BotLogger } from "../logger";
import { withRetry } from "./with-retry";

interface NavigateWithRetryOptions {
	/** Maximum number of retry attempts (default: 10) */
	maxRetries?: number;
	/** Base delay between retries in ms (default: 2000) */
	baseDelayMs?: number;
	/** Navigation timeout in ms (default: 30000) */
	timeout?: number;
	/** Wait until condition (default: "networkidle") */
	waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
	/** Logger instance for structured logging */
	logger?: BotLogger;
}

/** Network errors that are safe to retry */
const RETRYABLE_ERRORS = [
	"ERR_SOCKET_NOT_CONNECTED",
	"ERR_CONNECTION_REFUSED",
	"ERR_CONNECTION_RESET",
	"ERR_NETWORK_CHANGED",
	"ERR_INTERNET_DISCONNECTED",
	"ERR_NAME_NOT_RESOLVED",
	"net::ERR_",
	"Navigation timeout",
];

/**
 * Check if an error is retryable (transient network error).
 */
function isRetryableError(error: Error): boolean {
	return RETRYABLE_ERRORS.some((err) => error.message.includes(err));
}

/**
 * Navigate to a URL with retry logic for transient network failures.
 *
 * @param page - Playwright page instance
 * @param url - URL to navigate to
 * @param options - Navigation options
 * @returns True if navigation succeeded, throws on permanent failure
 */
export async function navigateWithRetry(
	page: Page,
	url: string,
	options: NavigateWithRetryOptions = {},
): Promise<boolean> {
	const {
		maxRetries = 10,
		baseDelayMs = 2000,
		timeout = 30000,
		waitUntil = "networkidle",
		logger,
	} = options;

	await withRetry(() => page.goto(url, { waitUntil, timeout }), {
		maxRetries,
		baseDelayMs,
		logger,
		operationName: `Navigate to "${url}"`,
		isRetryable: isRetryableError,
		delay: (ms) => page.waitForTimeout(ms),
	});

	return true;
}
