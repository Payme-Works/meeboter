import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer";
import { getStream, launch, wss } from "puppeteer-stream";
import { Bot } from "../../../src/bot";
import type { BotLogger } from "../../../src/logger";
import {
	type BotConfig,
	type EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";

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
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("Starting recording");
			await this.startRecording();
		}

		// Get frame for monitoring
		const iframe = await this.page.waitForSelector(SELECTORS.iframe);
		const frame = await iframe?.contentFrame();

		if (!frame) {
			throw new Error("Failed to get meeting iframe for monitoring");
		}

		this.logger.debug("Monitoring call for exit conditions");

		// Race between exit conditions
		await Promise.race([
			this.waitForMeetingEnd(frame),
			this.waitForLeaveButtonGone(frame),
			this.waitForLeaveRequest(),
		]);

		await this.cleanup();
	}

	/**
	 * Clean up resources.
	 */
	async cleanup(): Promise<void> {
		this.logger.info("State: IN_CALL → ENDING");

		await this.stopRecording();

		if (this.file) {
			this.file.close();
			this.file = null;
		}

		if (this.browser) {
			await this.browser.close();
			(await wss).close();
		}

		this.logger.info("Cleanup complete");
	}

	// Alias for backward compatibility
	async endLife(): Promise<void> {
		await this.cleanup();
	}

	// Alias for backward compatibility
	async joinMeeting(): Promise<void> {
		await this.joinCall();
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
	 * Check if bot has been kicked (not implemented for Zoom).
	 */
	async checkKicked(): Promise<boolean> {
		return false;
	}

	// Alias for backward compatibility
	async hasBeenRemovedFromCall(): Promise<boolean> {
		return this.checkKicked();
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
	private async initializeBrowser(): Promise<void> {
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

	// Alias for backward compatibility
	async launchBrowser(): Promise<void> {
		await this.initializeBrowser();
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
