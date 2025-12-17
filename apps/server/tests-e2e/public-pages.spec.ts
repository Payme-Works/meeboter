import { expect, test } from "@playwright/test";

// Non-authenticated tests
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
	await page.goto("/");
});

test.describe("Public Pages", () => {
	test.describe("Landing Page", () => {
		test("should display correct heading", async ({ page }) => {
			await expect(page.locator("h1")).toContainText("Meeboter");
		});

		test("should display docs link", async ({ page }) => {
			await expect(page.getByLabel("Main").getByRole("list")).toContainText(
				"Docs",
			);
		});

		test("can navigate to API docs", async ({ page }) => {
			test.setTimeout(30000); // api docs are slow to load
			await page.getByRole("link", { name: "View Documentation" }).click();
			await expect(page.locator("h2")).toContainText("Meeboter API");
		});

		test("should display sign in button ", async ({ page }) => {
			await expect(page.locator("body")).toContainText("Sign In");
		});
	});
});
