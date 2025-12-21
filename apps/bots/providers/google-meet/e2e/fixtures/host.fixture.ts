import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { test as base, chromium, expect } from "@playwright/test";

const USER_DATA_DIR = path.join(__dirname, "../.auth/chrome-profile");
const AUTH_MARKER = path.join(__dirname, "../.auth/.logged-in");

// Worker-scoped fixtures (shared across all tests in a worker)
type WorkerFixtures = {
	hostContext: BrowserContext;
	hostPage: Page;
	meetUrl: string;
};

// Test-scoped fixtures
type TestFixtures = {
	admitParticipant: (name: string) => Promise<void>;
	toggleWaitingRoom: (enabled: boolean) => Promise<void>;
	addParticipant: (
		name?: string,
	) => Promise<{ page: Page; context: BrowserContext }>;
	endMeet: () => Promise<void>;
};

const log = (msg: string) => console.log(`[host] ${msg}`);

/**
 * Host fixture for Google Meet E2E tests.
 *
 * Uses worker-scoped fixtures to reuse the same host meeting across all tests.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
	// Worker-scoped: creates host context once per worker
	hostContext: [
		async ({ browserName }, use) => {
			void browserName;
			log("Creating host context...");

			if (!fs.existsSync(USER_DATA_DIR)) {
				fs.mkdirSync(USER_DATA_DIR, { recursive: true });
			}

			const isFirstRun = !fs.existsSync(AUTH_MARKER);

			const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
				channel: "chrome",
				headless: false,
				viewport: { width: 1280, height: 720 },
				args: [
					"--disable-blink-features=AutomationControlled",
					"--use-fake-ui-for-media-stream",
					"--use-fake-device-for-media-stream",
				],
				permissions: [],
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
		{ scope: "worker" },
	],

	// Worker-scoped: creates host page once per worker
	hostPage: [
		async ({ hostContext }, use) => {
			log("Creating host page...");
			const page = await hostContext.newPage();

			await use(page);
		},
		{ scope: "worker" },
	],

	// Worker-scoped: creates meet once per worker
	meetUrl: [
		async ({ hostPage }, use) => {
			const dismissPopups = async (): Promise<void> => {
				for (let attempt = 0; attempt < 3; attempt++) {
					const dismissed = await hostPage
						.locator(
							'button[aria-label*="Entendi" i], button[aria-label*="Got it" i], button[aria-label*="OK" i], [role="button"][aria-label*="Entendi" i]',
						)
						.first()
						.click({ timeout: 500 })
						.then(() => {
							log(`Dismissed popup (attempt ${attempt + 1})`);

							return true;
						})
						.catch(() => false);

					if (dismissed) {
						await hostPage.waitForTimeout(300);
					} else {
						break;
					}
				}
			};

			log("Creating meet...");
			log("Navigating to meet.google.com...");

			// Use domcontentloaded instead of networkidle (Google Meet has persistent connections)
			await hostPage.goto("https://meet.google.com", {
				waitUntil: "domcontentloaded",
			});

			// Wait for the page to be interactive (New Meeting button visible)
			await hostPage
				.getByRole("button", { name: /new meeting|nova reunião/i })
				.waitFor({ state: "visible", timeout: 30_000 });

			log("Page loaded");

			await dismissPopups();

			log("Clicking 'New Meeting' button...");

			const newMeetingButton = hostPage.getByRole("button", {
				name: /new meeting|nova reunião/i,
			});

			await newMeetingButton.click();

			log("Clicked 'New Meeting'");
			log("Clicking 'Start instant meeting'...");

			const startInstantMeeting = hostPage.getByRole("menuitem", {
				name: /start an instant meeting|iniciar uma reunião/i,
			});

			await startInstantMeeting.click();

			log("Clicked 'Start instant meeting'");
			log("Waiting for meet URL...");

			await hostPage.waitForURL(
				/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/,
			);

			const meetUrl = hostPage.url();

			log(`Meet created: ${meetUrl}`);

			// Set up automatic dialog dismissal in background
			// This handles permission dialogs, meeting ready dialogs, etc.
			await hostPage.addLocatorHandler(
				hostPage.locator('button[data-mdc-dialog-action="close"]'),
				async (button) => {
					log("Auto-dismissing dialog (close)...");
					await button.click();
					log("Dialog dismissed");
				},
			);

			// Handle "Got it" / "Entendi" dialogs (e.g., "Other people may see your video differently")
			await hostPage.addLocatorHandler(
				hostPage.locator('button[data-mdc-dialog-action="ok"]'),
				async (button) => {
					log("Auto-dismissing dialog (ok)...");
					await button.click();
					log("Dialog dismissed");
				},
			);

			// Disable camera and microphone
			log("Disabling camera and microphone...");

			await hostPage.waitForTimeout(1000);

			// Turn off camera
			try {
				const cameraOffButton = hostPage.locator(
					'button[aria-label*="Turn off camera" i], button[aria-label*="Desativar câmera" i], button[data-is-muted="false"][aria-label*="camera" i], button[data-is-muted="false"][aria-label*="câmera" i]',
				);

				await cameraOffButton.first().click({ timeout: 3000 });
				log("Camera disabled");
			} catch {
				log("Camera already disabled or button not found");
			}

			// Turn off microphone
			try {
				const micOffButton = hostPage.locator(
					'button[aria-label*="Turn off microphone" i], button[aria-label*="Desativar microfone" i], button[data-is-muted="false"][aria-label*="microphone" i], button[data-is-muted="false"][aria-label*="microfone" i]',
				);

				await micOffButton.first().click({ timeout: 3000 });
				log("Microphone disabled");
			} catch {
				log("Microphone already disabled or button not found");
			}

			await hostPage.waitForTimeout(500);

			log("Meet ready - will be reused for all tests");

			await use(meetUrl);

			// Cleanup: end the meet after all tests
			log("Ending meet...");

			try {
				const leaveButton = hostPage.getByRole("button", {
					name: /leave call|sair da chamada/i,
				});

				await leaveButton.click({ timeout: 5000 });

				const endCallForAll = hostPage.getByRole("button", {
					name: /end call for everyone|encerrar/i,
				});

				await endCallForAll.click({ timeout: 2000 }).catch(() => {});
			} catch {
				log("Could not end meet cleanly");
			}
		},
		{ scope: "worker" },
	],

	admitParticipant: async ({ hostPage }, use) => {
		const admitLog = (msg: string) => console.log(`[host:admit] ${msg}`);

		const dismissDialogs = async (): Promise<void> => {
			// Close any blocking dialogs (permission, meeting ready, etc.)
			const closeSelectors = [
				'button[aria-label*="Fechar caixa de diálogo" i]',
				'button[aria-label*="Close dialog" i]',
				'button[data-mdc-dialog-action="close"]',
				'[role="dialog"] button[aria-label*="Fechar" i]',
				'[role="dialog"] button[aria-label*="Close" i]',
			];

			for (const selector of closeSelectors) {
				try {
					const closeBtn = hostPage.locator(selector);

					if ((await closeBtn.count()) > 0) {
						await closeBtn.first().click({ timeout: 1000 });
						admitLog(`Dismissed dialog using: ${selector}`);
						await hostPage.waitForTimeout(300);

						return;
					}
				} catch {
					// Try next
				}
			}
		};

		const admitParticipant = async (name: string): Promise<void> => {
			admitLog(`Admitting participant: ${name}`);

			// Dismiss any blocking dialogs first
			await dismissDialogs();

			// Try to click "Admit" / "Permitir" in the notification toast (excludes settings panel toggles)
			admitLog("Looking for admit link in notification...");

			try {
				// Look for a link/span with exact "Admit" (EN) or "Permitir" (pt-BR) text
				const admitLink = hostPage
					.locator(
						'a:text-is("Admit"), a:text-is("Permitir"), span:text-is("Admit"):not([role="switch"] span), span:text-is("Permitir"):not([role="switch"] span)',
					)
					.first();

				await admitLink.click({ timeout: 5000 });
				admitLog("Clicked admit link");
				await hostPage.waitForTimeout(500);
				admitLog("Admit complete");

				return;
			} catch {
				admitLog("Admit link not found or not clickable");
			}

			// Dismiss dialogs again in case one appeared
			await dismissDialogs();

			// Fallback: Open people panel and admit from there
			admitLog("Trying people panel...");

			try {
				const peopleButton = hostPage.locator(
					'button[aria-label*="people" i], button[aria-label*="pessoas" i]',
				);

				if ((await peopleButton.count()) > 0) {
					await peopleButton.first().click({ timeout: 3000 });
					admitLog("Clicked people button");
					await hostPage.waitForTimeout(500);
				}
			} catch {
				admitLog("People button not found");
			}

			// Find admit button (exclude toggle switches for permissions)
			admitLog("Looking for admit button...");

			// Exclude role="switch" which matches permission toggles like "Permitir que os colaboradores..."
			const admitButton = hostPage.locator(
				'button:not([role="switch"]):text-is("Permitir"), button:not([role="switch"]):text-is("Admit")',
			);

			try {
				const count = await admitButton.count();

				admitLog(`Found ${count} admit buttons (excluding switches)`);

				if (count > 0) {
					await admitButton.first().click({ timeout: 5000 });
					admitLog("Clicked admit button");
				} else {
					await hostPage.screenshot({ path: "admit-failed.png" });
					admitLog("Screenshot saved - no admit button found");
				}
			} catch (e) {
				admitLog(`Admit failed: ${e}`);
				await hostPage.screenshot({ path: "admit-failed.png" });
			}

			await hostPage.waitForTimeout(500);
			admitLog("Admit complete");
		};

		await use(admitParticipant);
	},

	toggleWaitingRoom: async ({ hostPage }, use) => {
		const toggleLog = (msg: string) =>
			console.log(`[host:toggleWaitingRoom] ${msg}`);

		const toggleWaitingRoom = async (enabled: boolean): Promise<void> => {
			toggleLog(`Setting waiting room to: ${enabled ? "enabled" : "disabled"}`);

			// Click the "Host controls" button directly (lock_person icon)
			const hostControlsButton = hostPage.locator(
				'button[aria-label*="Controles do organizador" i], button[aria-label*="Host controls" i]',
			);

			await hostControlsButton.click({ timeout: 5000 });
			toggleLog("Opened host controls panel");

			await hostPage.waitForTimeout(500);

			// Select access type:
			// - "Abrir" (Open) = waiting room disabled (accessTypeId1)
			// - "Confiável" (Trusted) = waiting room enabled (accessTypeId2)
			const targetRadioId = enabled ? "accessTypeId2" : "accessTypeId1";
			const targetRadio = hostPage.locator(`input#${targetRadioId}`);

			await targetRadio.click({ timeout: 5000 });
			toggleLog(`Selected access type: ${enabled ? "Trusted" : "Open"}`);

			await hostPage.waitForTimeout(500);

			// Close the panel
			const closeButton = hostPage.locator(
				'button[aria-label*="Fechar" i], button[aria-label*="Close" i]',
			);

			await closeButton.first().click({ timeout: 3000 });
			toggleLog("Closed host controls panel");

			await hostPage.waitForTimeout(500);
		};

		await use(toggleWaitingRoom);
	},

	addParticipant: async ({ hostContext }, use) => {
		void hostContext;

		const browsers: Array<{
			browser: Awaited<ReturnType<typeof chromium.launch>>;
			page: Page;
			context: BrowserContext;
		}> = [];

		const addParticipant = async (
			_name = "Participant",
		): Promise<{ page: Page; context: BrowserContext }> => {
			const browser = await chromium.launch({ headless: false });
			const context = await browser.newContext();
			const page = await context.newPage();

			browsers.push({ browser, page, context });

			return { page, context };
		};

		await use(addParticipant);

		for (const { browser } of browsers) {
			await browser.close();
		}
	},

	endMeet: async ({ hostPage }, use) => {
		const endMeet = async (): Promise<void> => {
			const leaveButton = hostPage.getByRole("button", {
				name: /leave call|sair da chamada/i,
			});

			await leaveButton.click();

			const endCallForAll = hostPage.getByRole("button", {
				name: /end call for everyone|encerrar a chamada para todos/i,
			});

			const justLeave = hostPage.getByRole("button", {
				name: /just leave|apenas sair/i,
			});

			try {
				await endCallForAll.click({ timeout: 2000 });
			} catch {
				await justLeave.click({ timeout: 2000 }).catch(() => {});
			}
		};

		await use(endMeet);
	},
});

export { expect };
