import fs from "node:fs";
import path from "node:path";
import { type BrowserContext, test as base, chromium } from "@playwright/test";

const USER_DATA_DIR = path.join(__dirname, "../.auth/chrome-profile");
const AUTH_MARKER = path.join(__dirname, "../.auth/.logged-in");

export type BrowserAuthFixtures = {
	authenticatedContext: BrowserContext;
};

/**
 * Browser authentication fixture using persistent Chrome profile.
 *
 * Uses launchPersistentContext with real Chrome to avoid Google's
 * automation detection. First run requires manual login, subsequent
 * runs reuse the profile automatically.
 */
export const test = base.extend<BrowserAuthFixtures>({
	authenticatedContext: async ({ baseURL }, use) => {
		void baseURL;

		if (!fs.existsSync(USER_DATA_DIR)) {
			fs.mkdirSync(USER_DATA_DIR, { recursive: true });
		}

		const isFirstRun = !fs.existsSync(AUTH_MARKER);

		const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
			channel: "chrome",
			headless: false,
			viewport: { width: 1280, height: 720 },
			args: ["--disable-blink-features=AutomationControlled"],
		});

		if (isFirstRun) {
			const page = context.pages()[0] ?? (await context.newPage());

			await page.goto("https://accounts.google.com");

			console.log("\n");
			console.log("═".repeat(60));
			console.log("  FIRST-TIME SETUP: Manual Google Login Required");
			console.log("═".repeat(60));
			console.log("\n  Please sign in to Google in the browser window.");
			console.log("  Waiting for login to complete...\n");
			console.log("═".repeat(60));

			await page.waitForURL(
				(url) =>
					url.hostname === "myaccount.google.com" ||
					url.hostname === "meet.google.com" ||
					(url.hostname === "accounts.google.com" &&
						url.pathname.includes("/SignOutOptions")),
				{ timeout: 120_000 },
			);

			fs.writeFileSync(AUTH_MARKER, new Date().toISOString());

			console.log("\n  Login detected! Profile saved for future runs.\n");
		}

		await use(context);
		await context.close();
	},
});

export { expect } from "@playwright/test";
