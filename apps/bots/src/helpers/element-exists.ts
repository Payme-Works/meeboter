import type { Page } from "playwright";

/** Default timeout for element existence checks (in milliseconds) */
const DEFAULT_ELEMENT_EXISTS_TIMEOUT = 5000;

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
	try {
		// Create a promise that rejects after timeout
		const timeoutPromise = new Promise<boolean>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`elementExists timed out after ${timeout}ms`));
			}, timeout);
		});

		// Race between the actual check and the timeout
		const checkPromise = (async () => {
			const count = await page.locator(selector).count();

			return count > 0;
		})();

		return await Promise.race([checkPromise, timeoutPromise]);
	} catch {
		// Return false on any error (including timeout)
		return false;
	}
}
