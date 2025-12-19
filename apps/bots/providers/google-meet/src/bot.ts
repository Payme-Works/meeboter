import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Bot } from "../../../src/bot";
import {
	clickIfExists,
	elementExists,
	navigateWithRetry,
} from "../../../src/helpers";
import type { BotLogger } from "../../../src/logger";
import {
	type BotConfig,
	EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";

// ============================================
// SECTION 1: CONFIGURATION
// ============================================

// Stealth plugin setup
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromium.use(stealthPlugin);

// Browser configuration
const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

// ============================================
// SECTION 2: SELECTORS
// ============================================

const SELECTORS = {
	// Join flow - multiple selectors for resilience
	nameInput: [
		'input[aria-label="Your name"]',
		'input[placeholder="Your name"]',
		'input[autocomplete="name"]',
		"input.qdOxv-fmcmS-wGMbrd",
	],
	joinNowButton: '//button[.//span[text()="Join now"]]',
	askToJoinButton: '//button[.//span[text()="Ask to join"]]',

	// In-call controls
	leaveButton: 'button[aria-label="Leave call"]',
	muteButton: '[aria-label*="Turn off microphone"]',
	cameraOffButton: '[aria-label*="Turn off camera"]',

	// In-call indicators (presence of any indicates successful join)
	inCallIndicators: [
		'button[aria-label*="People"]',
		'button[aria-label*="Chat"]',
		'button[aria-label*="More options"]',
		'button[aria-label*="Meeting details"]',
		"[data-meeting-title]",
	],

	// Kick detection
	kickDialog: '//button[.//span[text()="Return to home screen"]]',

	// Chat
	chatButton: '//button[@aria-label="Chat with everyone"]',
	chatToggleButton: '//button[@aria-label="Toggle chat"]',
	chatInput: '//input[@aria-label="Send a message to everyone"]',

	// Blocking screens
	signInButton: '//button[.//span[text()="Sign in"]]',
	captchaFrame: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
	meetingNotFound: '//*[contains(text(), "Check your meeting code")]',
	meetingEnded: '//*[contains(text(), "This meeting has ended")]',
	gotItButton: '//button[.//span[text()="Got it"]]',
	dismissButton: '//button[.//span[text()="Dismiss"]]',
} as const;

// Texts that indicate bot is still in waiting room
const WAITING_ROOM_TEXTS = [
	"Asking to be let in",
	"Someone will let you in",
	"waiting for the host",
	"Wait for the host",
];

// Texts that indicate successful admission to the call
const ADMISSION_CONFIRMATION_TEXTS = [
	"You've been admitted",
	"You're the only one here",
	"You are the only one here",
	"No one else is here",
	"Waiting for others",
	"Waiting for others to join",
];

// ============================================
// SECTION 3: TYPES
// ============================================

/**
 * Represents a participant in the Google Meet meeting.
 */
type Participant = {
	id: string;
	name: string;
};

// ============================================
// SECTION 4: GOOGLE MEET BOT CLASS
// ============================================

/**
 * Simplified Google Meet bot for automated meeting participation.
 *
 * Key capabilities:
 * - Join meetings with configurable bot settings
 * - Screen and audio recording using FFmpeg
 * - Chat message sending
 * - Automatic leave on kick detection or user request
 */
export class GoogleMeetBot extends Bot {
	private browserArgs: string[];
	protected browser?: Browser;
	// Protected for test access
	page?: Page;

	private meetingUrl: string;
	private recordingPath: string;
	// Protected for backward compatibility with tests (participant monitoring removed)
	participants: Participant[] = [];

	private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
	private recordingStarted: boolean = false;
	private registeredActivityTimestamps: Record<string, number[]> = {};

	private chatEnabled: boolean = false;
	private chatPanelOpen: boolean = false;

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
		this.meetingUrl = botSettings.meetingInfo.meetingUrl ?? "";
		this.chatEnabled = botSettings.chatEnabled ?? false;

		this.browserArgs = [
			"--incognito",
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-features=IsolateOrigins,site-per-process",
			"--disable-infobars",
			"--disable-gpu",
			"--use-fake-ui-for-media-stream",
			"--use-file-for-fake-video-capture=/dev/null",
			"--use-file-for-fake-audio-capture=/dev/null",
			'--auto-select-desktop-capture-source="Chrome"',
		];
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
	 * Join the Google Meet call.
	 */
	async joinCall(): Promise<number> {
		await this.initializeBrowser();

		await this.onEvent(EventCode.JOINING_CALL);
		this.logger.setState("JOINING_CALL");
		this.logger.info("State: LAUNCHING → JOINING_CALL");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Navigate to meeting URL
		const normalizedUrl = this.normalizeUrl(this.meetingUrl);

		this.logger.info("State: JOINING_CALL → NAVIGATING", {
			url: normalizedUrl,
		});

		await navigateWithRetry(this.page, normalizedUrl);

		this.logger.info("State: NAVIGATING → WAITING_FOR_JOIN_SCREEN");

		// Dismiss any blocking dialogs (Got it, Dismiss, etc.)
		await this.dismissBlockingDialogs();

		// Wait for name input field (try multiple selectors)
		const nameInputSelector = await this.findNameInput();

		if (!nameInputSelector) {
			// Check for blocking screens
			await this.checkBlockingScreens();
			this.logger.error("Name input field not found within 30s");

			throw new Error("Failed to find name input field");
		}

		// Fill bot name
		const botName = this.settings.botDisplayName || "Meeboter";
		await this.page.fill(nameInputSelector, botName);
		this.logger.info("Filled bot name", { name: botName });

		// Disable media devices
		await this.disableMediaDevices();

		// Click join button
		const isWaitingRoom = await this.clickJoinButton();

		if (isWaitingRoom) {
			this.logger.setState("IN_WAITING_ROOM");
			this.logger.info("State: JOINING → IN_WAITING_ROOM");
			await this.onEvent(EventCode.IN_WAITING_ROOM);
		}

		// Wait for call entry
		await this.waitForCallEntry();

		this.logger.setState("IN_CALL");
		this.logger.info("State: WAITING → IN_CALL");
		await this.onEvent(EventCode.IN_CALL);

		return 0;
	}

	/**
	 * Dismiss common blocking dialogs (Got it, Dismiss buttons).
	 */
	private async dismissBlockingDialogs(): Promise<void> {
		if (!this.page) return;

		// Wait a moment for page to stabilize
		await setTimeout(2000);

		// Try to dismiss common dialogs
		await clickIfExists(this.page, SELECTORS.gotItButton, { timeout: 1000 });
		await clickIfExists(this.page, SELECTORS.dismissButton, { timeout: 1000 });
	}

	/**
	 * Find the name input field using multiple selectors.
	 */
	private async findNameInput(): Promise<string | null> {
		if (!this.page) return null;

		const maxWait = 30000;
		const checkInterval = 1000;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWait) {
			for (const selector of SELECTORS.nameInput) {
				try {
					const count = await this.page.locator(selector).count();

					if (count > 0) {
						this.logger.debug("Found name input", { selector });

						return selector;
					}
				} catch {
					// Continue to next selector
				}
			}

			await setTimeout(checkInterval);
		}

		return null;
	}

	/**
	 * Check for blocking screens and emit appropriate events.
	 */
	private async checkBlockingScreens(): Promise<void> {
		if (!this.page) return;

		const blockingChecks = [
			{
				selector: SELECTORS.signInButton,
				event: EventCode.SIGN_IN_REQUIRED,
				msg: "Sign in required",
			},
			{
				selector: SELECTORS.captchaFrame,
				event: EventCode.CAPTCHA_DETECTED,
				msg: "Captcha detected",
			},
			{
				selector: SELECTORS.meetingNotFound,
				event: EventCode.MEETING_NOT_FOUND,
				msg: "Meeting not found",
			},
			{
				selector: SELECTORS.meetingEnded,
				event: EventCode.MEETING_ENDED,
				msg: "Meeting has ended",
			},
		];

		for (const check of blockingChecks) {
			if (await elementExists(this.page, check.selector)) {
				this.logger.warn(`Blocking screen detected: ${check.msg}`);
				await this.onEvent(check.event);

				return;
			}
		}
	}

	/**
	 * Leave the call gracefully.
	 */
	async leaveCall(): Promise<number> {
		this.logger.setState("LEAVING");
		this.logger.info("State: IN_CALL → LEAVING");

		if (this.page) {
			await clickIfExists(this.page, SELECTORS.leaveButton, { timeout: 1000 });
		}

		await this.cleanup();

		this.logger.info("State: LEAVING → ENDED");

		return 0;
	}

	/**
	 * Clean up resources (stop recording, close browser).
	 */
	async cleanup(): Promise<void> {
		this.logger.setState("ENDING");

		if (this.settings.recordingEnabled && this.ffmpegProcess) {
			this.logger.info("Stopping recording");
			await this.stopRecording();
		}

		if (this.browser) {
			await this.browser.close();
			this.logger.debug("Browser closed");
		}

		this.logger.info("Cleanup complete");
	}

	// Alias for backward compatibility
	async endLife(): Promise<void> {
		await this.cleanup();
	}

	// Alias for backward compatibility
	async leaveMeeting(): Promise<number> {
		return this.leaveCall();
	}

	// Alias for backward compatibility
	async joinMeeting(): Promise<number> {
		return this.joinCall();
	}

	// ============================================
	// MEETING MONITORING
	// ============================================

	/**
	 * Monitor the call and handle exit conditions.
	 */
	private async monitorCall(): Promise<void> {
		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("Starting recording");
			await this.startRecording();
		}

		// Open chat panel if chat is enabled
		if (this.chatEnabled) {
			await this.ensureChatPanelOpen();
		}

		this.logger.debug("Monitoring call for exit conditions");

		// Simple monitoring loop
		while (true) {
			// Check 1: User requested leave via API?
			if (this.leaveRequested) {
				this.logger.info("Leaving: User requested via API");

				break;
			}

			// Check 2: Were we kicked/removed?
			if (await this.hasBeenRemovedFromCall()) {
				this.logger.info("Leaving: Removed from meeting");

				break;
			}

			// Check 3: Process chat messages if enabled
			if (this.chatEnabled) {
				await this.processChatQueue();
			}

			// Wait before next check
			await setTimeout(5000);
		}

		await this.leaveCall();
	}

	/**
	 * Check if bot has been removed from the call.
	 * Simple detection: kick dialog exists OR leave button gone.
	 */
	async hasBeenRemovedFromCall(): Promise<boolean> {
		if (!this.page) {
			return true;
		}

		// Check 1: Explicit kick dialog
		const hasKickDialog = await elementExists(this.page, SELECTORS.kickDialog);

		if (hasKickDialog) {
			this.logger.info("Kick detected: Return to home screen dialog");

			return true;
		}

		// Check 2: Leave button gone (call ended or kicked)
		const hasLeaveButton = await elementExists(
			this.page,
			SELECTORS.leaveButton,
		);

		if (!hasLeaveButton) {
			this.logger.info("Kick detected: Leave button no longer visible");

			return true;
		}

		return false;
	}

	// Alias for backward compatibility
	async checkKicked(): Promise<boolean> {
		return this.hasBeenRemovedFromCall();
	}

	// Alias for backward compatibility (renamed from meetingActions)
	async meetingActions(): Promise<void> {
		return this.monitorCall();
	}

	// ============================================
	// CHAT FUNCTIONALITY
	// ============================================

	/**
	 * Ensure chat panel is open.
	 */
	private async ensureChatPanelOpen(): Promise<void> {
		if (!this.page || this.chatPanelOpen) {
			return;
		}

		this.logger.debug("Opening chat panel");

		const chatSelectors = [
			SELECTORS.chatButton,
			SELECTORS.chatToggleButton,
			'//button[contains(@aria-label, "Chat")]',
		];

		for (const selector of chatSelectors) {
			if (await clickIfExists(this.page, selector, { timeout: 2000 })) {
				this.chatPanelOpen = true;
				this.logger.debug("Chat panel opened");

				return;
			}
		}

		this.logger.warn("Chat button not found");
	}

	/**
	 * Process queued chat messages.
	 */
	private async processChatQueue(): Promise<void> {
		const message = await this.dequeueNextMessage();

		if (message) {
			await this.sendChatMessage(message.messageText);
		}
	}

	/**
	 * Get next queued message from backend.
	 */
	private async dequeueNextMessage(): Promise<{
		messageText: string;
		templateId?: number;
		userId: string;
	} | null> {
		if (!this.chatEnabled) {
			return null;
		}

		try {
			return await this.trpc.bots.chat.dequeueMessage.query({
				botId: this.settings.id.toString(),
			});
		} catch (error) {
			this.logger.debug("Error fetching queued message", { error });

			return null;
		}
	}

	/**
	 * Send a chat message.
	 */
	async sendChatMessage(message: string): Promise<boolean> {
		if (!this.chatEnabled || !this.page) {
			return false;
		}

		this.logger.debug("Sending chat message", { message });

		// Ensure chat panel is open
		if (!this.chatPanelOpen) {
			await this.ensureChatPanelOpen();
			await this.page.waitForTimeout(1000);
		}

		// Find and use chat input
		const inputSelectors = [
			SELECTORS.chatInput,
			'//input[contains(@aria-label, "message")]',
			'//textarea[contains(@aria-label, "message")]',
		];

		for (const selector of inputSelectors) {
			if (await elementExists(this.page, selector)) {
				try {
					await this.page.click(selector, { timeout: 2000 });
					await this.page.type(selector, message, { delay: 50 });
					await this.page.keyboard.press("Enter");

					this.logger.debug("Chat message sent");

					return true;
				} catch {}
			}
		}

		this.logger.warn("Chat input not found");

		return false;
	}

	// ============================================
	// RECORDING
	// ============================================

	/**
	 * Start FFmpeg recording.
	 */
	async startRecording(): Promise<void> {
		if (this.ffmpegProcess) {
			this.logger.debug("Recording already started");

			return;
		}

		this.logger.debug("Starting FFmpeg recording", {
			path: this.getRecordingPath(),
		});

		this.ffmpegProcess = spawn("ffmpeg", this.buildFFmpegArgs());

		this.ffmpegProcess.stderr.on("data", () => {
			if (!this.recordingStarted) {
				this.logger.debug("FFmpeg recording started");
				this.recordingStarted = true;
			}
		});

		this.ffmpegProcess.on("exit", (code) => {
			this.logger.debug("FFmpeg exited", { code });
			this.ffmpegProcess = null;
		});
	}

	/**
	 * Stop FFmpeg recording.
	 */
	async stopRecording(): Promise<number> {
		if (!this.ffmpegProcess) {
			this.logger.debug("No recording in progress");

			return 1;
		}

		return new Promise<number>((resolve) => {
			if (!this.ffmpegProcess) {
				resolve(1);

				return;
			}

			this.ffmpegProcess.kill("SIGINT");

			this.ffmpegProcess.on("exit", (code) => {
				this.logger.debug("Recording stopped", { code });
				resolve(code === 0 ? 0 : 1);
			});

			this.ffmpegProcess.on("error", (err) => {
				this.logger.error("Error stopping FFmpeg", err);
				resolve(1);
			});
		});
	}

	/**
	 * Get recording file path.
	 */
	getRecordingPath(): string {
		const dir = path.dirname(this.recordingPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		return this.recordingPath;
	}

	/**
	 * Get recording content type.
	 */
	getContentType(): string {
		return "video/mp4";
	}

	/**
	 * Get speaker timeframes from recording.
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		const timeframes: SpeakerTimeframe[] = [];
		const utteranceThresholdMs = 3000;

		for (const [speakerName, timestamps] of Object.entries(
			this.registeredActivityTimestamps,
		)) {
			if (timestamps.length === 0) continue;

			let start = timestamps[0];
			let end = timestamps[0];

			for (let i = 1; i < timestamps.length; i++) {
				const current = timestamps[i];

				if (current - end < utteranceThresholdMs) {
					end = current;
				} else {
					if (end - start > 500) {
						timeframes.push({ speakerName, start, end });
					}

					start = current;
					end = current;
				}
			}

			timeframes.push({ speakerName, start, end });
		}

		return timeframes.sort((a, b) => a.start - b.start || a.end - b.end);
	}

	/**
	 * Build FFmpeg command arguments.
	 */
	private buildFFmpegArgs(): string[] {
		// Test mode (no X11 server)
		if (!fs.existsSync("/tmp/.X11-unix")) {
			return [
				"-y",
				"-f",
				"lavfi",
				"-i",
				"color=c=blue:s=1280x720:r=30",
				"-video_size",
				"1280x720",
				"-preset",
				"ultrafast",
				"-c:a",
				"aac",
				"-c:v",
				"libx264",
				this.getRecordingPath(),
			];
		}

		// Production mode
		return [
			"-v",
			"verbose",
			"-thread_queue_size",
			"512",
			"-video_size",
			`${SCREEN_WIDTH}x${SCREEN_HEIGHT}`,
			"-framerate",
			"25",
			"-f",
			"x11grab",
			"-i",
			":99.0",
			"-thread_queue_size",
			"512",
			"-f",
			"pulse",
			"-i",
			"default",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-preset",
			"veryfast",
			"-crf",
			"28",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-vsync",
			"2",
			"-vf",
			"scale=1280:720",
			"-y",
			this.getRecordingPath(),
		];
	}

	// ============================================
	// BROWSER UTILITIES
	// ============================================

	/**
	 * Initialize browser with stealth settings.
	 */
	private async initializeBrowser(headless: boolean = false): Promise<void> {
		this.logger.info("Initializing browser", { headless });

		this.browser = await chromium.launch({
			headless,
			args: this.browserArgs,
		});

		const context = await this.browser.newContext({
			permissions: ["camera", "microphone"],
			userAgent: USER_AGENT,
			viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
		});

		this.page = await context.newPage();
		this.logger.setPage(this.page);

		// Anti-detection
		await this.page.addInitScript(() => {
			Object.defineProperty(navigator, "webdriver", { get: () => undefined });

			Object.defineProperty(navigator, "plugins", {
				get: () => [
					{ name: "Chrome PDF Plugin" },
					{ name: "Chrome PDF Viewer" },
				],
			});

			Object.defineProperty(navigator, "languages", {
				get: () => ["en-US", "en"],
			});
		});
	}

	/**
	 * Normalize meeting URL (add protocol if missing).
	 */
	private normalizeUrl(url: string): string {
		let normalized = url.trim();

		if (
			!normalized.startsWith("http://") &&
			!normalized.startsWith("https://")
		) {
			normalized = `https://${normalized}`;
		}

		// Validate URL
		try {
			return new URL(normalized).href;
		} catch {
			throw new Error(`Invalid meeting URL: "${url}"`);
		}
	}

	/**
	 * Disable microphone and camera.
	 */
	private async disableMediaDevices(): Promise<void> {
		if (!this.page) return;

		await clickIfExists(this.page, SELECTORS.muteButton, { timeout: 500 });
		await clickIfExists(this.page, SELECTORS.cameraOffButton, { timeout: 500 });

		this.logger.debug("Media devices disabled");
	}

	/**
	 * Click join button (Join now or Ask to join).
	 * @returns true if waiting room (Ask to join), false otherwise
	 */
	private async clickJoinButton(): Promise<boolean> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		this.logger.debug("Looking for join button");

		// Wait for either button to appear
		const joinNowPromise = this.page
			.waitForSelector(SELECTORS.joinNowButton, { timeout: 60000 })
			.then(() => ({ button: SELECTORS.joinNowButton, isWaitingRoom: false }));

		const askToJoinPromise = this.page
			.waitForSelector(SELECTORS.askToJoinButton, { timeout: 60000 })
			.then(() => ({ button: SELECTORS.askToJoinButton, isWaitingRoom: true }));

		try {
			const result = await Promise.race([joinNowPromise, askToJoinPromise]);

			await this.page.click(result.button);

			this.logger.debug("Clicked join button", {
				isWaitingRoom: result.isWaitingRoom,
			});

			return result.isWaitingRoom;
		} catch {
			throw new WaitingRoomTimeoutError(
				"Could not find join button within 60 seconds",
			);
		}
	}

	/**
	 * Wait for successful call entry.
	 * Checks for admission confirmation texts OR in-call UI indicators.
	 * Ensures we're not still in the waiting room.
	 */
	private async waitForCallEntry(): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		const timeout = this.settings.automaticLeave.waitingRoomTimeout;
		const startTime = Date.now();
		const checkInterval = 2000;

		this.logger.debug("Waiting for call entry", {
			timeoutSeconds: timeout / 1000,
		});

		while (Date.now() - startTime < timeout) {
			// Check if we're still in waiting room
			const stillInWaitingRoom = await this.isStillInWaitingRoom();

			if (!stillInWaitingRoom) {
				// Verify we're actually in the call with UI indicators
				const isInCall = await this.hasInCallIndicators();

				if (isInCall) {
					this.logger.debug("Admission confirmed via in-call indicators");

					return;
				}

				// Also check for admission confirmation text
				const hasAdmissionText = await this.hasAdmissionConfirmation();

				if (hasAdmissionText) {
					this.logger.debug("Admission confirmed via confirmation text");

					return;
				}
			}

			await setTimeout(checkInterval);
		}

		throw new WaitingRoomTimeoutError(
			`Bot was not admitted within ${timeout / 1000}s`,
		);
	}

	/**
	 * Check if bot is still in waiting room by looking for waiting room texts.
	 */
	private async isStillInWaitingRoom(): Promise<boolean> {
		if (!this.page) return false;

		try {
			const pageText = await this.page.textContent("body");

			if (!pageText) return false;

			for (const text of WAITING_ROOM_TEXTS) {
				if (pageText.toLowerCase().includes(text.toLowerCase())) {
					return true;
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Check for admission confirmation texts on the page.
	 */
	private async hasAdmissionConfirmation(): Promise<boolean> {
		if (!this.page) return false;

		try {
			const pageText = await this.page.textContent("body");

			if (!pageText) return false;

			for (const text of ADMISSION_CONFIRMATION_TEXTS) {
				if (pageText.toLowerCase().includes(text.toLowerCase())) {
					return true;
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	/**
	 * Check for in-call UI indicators (People button, Chat button, etc.).
	 */
	private async hasInCallIndicators(): Promise<boolean> {
		if (!this.page) return false;

		for (const selector of SELECTORS.inCallIndicators) {
			if (await elementExists(this.page, selector)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Take a screenshot.
	 */
	async screenshot(filename: string = "screenshot.png"): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			const screenshot = await this.page.screenshot({ type: "png" });
			const screenshotPath = path.resolve(`/tmp/${filename}`);

			fs.writeFileSync(screenshotPath, screenshot);
			this.logger.debug("Screenshot saved", { path: screenshotPath });
		} catch (error) {
			this.logger.error("Error taking screenshot", error as Error);
		}
	}

	// Alias for backward compatibility
	async captureScreenshot(filename?: string): Promise<void> {
		await this.screenshot(filename);
	}

	// Backward compatibility alias
	async launchBrowser(headless: boolean = false): Promise<void> {
		await this.initializeBrowser(headless);
	}
}
