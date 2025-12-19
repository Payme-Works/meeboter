import type { Page } from "playwright";

export interface WaitForElementOptions {
	/** Timeout in milliseconds (default: 30000) */
	timeout?: number;
	/** Element state to wait for (default: "visible") */
	state?: "visible" | "attached" | "hidden" | "detached";
}

/**
 * Wait for an element to appear on the page.
 *
 * @param page - Playwright page instance
 * @param selector - CSS or XPath selector to wait for
 * @param options - Wait options (timeout, state)
 * @returns True if element appeared, false if timeout
 */
export async function waitForElement(
	page: Page,
	selector: string,
	options: WaitForElementOptions = {},
): Promise<boolean> {
	const { timeout = 30000, state = "visible" } = options;

	try {
		await page.waitForSelector(selector, { timeout, state });

		return true;
	} catch {
		return false;
	}
}
