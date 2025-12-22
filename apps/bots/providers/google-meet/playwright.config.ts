import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 120_000,
	retries: 1,
	fullyParallel: false,
	workers: 1,
	reporter: [["html", { open: "never" }], ["list"]],
	use: {
		headless: false,
		video: "on",
		trace: "on",
		viewport: { width: 1280, height: 720 },
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
