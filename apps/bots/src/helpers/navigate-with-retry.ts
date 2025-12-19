import type { Page } from "playwright";

export interface NavigateWithRetryOptions {
	/** Maximum number of retry attempts (default: 10) */
	maxRetries?: number;
	/** Base delay between retries in ms (default: 2000) */
	baseDelayMs?: number;
	/** Navigation timeout in ms (default: 30000) */
	timeout?: number;
	/** Wait until condition (default: "networkidle") */
	waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
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
function isRetryableError(errorMessage: string): boolean {
	return RETRYABLE_ERRORS.some((err) => errorMessage.includes(err));
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
	} = options;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(
				`Navigation attempt ${attempt}/${maxRetries}: Navigating to "${url}"`,
			);

			await page.goto(url, { waitUntil, timeout });

			console.log("Successfully navigated to URL");

			return true;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			if (isRetryableError(errorMessage) && attempt < maxRetries) {
				const retryDelay = baseDelayMs * attempt;

				console.warn(
					`Navigation failed with retryable error: ${errorMessage}. Retrying in ${retryDelay}ms...`,
				);

				await page.waitForTimeout(retryDelay);
			} else {
				console.error(
					`Navigation failed after ${attempt} attempt(s): ${errorMessage}`,
				);

				throw new Error(
					`Cannot navigate to URL "${url}" after ${attempt} attempts: ${errorMessage}`,
				);
			}
		}
	}

	return false;
}
