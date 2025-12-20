import type { Page } from "playwright";

interface ClickIfExistsOptions {
	/** Timeout in milliseconds (default: 2000) */
	timeout?: number;
}

/**
 * Click an element if it exists on the page.
 *
 * @param page - Playwright page instance
 * @param selector - CSS or XPath selector to click
 * @param options - Click options (timeout)
 * @returns True if element was clicked, false if not found
 */
export async function clickIfExists(
	page: Page,
	selector: string,
	options: ClickIfExistsOptions = {},
): Promise<boolean> {
	const { timeout = 2000 } = options;

	try {
		await page.click(selector, { timeout });

		return true;
	} catch {
		return false;
	}
}
