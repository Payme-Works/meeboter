import type { Page } from "playwright";

/**
 * Check if an element exists on the page.
 *
 * @param page - Playwright page instance
 * @param selector - CSS or XPath selector to check
 * @returns True if element exists, false otherwise
 */
export async function elementExists(
	page: Page,
	selector: string,
): Promise<boolean> {
	try {
		const count = await page.locator(selector).count();

		return count > 0;
	} catch {
		return false;
	}
}
