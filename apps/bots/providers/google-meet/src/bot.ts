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
import { clickIfExists } from "../../../src/helpers/click-if-exists";
import {
	elementExists,
	elementExistsWithDetails,
} from "../../../src/helpers/element-exists";
import { fillWithRetry } from "../../../src/helpers/fill-with-retry";
import { navigateWithRetry } from "../../../src/helpers/navigate-with-retry";
import { withTimeout } from "../../../src/helpers/with-timeout";
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
	ADMISSION_CONFIRMATION_TEXTS,
	SCREEN_DIMENSIONS,
	SELECTORS,
	USER_AGENT,
} from "./selectors";

// --- Configuration ------------------------------------------------

// Stealth plugin setup
const stealthPlugin = StealthPlugin();

stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");

chromium.use(stealthPlugin);

// Cleanup timeouts (in milliseconds)
const CLEANUP_TIMEOUTS = {
	/** Timeout for FFmpeg to stop gracefully */
	STOP_RECORDING: 10000,
	/** Timeout for browser to close */
	BROWSER_CLOSE: 15000,
} as const;

// Expected domain for Google Meet
const GOOGLE_MEET_DOMAIN = "meet.google.com";

// --- Types --------------------------------------------------------

/**
 * Represents a participant in the Google Meet meeting.
 */
type Participant = {
	id: string;
	name: string;
};

// --- Google Meet bot class ----------------------------------------

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

	page?: Page;

	private meetingUrl: string;
	private recordingPath: string;

	participants: Participant[] = [];

	private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
	private recordingStarted: boolean = false;
	private registeredActivityTimestamps: Record<string, number[]> = {};

	private chatEnabled: boolean = false;
	private chatPanelOpen: boolean = false;
	private removalCheckCount: number = 0;

	// Track sustained indicator absence for debounced removal detection
	private indicatorsMissingStartTime: number | null = null;
	private originalMeetingPath: string | null = null;

	/** Threshold for sustained indicator absence before confirming removal (30 seconds) */
	private static readonly SUSTAINED_ABSENCE_THRESHOLD_MS = 30000;

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

	// --- Lifecycle methods ------------------------------------------

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

		await navigateWithRetry(this.page, normalizedUrl, {
			logger: this.logger,
		});

		// Capture original meeting path for later comparison (removal detection)
		this.originalMeetingPath = new URL(this.page.url()).pathname;

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

		// Fill bot name with retry logic for timeout resilience
		const botName = this.settings.botDisplayName || "Meeboter";

		await fillWithRetry(this.page, nameInputSelector, botName, {
			logger: this.logger,
		});

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

		// Try to dismiss common dialogs (e.g., "Others may see your video differently")
		await clickIfExists(this.page, SELECTORS.gotItButton, { timeout: 1000 });
		await clickIfExists(this.page, SELECTORS.dismissButton, { timeout: 1000 });
		await clickIfExists(this.page, SELECTORS.dialogOkButton, { timeout: 1000 });
	}

	/**
	 * Quick popup dismissal without waiting (for use in monitoring loop).
	 */
	private async dismissPopupsQuick(): Promise<void> {
		if (!this.page) return;

		try {
			// Quick checks with short timeout to avoid blocking the loop
			const dismissed = await clickIfExists(
				this.page,
				SELECTORS.dialogOkButton,
				{ timeout: 500 },
			);

			if (dismissed) {
				this.logger.debug("[dismissPopupsQuick] Dismissed dialog popup");
			}

			// Also try Got it button
			const gotIt = await clickIfExists(this.page, SELECTORS.gotItButton, {
				timeout: 500,
			});

			if (gotIt) {
				this.logger.debug("[dismissPopupsQuick] Dismissed 'Got it' popup");
			}
		} catch {
			// Ignore errors - popups are optional
		}
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
		const leaveStartTime = Date.now();

		this.logger.setState("LEAVING");

		this.logger.info("[leaveCall] Starting leave process", {
			hasPage: !!this.page,
			pageUrl: this.page?.url() ?? "no page",
		});

		if (this.page) {
			this.logger.debug("[leaveCall] Attempting to click leave button");

			const clicked = await clickIfExists(this.page, SELECTORS.leaveButton, {
				timeout: 1000,
			});

			this.logger.debug("[leaveCall] Leave button click result", { clicked });
		}

		this.logger.debug("[leaveCall] Calling cleanup()");

		await this.cleanup();

		this.logger.info("[leaveCall] Leave complete", {
			totalDurationMs: Date.now() - leaveStartTime,
		});

		return 0;
	}

	/**
	 * Clean up resources (stop recording, close browser).
	 * Uses timeouts to prevent hanging if browser/FFmpeg are unresponsive.
	 */
	async cleanup(): Promise<void> {
		const cleanupStartTime = Date.now();

		this.logger.setState("ENDING");

		this.logger.debug("[cleanup] Starting cleanup process", {
			recordingEnabled: this.settings.recordingEnabled,
			hasFFmpegProcess: !!this.ffmpegProcess,
			hasBrowser: !!this.browser,
		});

		if (this.settings.recordingEnabled && this.ffmpegProcess) {
			this.logger.info("[cleanup] Stopping recording", {
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
				this.logger.warn(
					"[cleanup] Recording stop timed out, forcing SIGKILL",
					{
						error: error instanceof Error ? error.message : String(error),
						durationMs: Date.now() - recordingStopStart,
					},
				);

				// Force kill FFmpeg if it didn't stop gracefully
				if (this.ffmpegProcess) {
					this.ffmpegProcess.kill("SIGKILL");
					this.ffmpegProcess = null;
					this.logger.debug("[cleanup] FFmpeg process killed with SIGKILL");
				}
			}
		}

		if (this.browser) {
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
				this.logger.warn("[cleanup] Browser close timed out", {
					error: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - browserCloseStart,
				});

				// Playwright doesn't expose the process directly, so we just log the warning
				// The browser context should be cleaned up by the OS when the process exits
			}
		}

		this.logger.info("[cleanup] Cleanup complete", {
			totalDurationMs: Date.now() - cleanupStartTime,
		});
	}

	// --- Meeting monitoring ------------------------------------------

	/**
	 * Monitor the call and handle exit conditions.
	 */
	async monitorCall(): Promise<void> {
		const monitorStartTime = Date.now();
		const waitingRoomTimeout = this.settings.automaticLeave.waitingRoomTimeout;

		// Track if we've confirmed being truly in-call (found indicator without timeout)
		let confirmedInCall = false;

		this.logger.debug("[monitorCall] Starting call monitoring", {
			recordingEnabled: this.settings.recordingEnabled,
			chatEnabled: this.chatEnabled,
			waitingRoomTimeoutMs: waitingRoomTimeout,
		});

		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("[monitorCall] Starting recording");
			await this.startRecording();
		}

		// Open chat panel if chat is enabled
		if (this.chatEnabled) {
			this.logger.debug("[monitorCall] Opening chat panel");
			await this.ensureChatPanelOpen();
		}

		this.logger.debug("[monitorCall] Entering monitoring loop");

		// Dismiss any popups that appeared after joining (e.g., "Others may see your video differently")
		await this.dismissPopupsQuick();

		let loopCount = 0;
		let exitReason = "unknown";

		// Simple monitoring loop with error handling
		try {
			while (true) {
				loopCount++;

				// Dismiss popups on first few iterations (they can appear with delay)
				if (loopCount <= 3) {
					await this.dismissPopupsQuick();
				}

				// Log every 12 iterations (~1 minute) to show the bot is still monitoring
				if (loopCount % 12 === 0) {
					this.logger.trace("[monitorCall] Health check", {
						loopCount,
						leaveRequested: this.leaveRequested,
						confirmedInCall,
						monitoringDurationMs: Date.now() - monitorStartTime,
						pageUrl: this.page?.url() ?? "no page",
					});
				}

				// Check 1: User requested leave via API?
				if (this.leaveRequested) {
					exitReason = "user_requested_leave";
					this.logger.info("[monitorCall] Exit: User requested via API");

					break;
				}

				// Check 2: Apply waiting room timeout if not confirmed in-call
				// This prevents false-positive admission detection from keeping bot stuck
				if (!confirmedInCall) {
					const elapsed = Date.now() - monitorStartTime;

					if (elapsed > waitingRoomTimeout) {
						exitReason = "waiting_room_timeout";

						this.logger.info(
							"[monitorCall] Exit: Waiting room timeout (never confirmed in-call)",
							{
								elapsedMs: elapsed,
								timeoutMs: waitingRoomTimeout,
							},
						);

						break;
					}
				}

				// Check 3: Were we kicked/removed?
				try {
					const checkStart = Date.now();
					const wasRemoved = await this.hasBeenRemovedFromCall();
					const checkDuration = Date.now() - checkStart;

					if (wasRemoved) {
						// Only exit on removal if we were confirmed in-call
						// Otherwise, wait for waiting room timeout (false positive admission)
						if (confirmedInCall) {
							exitReason = "removed_from_call";

							this.logger.info("[monitorCall] Exit: Removed from meeting", {
								checkDurationMs: checkDuration,
							});

							break;
						}

						this.logger.debug(
							"[monitorCall] Removal detected but not confirmed in-call, waiting for timeout",
							{ checkDurationMs: checkDuration },
						);
					} else if (!confirmedInCall && checkDuration < 5000) {
						// If removal check found indicators quickly, we're confirmed in-call
						confirmedInCall = true;

						this.logger.info("[monitorCall] Confirmed in-call", {
							checkDurationMs: checkDuration,
						});
					}
				} catch (error) {
					// Only treat errors as removal if confirmed in-call
					if (confirmedInCall) {
						exitReason = "removal_check_error";

						this.logger.error(
							"[monitorCall] Exit: Error checking removal status",
							error instanceof Error ? error : new Error(String(error)),
						);

						break;
					}

					this.logger.warn(
						"[monitorCall] Removal check error but not confirmed in-call, waiting for timeout",
						{ error: error instanceof Error ? error.message : String(error) },
					);
				}

				// Check 4: Process chat messages if enabled
				if (this.chatEnabled) {
					try {
						await this.processChatQueue();
					} catch (error) {
						this.logger.warn("[monitorCall] Chat queue processing error", {
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}

				// Wait before next check
				await setTimeout(5000);
			}
		} catch (error) {
			exitReason = "unexpected_error";

			this.logger.error(
				"[monitorCall] Exit: Unexpected error in monitoring loop",
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		this.logger.info("[monitorCall] Exiting monitoring loop", {
			loopCount,
			exitReason,
			totalMonitoringDurationMs: Date.now() - monitorStartTime,
		});

		this.logger.debug("[monitorCall] Calling leaveCall()");
		await this.leaveCall();
		this.logger.debug("[monitorCall] leaveCall() completed");
	}

	/**
	 * Check if bot has been removed from the call.
	 * Uses a hybrid approach for reliable detection:
	 *
	 * Immediate exit:
	 * - Kick dialog visible ("Return to home screen")
	 * - Domain changed (not on meet.google.com)
	 * - URL path changed (different meeting code)
	 *
	 * Delayed exit (30-second debounce):
	 * - All indicators missing for 30+ consecutive seconds
	 *
	 * This prevents false positives during Google Meet's internal reconnections
	 * which briefly cause DOM elements to be missing.
	 */
	async hasBeenRemovedFromCall(): Promise<boolean> {
		this.removalCheckCount++;
		const checkId = this.removalCheckCount;

		this.logger.trace("[hasBeenRemovedFromCall] Starting removal check", {
			checkId,
		});

		if (!this.page) {
			this.logger.warn(
				"[hasBeenRemovedFromCall] Page is null, treating as removed",
			);

			return true;
		}

		// Check 1: Verify we're still on Google Meet domain
		// This catches unexpected redirects (e.g., to other sites)
		let currentPath: string;

		try {
			const currentUrl = this.page.url();
			const url = new URL(currentUrl);
			currentPath = url.pathname;

			this.logger.trace("[hasBeenRemovedFromCall] URL check", {
				currentHostname: url.hostname,
				expectedHostname: GOOGLE_MEET_DOMAIN,
				currentPath,
				originalPath: this.originalMeetingPath,
				fullUrl: currentUrl,
			});

			// Domain changed - immediate removal
			if (url.hostname !== GOOGLE_MEET_DOMAIN) {
				this.logger.info("[hasBeenRemovedFromCall] REMOVED: Domain mismatch", {
					currentDomain: url.hostname,
					expectedDomain: GOOGLE_MEET_DOMAIN,
					fullUrl: currentUrl,
				});

				return true;
			}

			// Check 2: URL path changed (redirected to different meeting or homepage)
			if (
				this.originalMeetingPath &&
				currentPath !== this.originalMeetingPath
			) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Meeting path changed",
					{
						originalPath: this.originalMeetingPath,
						currentPath,
						fullUrl: currentUrl,
					},
				);

				return true;
			}
		} catch (error) {
			this.logger.warn("[hasBeenRemovedFromCall] REMOVED: URL check failed", {
				error: error instanceof Error ? error.message : String(error),
			});

			return true;
		}

		// Check 3: Explicit kick dialog - immediate removal
		const hasKickDialog = await elementExists(this.page, SELECTORS.kickDialog);

		this.logger.trace("[hasBeenRemovedFromCall] Kick dialog check", {
			hasKickDialog,
			selector: SELECTORS.kickDialog,
		});

		if (hasKickDialog) {
			this.logger.info("[hasBeenRemovedFromCall] REMOVED: Kick dialog visible");

			return true;
		}

		// Check 4: Removal indicators with 30-second debounce
		// This prevents false positives during Google Meet reconnections
		this.logger.trace("[hasBeenRemovedFromCall] Checking removal indicators", {
			indicatorCount: SELECTORS.removalIndicators.length,
		});

		const indicatorResults: Record<
			string,
			{ exists: boolean; timedOut: boolean; durationMs: number }
		> = {};

		let allTimedOut = true;
		let foundIndicator = false;

		for (const selector of SELECTORS.removalIndicators) {
			const result = await elementExistsWithDetails(this.page, selector);
			indicatorResults[selector] = result;

			this.logger.trace("[hasBeenRemovedFromCall] Indicator check completed", {
				selector,
				exists: result.exists,
				timedOut: result.timedOut,
				durationMs: result.durationMs,
			});

			// If we found an indicator (not timed out), we're still in call
			if (result.exists && !result.timedOut) {
				foundIndicator = true;

				this.logger.trace(
					"[hasBeenRemovedFromCall] In-call indicator found, still in call",
					{
						foundSelector: selector,
					},
				);

				break; // No need to check more indicators
			}

			// Track if at least one check completed without timeout
			if (!result.timedOut) {
				allTimedOut = false;
			}
		}

		// If we found an indicator, reset the absence timer and return not removed
		if (foundIndicator) {
			if (this.indicatorsMissingStartTime !== null) {
				this.logger.debug(
					"[hasBeenRemovedFromCall] Indicators recovered, resetting absence timer",
					{
						absenceDurationMs: Date.now() - this.indicatorsMissingStartTime,
					},
				);
			}

			this.indicatorsMissingStartTime = null;

			return false;
		}

		// If ALL checks timed out, the page is unresponsive - don't assume removed
		// But also don't reset the absence timer (we're in limbo)
		if (allTimedOut) {
			this.logger.warn(
				"[hasBeenRemovedFromCall] All indicator checks timed out, page unresponsive, assuming still in call",
				{
					indicatorResults,
					indicatorsMissingStartTime: this.indicatorsMissingStartTime,
				},
			);

			return false;
		}

		// No indicators found and at least one check completed without timeout
		// Start or continue the absence timer
		if (this.indicatorsMissingStartTime === null) {
			// First time indicators are missing - start the timer
			this.indicatorsMissingStartTime = Date.now();

			this.logger.info(
				"[hasBeenRemovedFromCall] No indicators found, starting 30-second grace period",
				{
					checkedIndicators: indicatorResults,
				},
			);

			return false;
		}

		// Check if we've exceeded the sustained absence threshold
		const absenceDuration = Date.now() - this.indicatorsMissingStartTime;

		if (absenceDuration < GoogleMeetBot.SUSTAINED_ABSENCE_THRESHOLD_MS) {
			// Still within grace period
			this.logger.debug(
				"[hasBeenRemovedFromCall] No indicators found, within grace period",
				{
					absenceDurationMs: absenceDuration,
					thresholdMs: GoogleMeetBot.SUSTAINED_ABSENCE_THRESHOLD_MS,
					remainingMs:
						GoogleMeetBot.SUSTAINED_ABSENCE_THRESHOLD_MS - absenceDuration,
				},
			);

			return false;
		}

		// Exceeded 30-second threshold - confirmed removal
		this.logger.info(
			"[hasBeenRemovedFromCall] REMOVED: Indicators missing for 30+ seconds",
			{
				absenceDurationMs: absenceDuration,
				thresholdMs: GoogleMeetBot.SUSTAINED_ABSENCE_THRESHOLD_MS,
				checkedIndicators: indicatorResults,
			},
		);

		return true;
	}

	// --- Chat functionality ------------------------------------------

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

	// --- Recording ---------------------------------------------------

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

	// --- Browser utilities -------------------------------------------

	/**
	 * Initialize browser with stealth settings.
	 */
	async initializeBrowser(headless: boolean = false): Promise<void> {
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
	 * Checks for in-call UI indicators with stabilization to prevent false positives.
	 *
	 * Stabilization: If admission is detected, we wait briefly and verify again
	 * to ensure it's not a transitional state (e.g., page refreshing).
	 */
	private async waitForCallEntry(): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		const timeout = this.settings.automaticLeave.waitingRoomTimeout;
		const startTime = Date.now();
		const checkInterval = 1000; // Check every second for faster detection
		const stabilizationDelayMs = 500; // Short delay to verify admission is stable

		this.logger.debug("Waiting for call entry", {
			timeoutSeconds: timeout / 1000,
		});

		while (Date.now() - startTime < timeout) {
			// Check for in-call UI indicators
			const isInCall = await this.hasInCallIndicators();

			if (isInCall) {
				// Stabilization: Wait briefly and verify the state is stable
				// This prevents false positives during page transitions
				await setTimeout(stabilizationDelayMs);

				const stillInCall = await this.hasInCallIndicators();

				if (stillInCall) {
					this.logger.debug(
						"Admission confirmed via in-call indicators (verified)",
					);

					return;
				}

				this.logger.debug(
					"Admission detected but not stable, continuing to wait",
				);
			}

			// Also check for admission confirmation text as fallback
			const hasAdmissionText = await this.hasAdmissionConfirmation();

			if (hasAdmissionText) {
				// Verify text is stable too
				await setTimeout(stabilizationDelayMs);

				const stillHasText = await this.hasAdmissionConfirmation();

				if (stillHasText) {
					this.logger.debug(
						"Admission confirmed via confirmation text (verified)",
					);

					return;
				}

				this.logger.debug(
					"Admission text detected but not stable, continuing to wait",
				);
			}

			await setTimeout(checkInterval);
		}

		throw new WaitingRoomTimeoutError(
			`Bot was not admitted within ${timeout / 1000}s`,
		);
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
	 * Check for admission indicators.
	 * Uses a three-phase approach prioritizing reliability over speed:
	 *
	 * 1. Definitive check: Side panel buttons (ONLY exist when truly in-call)
	 * 2. Structural check: Leave button + no Cancel/Ask to join buttons
	 * 3. Text fallback: Admission confirmation texts
	 *
	 * IMPORTANT: The Cancel button and Ask to join button are the most reliable
	 * waiting room indicators because they're structural elements, not text.
	 */
	private async hasInCallIndicators(): Promise<boolean> {
		const page = this.page;

		if (!page) return false;

		// Phase 1: Check for definitive in-call indicators (side panel buttons)
		// These NEVER exist in waiting room - if any is found, we're definitely in-call
		for (const selector of SELECTORS.admissionIndicators) {
			if (await elementExists(page, selector, 500)) {
				this.logger.trace("[hasInCallIndicators] Found definitive indicator", {
					selector,
				});

				return true;
			}
		}

		// Phase 2: Check Leave button + absence of waiting room structural elements
		// Leave button appears quickly after admission but also exists in waiting room
		const hasLeaveButton = await elementExists(
			page,
			SELECTORS.leaveButton,
			500,
		);

		if (hasLeaveButton) {
			// Check for waiting room structural elements (more reliable than text)
			const inWaitingRoom = await this.hasWaitingRoomStructuralIndicators();

			if (!inWaitingRoom) {
				this.logger.trace(
					"[hasInCallIndicators] Leave button found, no waiting room elements - admitted",
				);

				return true;
			}

			this.logger.trace(
				"[hasInCallIndicators] Leave button found but still in waiting room",
			);
		}

		return false;
	}

	/**
	 * Check for waiting room structural indicators.
	 * These are buttons/elements that ONLY exist in the waiting room:
	 * - Cancel button (appears after clicking "Ask to join")
	 * - Ask to join button (before clicking, or if still visible)
	 *
	 * Using structural elements is more reliable than text matching.
	 */
	private async hasWaitingRoomStructuralIndicators(): Promise<boolean> {
		if (!this.page) return false;

		// Check Cancel button first - most reliable waiting room indicator
		// It ONLY exists after clicking "Ask to join" and before being admitted
		const cancelSelectors = [
			'button[aria-label="Cancel"]',
			'//button[.//span[text()="Cancel"]]',
			'//button[contains(., "Cancel")]',
		];

		for (const selector of cancelSelectors) {
			if (await elementExists(this.page, selector, 200)) {
				this.logger.trace(
					"[hasWaitingRoomStructuralIndicators] Found Cancel button",
					{ selector },
				);

				return true;
			}
		}

		// Check if Ask to join button is still visible (shouldn't be after admission)
		if (await elementExists(this.page, SELECTORS.askToJoinButton, 200)) {
			this.logger.trace(
				"[hasWaitingRoomStructuralIndicators] Ask to join button still visible",
			);

			return true;
		}

		// Check for waiting room text patterns as fallback (less reliable)
		for (const selector of SELECTORS.waitingRoomIndicators) {
			// Skip button selectors (already checked above)
			if (selector.includes("Cancel") || selector.includes("Ask to join")) {
				continue;
			}

			if (await elementExists(this.page, selector, 150)) {
				this.logger.trace(
					"[hasWaitingRoomStructuralIndicators] Found waiting room text",
					{ selector },
				);

				return true;
			}
		}

		return false;
	}

	/**
	 * Take a screenshot, upload to S3, and persist to database.
	 * @param filename - Local filename for the screenshot
	 * @param trigger - Optional trigger description for S3 metadata
	 * @returns The S3 key if uploaded, local path if S3 not configured, or null on error
	 */
	async screenshot(
		filename: string = "screenshot.png",
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
