import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer";
import { getStream, launch, wss } from "puppeteer-stream";
import { Bot } from "../../../src/bot";
import { withTimeout } from "../../../src/helpers";
import type { BotLogger } from "../../../src/logger";
import {
	type BotConfig,
	type EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";

// Cleanup timeouts (in milliseconds)
const CLEANUP_TIMEOUTS = {
	/** Timeout for stream to stop */
	STOP_RECORDING: 10000,
	/** Timeout for browser to close */
	BROWSER_CLOSE: 15000,
	/** Timeout for WebSocket server to close */
	WSS_CLOSE: 5000,
} as const;

// Expected domain for Zoom
const ZOOM_DOMAIN = "app.zoom.us";

// ============================================
// SECTION 1: SELECTORS
// ============================================

const SELECTORS = {
	// Iframe
	iframe: ".pwa-webclient__iframe",

	// Pre-join controls
	muteButton: "#preview-audio-control-button",
	stopVideoButton: "#preview-video-control-button",
	nameInput: "#input-for-name",
	joinButton: "button.zm-btn.preview-join-button",

	// In-call controls
	leaveButton: 'button[aria-label="Leave"]',

	// Modals
	acceptCookiesButton: "#onetrust-accept-btn-handler",
	acceptTermsButton: "#wc_agree1",

	// Meeting end detection
	meetingEndedOkButton:
		'div[aria-label="Meeting is end now"] button.zm-btn.zm-btn-legacy.zm-btn--primary.zm-btn__outline--blue',
} as const;

// ============================================
// SECTION 2: ZOOM BOT CLASS
// ============================================

/**
 * Simplified Zoom bot for automated meeting participation.
 *
 * Key capabilities:
 * - Join Zoom meetings via web client
 * - Screen and audio recording using puppeteer-stream
 * - Automatic leave on meeting end or user request
 */
export class ZoomBot extends Bot {
	private recordingPath: string;
	private contentType: string;
	private meetingUrl: string;

	browser!: Browser;
	page!: Page;
	private file: fs.WriteStream | null = null;
	private stream!: Transform;

	constructor(
		botSettings: BotConfig,
		onEvent: (
			eventType: EventCode,
			data?: Record<string, unknown>,
		) => Promise<void>,
		trpcInstance?: TRPCClient<AppRouter>,
		logger?: BotLogger,
	) {
		super(botSettings, onEvent, trpcInstance, logger);

		this.recordingPath = path.resolve(__dirname, "recording.mp4");
		this.contentType = "video/mp4";
		this.meetingUrl = `https://app.zoom.us/wc/${this.settings.meetingInfo.meetingId}/join?fromPWA=1&pwd=${this.settings.meetingInfo.meetingPassword}`;
	}

	// ============================================
	// LIFECYCLE METHODS
	// ============================================

	/**
	 * Main entry point: join meeting and monitor until exit.
	 */
	async run(): Promise<void> {
		await this.joinCall();
		await this.monitorCall();
	}

	/**
	 * Join the Zoom call.
	 */
	async joinCall(): Promise<void> {
		await this.initializeBrowser();

		this.logger.info("State: LAUNCHING → NAVIGATING");

		// Navigate to meeting
		await this.page.goto(this.meetingUrl);
		this.logger.info("State: NAVIGATING → WAITING_FOR_IFRAME");

		// Wait for iframe to load
		const iframe = await this.page.waitForSelector(SELECTORS.iframe);
		const frame = await iframe?.contentFrame();

		if (!frame) {
			throw new Error("Failed to get meeting iframe");
		}

		this.logger.info("State: IFRAME_LOADED → JOINING");

		// Handle modals and join
		await this.handlePreJoinModals(frame);
		await this.disableMediaDevices(frame);
		await this.fillNameAndJoin(frame);

		// Wait for call entry
		await this.waitForCallEntry(frame);

		this.logger.info("State: JOINING → IN_CALL");
	}

	/**
	 * Monitor the call and handle exit conditions.
	 */
	private async monitorCall(): Promise<void> {
		const monitorStartTime = Date.now();

		this.logger.info("[monitorCall] Starting call monitoring");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("[monitorCall] Starting recording");
			await this.startRecording();
		}

		// Get frame for monitoring
		const iframe = await this.page.waitForSelector(SELECTORS.iframe);
		const frame = await iframe?.contentFrame();

		if (!frame) {
			throw new Error("Failed to get meeting iframe for monitoring");
		}

		this.logger.debug("[monitorCall] Waiting for exit conditions", {
			exitConditions: ["meetingEnd", "leaveButtonGone", "leaveRequest"],
		});

		// Race between exit conditions
		const exitReason = await Promise.race([
			this.waitForMeetingEnd(frame).then(() => "meetingEnd" as const),
			this.waitForLeaveButtonGone(frame).then(() => "leaveButtonGone" as const),
			this.waitForLeaveRequest().then(() => "leaveRequest" as const),
		]);

		const monitorDurationMs = Date.now() - monitorStartTime;

		this.logger.info("[monitorCall] Exit condition triggered", {
			exitReason,
			monitorDurationMs,
			monitorDurationFormatted: `${Math.floor(monitorDurationMs / 60000)}m ${Math.floor((monitorDurationMs % 60000) / 1000)}s`,
		});

		await this.cleanup();
	}

	/**
	 * Clean up resources.
	 * Uses timeouts to prevent hanging if browser/stream are unresponsive.
	 */
	async cleanup(): Promise<void> {
		const cleanupStartTime = Date.now();

		this.logger.info("[cleanup] Starting cleanup process", {
			hasFile: !!this.file,
			hasBrowser: !!this.browser,
		});

		// Stop recording with timeout
		this.logger.debug("[cleanup] Stopping recording", {
			timeoutMs: CLEANUP_TIMEOUTS.STOP_RECORDING,
		});

		const recordingStopStart = Date.now();

		try {
			await withTimeout(
				this.stopRecording(),
				CLEANUP_TIMEOUTS.STOP_RECORDING,
				"Stop recording",
			);

			this.logger.debug("[cleanup] Recording stopped successfully", {
				durationMs: Date.now() - recordingStopStart,
			});
		} catch (error) {
			this.logger.warn("[cleanup] Recording stop timed out", {
				error: error instanceof Error ? error.message : String(error),
				durationMs: Date.now() - recordingStopStart,
			});
		}

		if (this.file) {
			this.file.close();
			this.file = null;
			this.logger.debug("[cleanup] File stream closed");
		}

		if (this.browser) {
			// Close browser with timeout
			this.logger.debug("[cleanup] Closing browser", {
				timeoutMs: CLEANUP_TIMEOUTS.BROWSER_CLOSE,
			});

			const browserCloseStart = Date.now();

			try {
				await withTimeout(
					this.browser.close(),
					CLEANUP_TIMEOUTS.BROWSER_CLOSE,
					"Browser close",
				);

				this.logger.debug("[cleanup] Browser closed successfully", {
					durationMs: Date.now() - browserCloseStart,
				});
			} catch (error) {
				this.logger.warn("[cleanup] Browser close timed out, forcing SIGKILL", {
					error: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - browserCloseStart,
				});

				// Force kill browser process if it didn't close gracefully
				const browserProcess = this.browser.process();

				if (browserProcess) {
					browserProcess.kill("SIGKILL");
					this.logger.debug("[cleanup] Browser process killed with SIGKILL");
				}
			}

			// Close WebSocket server with timeout
			this.logger.debug("[cleanup] Closing WebSocket server", {
				timeoutMs: CLEANUP_TIMEOUTS.WSS_CLOSE,
			});

			try {
				await withTimeout(
					(async () => (await wss).close())(),
					CLEANUP_TIMEOUTS.WSS_CLOSE,
					"WebSocket server close",
				);

				this.logger.debug("[cleanup] WebSocket server closed");
			} catch (error) {
				this.logger.warn("[cleanup] WebSocket server close timed out", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this.logger.info("[cleanup] Cleanup complete", {
			totalDurationMs: Date.now() - cleanupStartTime,
		});
	}

	// ============================================
	// MEETING MONITORING
	// ============================================

	/**
	 * Wait for "Meeting ended" dialog.
	 */
	private async waitForMeetingEnd(frame: Frame): Promise<void> {
		while (true) {
			try {
				const okButton = await frame.waitForSelector(
					SELECTORS.meetingEndedOkButton,
					{ timeout: 5000 },
				);

				if (okButton) {
					this.logger.info("Meeting ended: OK button detected");
					await okButton.click();

					return;
				}
			} catch {
				// Continue polling
			}

			await setTimeout(1000);
		}
	}

	/**
	 * Wait for leave button to disappear (kicked or meeting ended).
	 */
	private async waitForLeaveButtonGone(frame: Frame): Promise<void> {
		while (true) {
			try {
				await frame.waitForSelector(SELECTORS.leaveButton, { timeout: 5000 });
				// Button still exists, continue
			} catch {
				// Button not found, meeting likely ended
				this.logger.info("Leaving: Leave button no longer visible");

				return;
			}

			await setTimeout(60000); // Check every minute
		}
	}

	/**
	 * Wait for user leave request.
	 */
	private async waitForLeaveRequest(): Promise<void> {
		while (!this.leaveRequested) {
			await setTimeout(1000);
		}

		this.logger.info("Leaving: User requested via API");
	}

	/**
	 * Check if bot has been removed from the call.
	 * Detects: wrong domain or missing leave button.
	 */
	async hasBeenRemovedFromCall(): Promise<boolean> {
		this.logger.trace("[hasBeenRemovedFromCall] Starting removal check");

		if (!this.page) {
			this.logger.warn(
				"[hasBeenRemovedFromCall] Page is null, treating as removed",
			);

			return true;
		}

		// Check 1: Verify we're still on Zoom domain
		try {
			const currentUrl = this.page.url();
			const url = new URL(currentUrl);

			this.logger.trace("[hasBeenRemovedFromCall] URL check", {
				currentHostname: url.hostname,
				expectedHostname: ZOOM_DOMAIN,
				fullUrl: currentUrl,
			});

			if (url.hostname !== ZOOM_DOMAIN) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Domain mismatch detected",
					{
						currentDomain: url.hostname,
						expectedDomain: ZOOM_DOMAIN,
						fullUrl: currentUrl,
					},
				);

				return true;
			}
		} catch (error) {
			this.logger.warn(
				"[hasBeenRemovedFromCall] Error checking page URL, treating as removed",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);

			return true;
		}

		// Check 2: Get iframe and check for leave button
		try {
			const iframe = await this.page.$(SELECTORS.iframe);

			this.logger.trace("[hasBeenRemovedFromCall] Iframe check", {
				iframeFound: !!iframe,
				selector: SELECTORS.iframe,
			});

			if (!iframe) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Meeting iframe not found",
				);

				return true;
			}

			const frame = await iframe.contentFrame();

			this.logger.trace("[hasBeenRemovedFromCall] Frame access check", {
				frameAccessible: !!frame,
			});

			if (!frame) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Cannot access meeting iframe",
				);

				return true;
			}

			const leaveButton = await frame.$(SELECTORS.leaveButton);

			this.logger.trace("[hasBeenRemovedFromCall] Leave button check", {
				leaveButtonFound: !!leaveButton,
				selector: SELECTORS.leaveButton,
			});

			if (!leaveButton) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Leave button not found",
				);

				return true;
			}
		} catch (error) {
			this.logger.trace(
				"[hasBeenRemovedFromCall] Error checking elements, assuming still in call",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		this.logger.trace("[hasBeenRemovedFromCall] Still in call");

		return false;
	}

	// ============================================
	// RECORDING
	// ============================================

	/**
	 * Start recording.
	 */
	async startRecording(): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		this.stream = await getStream(
			this.page as unknown as Parameters<typeof getStream>[0],
			{ audio: true, video: true },
		);

		this.file = fs.createWriteStream(this.recordingPath);
		this.stream.pipe(this.file);

		this.logger.debug("Recording started");
	}

	/**
	 * Stop recording.
	 */
	async stopRecording(): Promise<void> {
		if (this.stream) {
			this.stream.destroy();
			this.logger.debug("Recording stopped");
		}
	}

	/**
	 * Get recording file path.
	 */
	getRecordingPath(): string {
		return this.recordingPath;
	}

	/**
	 * Get recording content type.
	 */
	getContentType(): string {
		return this.contentType;
	}

	/**
	 * Get speaker timeframes (not implemented for Zoom).
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		return [];
	}

	// ============================================
	// BROWSER UTILITIES
	// ============================================

	/**
	 * Initialize browser.
	 */
	async initializeBrowser(): Promise<void> {
		this.logger.info("Initializing browser");

		this.browser = (await launch({
			executablePath: puppeteer.executablePath(),
			headless: "new",
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--use-fake-device-for-media-stream",
			],
		})) as unknown as Browser;

		// Set permissions
		const urlObj = new URL(this.meetingUrl);
		const context = this.browser.defaultBrowserContext();
		context.clearPermissionOverrides();
		context.overridePermissions(urlObj.origin, ["camera", "microphone"]);

		this.page = await this.browser.newPage();
		this.logger.debug("Browser initialized");
	}

	/**
	 * Handle pre-join modals (cookies, TOS).
	 */
	private async handlePreJoinModals(frame: Frame): Promise<void> {
		await setTimeout(1500); // Wait for page to stabilize

		// Accept cookies if present
		try {
			await frame.waitForSelector(SELECTORS.acceptCookiesButton, {
				timeout: 700,
			});

			await frame.click(SELECTORS.acceptCookiesButton);
			this.logger.debug("Cookies accepted");
		} catch {
			// Modal not present
		}

		await setTimeout(1000);

		// Accept TOS if present
		try {
			await frame.waitForSelector(SELECTORS.acceptTermsButton, {
				timeout: 700,
			});

			await frame.click(SELECTORS.acceptTermsButton);
			this.logger.debug("TOS accepted");
		} catch {
			// Modal not present
		}
	}

	/**
	 * Disable microphone and camera.
	 */
	private async disableMediaDevices(frame: Frame): Promise<void> {
		await setTimeout(6000); // Wait for buttons to initialize

		await frame.waitForSelector(SELECTORS.muteButton);
		await frame.click(SELECTORS.muteButton);

		await frame.waitForSelector(SELECTORS.stopVideoButton);
		await frame.click(SELECTORS.stopVideoButton);

		this.logger.debug("Media devices disabled");
	}

	/**
	 * Fill name and click join.
	 */
	private async fillNameAndJoin(frame: Frame): Promise<void> {
		await frame.waitForSelector(SELECTORS.nameInput);

		await frame.type(
			SELECTORS.nameInput,
			this.settings.botDisplayName ?? "Meeboter",
		);

		await frame.waitForSelector(SELECTORS.joinButton);
		await frame.click(SELECTORS.joinButton);

		this.logger.debug("Clicked join button");
	}

	/**
	 * Wait for call entry (leave button visible).
	 */
	private async waitForCallEntry(frame: Frame): Promise<void> {
		await setTimeout(1400); // Wait for UI to update

		try {
			await frame.waitForSelector(SELECTORS.leaveButton, {
				timeout: this.settings.automaticLeave.waitingRoomTimeout,
			});
		} catch {
			throw new WaitingRoomTimeoutError("Bot was not admitted to meeting");
		}

		this.logger.debug("Call entry confirmed");
	}

	/**
	 * Take a screenshot.
	 */
	async screenshot(fName: string = "screenshot.png"): Promise<void> {
		if (!this.page || !this.browser) {
			throw new Error("Browser/page not initialized");
		}

		try {
			const screenshot = await this.page.screenshot({
				type: "png",
				encoding: "binary",
			});

			const screenshotPath = path.resolve(`/tmp/${fName}`);
			fs.writeFileSync(screenshotPath, screenshot);
			this.logger.debug("Screenshot saved", { path: screenshotPath });
		} catch (error) {
			this.logger.error("Error taking screenshot", error as Error);
		}
	}
}
