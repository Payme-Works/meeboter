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
import { env } from "../../../src/config/env";
import {
	CLEANUP_TIMEOUTS,
	DETECTION_TIMEOUTS,
	MONITORING_CONFIG,
} from "../../../src/constants";
import { clickIfExists } from "../../../src/helpers/click-if-exists";
import { elementExists } from "../../../src/helpers/element-exists";
import { withRetry } from "../../../src/helpers/with-retry";
import { withTimeout } from "../../../src/helpers/with-timeout";

/** Network errors that are safe to retry for navigation */
const NAVIGATION_RETRYABLE_ERRORS = [
	"ERR_SOCKET_NOT_CONNECTED",
	"ERR_CONNECTION_REFUSED",
	"ERR_CONNECTION_RESET",
	"ERR_NETWORK_CHANGED",
	"ERR_INTERNET_DISCONNECTED",
	"ERR_NAME_NOT_RESOLVED",
	"net::ERR_",
	"Navigation timeout",
];

/** DOM/timing errors that are safe to retry for fill operations */
const FILL_RETRYABLE_ERRORS = [
	"Timeout",
	"timeout",
	"Target page, context or browser has been closed",
	"Element is not visible",
	"Element is not attached",
	"Element is outside of the viewport",
];

import type { BotLogger } from "../../../src/logger";
import { S3StorageProvider } from "../../../src/services/storage/s3-provider";
import {
	type BotConfig,
	EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";
import { UploadScreenshotUseCase } from "../../../src/use-cases";
import {
	GoogleMeetAdmissionDetector,
	GoogleMeetRemovalDetector,
} from "./detection";
import { SCREEN_DIMENSIONS, SELECTORS, USER_AGENT } from "./selectors";

// Stealth plugin setup
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromium.use(stealthPlugin);

type Participant = {
	id: string;
	name: string;
};

/**
 * Google Meet bot for automated meeting participation.
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
	page?: Page;

	private meetingUrl: string;
	private recordingPath: string;

	participants: Participant[] = [];

	private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
	private recordingStarted = false;
	private registeredActivityTimestamps: Record<string, number[]> = {};

	private chatEnabled = false;
	private chatPanelOpen = false;

	private originalMeetingPath: string | null = null;
	private admissionDetector: GoogleMeetAdmissionDetector | null = null;
	private removalDetector: GoogleMeetRemovalDetector | null = null;

	private uploadScreenshot: UploadScreenshotUseCase | null = null;

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

		if (
			env.S3_ENDPOINT &&
			env.S3_ACCESS_KEY &&
			env.S3_SECRET_KEY &&
			env.S3_BUCKET_NAME
		) {
			const storageService = new S3StorageProvider({
				endpoint: env.S3_ENDPOINT,
				region: env.S3_REGION,
				accessKeyId: env.S3_ACCESS_KEY,
				secretAccessKey: env.S3_SECRET_KEY,
				bucketName: env.S3_BUCKET_NAME,
			});

			this.uploadScreenshot = new UploadScreenshotUseCase(storageService);
		}

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

	// --- Lifecycle ---

	async run(): Promise<void> {
		await this.joinCall();
		await this.monitorCall();
	}

	async joinCall(): Promise<number> {
		await this.initializeBrowser();

		await this.onEvent(EventCode.JOINING_CALL);
		this.logger.setState("JOINING_CALL");
		this.logger.info("State: LAUNCHING → JOINING_CALL");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		const page = this.page;

		// Navigate to meeting URL
		const normalizedUrl = this.normalizeUrl(this.meetingUrl);

		this.logger.info("State: JOINING_CALL → NAVIGATING", {
			url: normalizedUrl,
		});

		await withRetry(
			() =>
				page.goto(normalizedUrl, { waitUntil: "networkidle", timeout: 30000 }),
			{
				maxRetries: 10,
				baseDelayMs: 2000,
				logger: this.logger,
				operationName: "Navigate to meeting",
				isRetryable: (e) =>
					NAVIGATION_RETRYABLE_ERRORS.some((err) => e.message.includes(err)),
				delay: (ms) => page.waitForTimeout(ms),
			},
		);

		// Capture original meeting path for removal detection
		this.originalMeetingPath = new URL(this.page.url()).pathname;

		// Initialize detectors
		this.admissionDetector = new GoogleMeetAdmissionDetector(
			this.page,
			this.logger,
		);

		this.removalDetector = new GoogleMeetRemovalDetector(
			this.page,
			this.logger,
			this.originalMeetingPath,
		);

		this.logger.info("State: NAVIGATING → WAITING_FOR_JOIN_SCREEN");

		// Dismiss any blocking dialogs
		await this.dismissBlockingDialogs();

		// Wait for name input field
		const nameInputSelector = await this.findNameInput();

		if (!nameInputSelector) {
			await this.checkBlockingScreens();
			this.logger.error("Name input field not found within 30s");

			throw new Error("Failed to find name input field");
		}

		// Fill bot name
		const botName = this.settings.botDisplayName || "Meeboter";

		await withRetry(
			() => page.fill(nameInputSelector, botName, { timeout: 30000 }),
			{
				maxRetries: 3,
				baseDelayMs: 1000,
				logger: this.logger,
				operationName: "Fill bot name",
				isRetryable: (e) =>
					FILL_RETRYABLE_ERRORS.some((err) => e.message.includes(err)),
				delay: (ms) => page.waitForTimeout(ms),
			},
		);

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

	async leaveCall(): Promise<number> {
		const leaveStartTime = Date.now();
		this.logger.setState("LEAVING");

		this.logger.info("[leaveCall] Starting leave process", {
			hasPage: !!this.page,
			pageUrl: this.page?.url() ?? "no page",
		});

		if (this.page) {
			await clickIfExists(this.page, SELECTORS.leaveButton, { timeout: 1000 });
		}

		await this.cleanup();

		this.logger.info("[leaveCall] Leave complete", {
			totalDurationMs: Date.now() - leaveStartTime,
		});

		return 0;
	}

	async cleanup(): Promise<void> {
		const cleanupStartTime = Date.now();
		this.logger.setState("ENDING");

		this.logger.debug("[cleanup] Starting cleanup process", {
			recordingEnabled: this.settings.recordingEnabled,
			hasFFmpegProcess: !!this.ffmpegProcess,
			hasBrowser: !!this.browser,
		});

		if (this.settings.recordingEnabled && this.ffmpegProcess) {
			this.logger.info("[cleanup] Stopping recording");

			try {
				await withTimeout(
					this.stopRecording(),
					CLEANUP_TIMEOUTS.STOP_RECORDING,
					"Stop recording",
				);
			} catch (error) {
				this.logger.warn(
					"[cleanup] Recording stop timed out, forcing SIGKILL",
					{
						error: error instanceof Error ? error.message : String(error),
					},
				);

				if (this.ffmpegProcess) {
					this.ffmpegProcess.kill("SIGKILL");
					this.ffmpegProcess = null;
				}
			}
		}

		if (this.browser) {
			try {
				await withTimeout(
					this.browser.close(),
					CLEANUP_TIMEOUTS.BROWSER_CLOSE,
					"Browser close",
				);
			} catch (error) {
				this.logger.warn("[cleanup] Browser close timed out", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this.logger.info("[cleanup] Cleanup complete", {
			totalDurationMs: Date.now() - cleanupStartTime,
		});
	}

	/**
	 * Check if bot has been removed from the call.
	 * Delegates to the removal detector.
	 */
	async hasBeenRemovedFromCall(): Promise<boolean> {
		if (!this.removalDetector) {
			return true;
		}

		const result = await this.removalDetector.check();

		return result.removed;
	}

	// --- Monitoring ---

	async monitorCall(): Promise<void> {
		const monitorStartTime = Date.now();
		const waitingRoomTimeout = this.settings.automaticLeave.waitingRoomTimeout;
		let confirmedInCall = false;

		this.logger.debug("[monitorCall] Starting call monitoring", {
			recordingEnabled: this.settings.recordingEnabled,
			chatEnabled: this.chatEnabled,
		});

		if (this.settings.recordingEnabled) {
			await this.startRecording();
		}

		if (this.chatEnabled) {
			await this.ensureChatPanelOpen();
		}

		await this.dismissPopupsQuick();

		let loopCount = 0;
		let exitReason = "unknown";

		try {
			while (true) {
				loopCount++;

				if (loopCount <= 3) {
					await this.dismissPopupsQuick();
				}

				if (loopCount % MONITORING_CONFIG.HEALTH_CHECK_INTERVAL === 0) {
					this.logger.trace("[monitorCall] Health check", {
						loopCount,
						confirmedInCall,
						monitoringDurationMs: Date.now() - monitorStartTime,
					});
				}

				// Check 1: User requested leave
				if (this.leaveRequested) {
					exitReason = "user_requested_leave";
					this.logger.info("[monitorCall] Exit: User requested via API");

					break;
				}

				// Check 2: Waiting room timeout
				if (!confirmedInCall) {
					const elapsed = Date.now() - monitorStartTime;

					if (elapsed > waitingRoomTimeout) {
						exitReason = "waiting_room_timeout";
						this.logger.info("[monitorCall] Exit: Waiting room timeout");

						break;
					}
				}

				// Check 3: Removal detection
				if (this.removalDetector) {
					try {
						const checkStart = Date.now();
						const result = await this.removalDetector.check();
						const checkDuration = Date.now() - checkStart;

						if (result.removed) {
							if (confirmedInCall) {
								exitReason = "removed_from_call";

								this.logger.info("[monitorCall] Exit: Removed from meeting", {
									reason: result.reason,
									checkDurationMs: checkDuration,
								});

								break;
							}

							this.logger.debug(
								"[monitorCall] Removal detected but not confirmed in-call",
							);
						} else if (!confirmedInCall && checkDuration < 5000) {
							confirmedInCall = true;
							this.logger.info("[monitorCall] Confirmed in-call");
						}
					} catch (error) {
						if (confirmedInCall) {
							exitReason = "removal_check_error";

							this.logger.error(
								"[monitorCall] Exit: Removal check error",
								error instanceof Error ? error : new Error(String(error)),
							);

							break;
						}
					}
				}

				// Check 4: Process chat
				if (this.chatEnabled) {
					try {
						await this.processChatQueue();
					} catch {
						// Ignore chat errors
					}
				}

				await setTimeout(DETECTION_TIMEOUTS.MONITOR_INTERVAL);
			}
		} catch (error) {
			exitReason = "unexpected_error";

			this.logger.error(
				"[monitorCall] Exit: Unexpected error",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		this.logger.info("[monitorCall] Exiting monitoring loop", {
			loopCount,
			exitReason,
			totalMonitoringDurationMs: Date.now() - monitorStartTime,
		});

		await this.leaveCall();
	}

	// --- Call Entry ---

	private async waitForCallEntry(): Promise<void> {
		if (!this.page || !this.admissionDetector) {
			throw new Error("Page or admission detector not initialized");
		}

		const timeout = this.settings.automaticLeave.waitingRoomTimeout;
		const startTime = Date.now();

		this.logger.debug("Waiting for call entry", {
			timeoutSeconds: timeout / 1000,
		});

		// Run checks sequentially without delay: check -> check -> check
		// Each check takes ~500-700ms with parallel selector detection
		while (Date.now() - startTime < timeout) {
			const result = await this.admissionDetector.check();

			if (result.admitted) {
				// Quick stabilization check to avoid false positives
				await setTimeout(DETECTION_TIMEOUTS.STABILIZATION_DELAY);
				const verified = await this.admissionDetector.check();

				if (verified.admitted) {
					this.logger.debug("Admission confirmed (verified)", {
						method: result.method,
					});

					return;
				}

				this.logger.debug("Admission detected but not stable");
			}

			// No delay between checks - run continuously for fastest detection
		}

		throw new WaitingRoomTimeoutError(
			`Bot was not admitted within ${timeout / 1000}s`,
		);
	}

	// --- Pre-join Helpers ---

	private async dismissBlockingDialogs(): Promise<void> {
		if (!this.page) return;

		await setTimeout(2000);
		await clickIfExists(this.page, SELECTORS.gotItButton, { timeout: 1000 });
		await clickIfExists(this.page, SELECTORS.dismissButton, { timeout: 1000 });
		await clickIfExists(this.page, SELECTORS.dialogOkButton, { timeout: 1000 });
	}

	private async dismissPopupsQuick(): Promise<void> {
		if (!this.page) return;

		try {
			await clickIfExists(this.page, SELECTORS.dialogOkButton, {
				timeout: 500,
			});

			await clickIfExists(this.page, SELECTORS.gotItButton, { timeout: 500 });
		} catch {
			// Ignore
		}
	}

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
					// Continue
				}
			}
			await setTimeout(checkInterval);
		}

		return null;
	}

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

	private async disableMediaDevices(): Promise<void> {
		if (!this.page) return;

		await clickIfExists(this.page, SELECTORS.muteButton, { timeout: 500 });
		await clickIfExists(this.page, SELECTORS.cameraOffButton, { timeout: 500 });
		this.logger.debug("Media devices disabled");
	}

	private async clickJoinButton(): Promise<boolean> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		this.logger.debug("Looking for join button");

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

	// --- Chat ---

	private async ensureChatPanelOpen(): Promise<void> {
		if (!this.page || this.chatPanelOpen) return;

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

	private async processChatQueue(): Promise<void> {
		const message = await this.dequeueNextMessage();

		if (message) {
			await this.sendChatMessage(message.messageText);
		}
	}

	private async dequeueNextMessage(): Promise<{
		messageText: string;
		templateId?: number;
		userId: string;
	} | null> {
		if (!this.chatEnabled) return null;

		try {
			return await this.trpc.bots.chat.dequeueMessage.query({
				botId: this.settings.id.toString(),
			});
		} catch {
			return null;
		}
	}

	async sendChatMessage(message: string): Promise<boolean> {
		if (!this.chatEnabled || !this.page) return false;

		this.logger.debug("Sending chat message", { message });

		if (!this.chatPanelOpen) {
			await this.ensureChatPanelOpen();
			await this.page.waitForTimeout(1000);
		}

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
				} catch {
					// Continue
				}
			}
		}

		this.logger.warn("Chat input not found");

		return false;
	}

	// --- Recording ---

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

	getRecordingPath(): string {
		const dir = path.dirname(this.recordingPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		return this.recordingPath;
	}

	getContentType(): string {
		return "video/mp4";
	}

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

	private buildFFmpegArgs(): string[] {
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

		return [
			"-v",
			"verbose",
			"-thread_queue_size",
			"512",
			"-video_size",
			`${SCREEN_DIMENSIONS.WIDTH}x${SCREEN_DIMENSIONS.HEIGHT}`,
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

	// --- Browser ---

	async initializeBrowser(headless = false): Promise<void> {
		this.logger.info("Initializing browser", { headless });

		this.browser = await chromium.launch({
			headless,
			args: this.browserArgs,
		});

		const context = await this.browser.newContext({
			permissions: ["camera", "microphone"],
			userAgent: USER_AGENT,
			viewport: {
				width: SCREEN_DIMENSIONS.WIDTH,
				height: SCREEN_DIMENSIONS.HEIGHT,
			},
		});

		this.page = await context.newPage();
		this.logger.setPage(this.page);

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

	private normalizeUrl(url: string): string {
		let normalized = url.trim();

		if (
			!normalized.startsWith("http://") &&
			!normalized.startsWith("https://")
		) {
			normalized = `https://${normalized}`;
		}

		try {
			return new URL(normalized).href;
		} catch {
			throw new Error(`Invalid meeting URL: "${url}"`);
		}
	}

	// --- Screenshot ---

	async screenshot(
		filename = "screenshot.png",
		trigger?: string,
	): Promise<string | null> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			const screenshotPath = `/tmp/${filename}`;
			await this.page.screenshot({ path: screenshotPath, type: "png" });

			if (this.uploadScreenshot) {
				const data = fs.readFileSync(screenshotPath);

				const result = await this.uploadScreenshot.execute({
					botId: this.settings.id,
					data,
					type: "manual",
					state: this.logger.getState(),
					trigger,
				});

				fs.unlinkSync(screenshotPath);
				this.logger.debug("Screenshot uploaded to S3", { key: result.key });

				try {
					await this.trpc.bots.addScreenshot.mutate({
						id: String(this.settings.id),
						screenshot: result,
					});
				} catch (dbError) {
					this.logger.warn("Failed to persist screenshot to database", {
						error: dbError instanceof Error ? dbError.message : String(dbError),
					});
				}

				return result.key;
			}

			this.logger.debug("Screenshot saved locally", { path: screenshotPath });

			return screenshotPath;
		} catch (error) {
			this.logger.error("Error taking screenshot", error as Error);

			return null;
		}
	}
}
