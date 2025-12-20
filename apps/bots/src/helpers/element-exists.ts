import type { Page } from "playwright";

/** Default timeout for element existence checks (in milliseconds) */
const DEFAULT_ELEMENT_EXISTS_TIMEOUT = 5000;

/** Result of an element existence check */
interface ElementExistsResult {
	/** Whether the element exists */
	exists: boolean;
	/** Whether the check timed out (result is inconclusive) */
	timedOut: boolean;
	/** Duration of the check in milliseconds */
	durationMs: number;
}

/**
 * Check if an element exists on the page with detailed result.
 *
 * Uses a timeout to prevent indefinite hangs when the page becomes unresponsive.
 * Returns detailed information about whether the check timed out.
 *
 * @param page - Playwright page instance
 * @param selector - CSS or XPath selector to check
 * @param timeout - Timeout in milliseconds (default: 5000ms)
 * @returns Detailed result including exists, timedOut, and duration
 */
export async function elementExistsWithDetails(
	page: Page,
	selector: string,
	timeout: number = DEFAULT_ELEMENT_EXISTS_TIMEOUT,
): Promise<ElementExistsResult> {
	const startTime = Date.now();

	try {
		// Create a promise that rejects after timeout
		const timeoutPromise = new Promise<boolean>((_, reject) => {
			setTimeout(() => {
				reject(new Error("TIMEOUT"));
			}, timeout);
		});

		// Race between the actual check and the timeout
		const checkPromise = (async () => {
			const count = await page.locator(selector).count();

			return count > 0;
		})();

		const exists = await Promise.race([checkPromise, timeoutPromise]);

		return {
			exists,
			timedOut: false,
			durationMs: Date.now() - startTime,
		};
	} catch (error) {
		const isTimeout = error instanceof Error && error.message === "TIMEOUT";

		return {
			exists: false,
			timedOut: isTimeout,
			durationMs: Date.now() - startTime,
		};
	}
}

/**
 * Check if an element exists on the page.
 *
 * Uses a timeout to prevent indefinite hangs when the page becomes unresponsive.
 *
 * @param page - Playwright page instance
 * @param selector - CSS or XPath selector to check
 * @param timeout - Timeout in milliseconds (default: 5000ms)
 * @returns True if element exists, false otherwise (including on timeout)
 */
export async function elementExists(
	page: Page,
	selector: string,
	timeout: number = DEFAULT_ELEMENT_EXISTS_TIMEOUT,
): Promise<boolean> {
	const result = await elementExistsWithDetails(page, selector, timeout);

	return result.exists;
}
