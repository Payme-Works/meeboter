import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
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
import type { BotEventEmitter } from "../../../src/events";
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
	// Playwright timeout error patterns (Timeout 30000ms exceeded, page.goto: Timeout)
	"Timeout",
	"timeout",
	"exceeded",
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
import {
	type BotConfig,
	EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";
import { UploadScreenshotUseCase } from "../../../src/use-cases";
import { GOOGLE_MEET_CONFIG } from "./constants";
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

	/**
	 * Serializes screenshot requests to prevent concurrent Playwright operations.
	 * Stores the promise of the current screenshot operation.
	 */
	private screenshotQueue: Promise<string | null> = Promise.resolve(null);

	constructor(
		config: BotConfig,
		emitter: BotEventEmitter,
		logger: BotLogger,
		trpc?: TRPCClient<AppRouter>,
	) {
		super(config, emitter, logger, trpc);

		this.recordingPath = path.resolve(__dirname, "recording.mp4");
		this.meetingUrl = config.meeting.meetingUrl ?? "";
		this.chatEnabled = true; // Chat is always enabled

		// Initialize screenshot use case (sends to Milo for compression and S3 upload)
		if (env.MILO_URL && env.MILO_AUTH_TOKEN) {
			this.uploadScreenshot = new UploadScreenshotUseCase({
				miloUrl: env.MILO_URL,
				authToken: env.MILO_AUTH_TOKEN,
			});
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
			// Memory optimization flags for resource-constrained environments (10-20+ concurrent bots)
			"--disable-dev-shm-usage", // Use /tmp instead of /dev/shm (avoids shared memory issues)
			"--disable-background-networking", // Reduce background network activity
			"--disable-default-apps", // Don't load default apps
			"--disable-extensions", // No extensions needed
			"--disable-sync", // No Chrome sync
			"--disable-translate", // No translation service
			"--metrics-recording-only", // Reduce metrics overhead
			"--no-first-run", // Skip first run tasks
			"--safebrowsing-disable-auto-update", // No Safe Browsing updates
			// NOTE: --single-process removed - causes "Cannot use V8 Proxy resolver in single process mode"
			"--js-flags=--max-old-space-size=512", // Limit V8 heap to 512MB
		];
	}

	// --- Lifecycle ---

	async run(): Promise<void> {
		await this.joinCall();
		await this.monitorCall();
	}

	async joinCall(): Promise<number> {
		const joinStartTime = Date.now();

		this.logger.info("[joinCall] Starting join process", {
			meetingUrl: this.meetingUrl,
			botName: this.settings.displayName,
			botId: this.settings.id,
		});

		await this.initializeBrowser();

		this.emitter.emit("event", EventCode.JOINING_CALL);

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		const page = this.page;

		// Navigate to meeting URL
		const normalizedUrl = this.normalizeUrl(this.meetingUrl);

		this.logger.info("[joinCall] State: JOINING_CALL → NAVIGATING", {
			url: normalizedUrl,
			elapsedMs: Date.now() - joinStartTime,
		});

		await withRetry(
			() =>
				// Use domcontentloaded instead of networkidle: Google Meet continuously
				// makes network requests, and networkidle waits for 500ms of no activity.
				// Under load with 10-20+ concurrent bots, this causes timeouts.
				// 60s timeout provides buffer for resource-constrained environments.
				page.goto(normalizedUrl, {
					waitUntil: "domcontentloaded",
					timeout: 60000,
				}),
			{
				maxRetries: 5,
				minDelayMs: 3000,
				logger: this.logger,
				operationName: "Navigate to meeting",
				isRetryable: (e) =>
					NAVIGATION_RETRYABLE_ERRORS.some((err) => e.message.includes(err)),
			},
		);

		// Screenshot after initial navigation
		await this.screenshot("initial-navigation.png", "initial_navigation");

		this.logger.info("[joinCall] Initial navigation complete", {
			currentUrl: this.page.url(),
			elapsedMs: Date.now() - joinStartTime,
		});

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

		this.logger.info("[joinCall] State: NAVIGATING → WAITING_FOR_JOIN_SCREEN", {
			originalMeetingPath: this.originalMeetingPath,
			elapsedMs: Date.now() - joinStartTime,
		});

		// Fill bot name with full page reload on retry
		const botName = this.settings.displayName || "Meeboter";
		let nameFillAttempt = 0;

		await withRetry(
			async () => {
				nameFillAttempt++;
				await this.navigateAndFillName(normalizedUrl, botName, nameFillAttempt);
			},
			{
				maxRetries: GOOGLE_MEET_CONFIG.NAME_FILL_MAX_RETRIES,
				minDelayMs: 1000,
				logger: this.logger,
				operationName: "Fill bot name",
				isRetryable: (e) =>
					FILL_RETRYABLE_ERRORS.some((err) => e.message.includes(err)),
			},
		);

		this.logger.info("[joinCall] Name filled successfully", {
			name: botName,
			attempts: nameFillAttempt,
			elapsedMs: Date.now() - joinStartTime,
		});

		// Disable media devices
		await this.disableMediaDevices();

		// Screenshot before clicking join button
		await this.screenshot("before-join-button.png", "before_join_button");

		// Click join button
		const isWaitingRoom = await this.clickJoinButton();

		// Screenshot after clicking join button
		await this.screenshot("after-join-button.png", "after_join_button");

		this.logger.info("[joinCall] Join button clicked", {
			isWaitingRoom,
			elapsedMs: Date.now() - joinStartTime,
		});

		if (isWaitingRoom) {
			this.emitter.emit("event", EventCode.IN_WAITING_ROOM);

			this.logger.info("[joinCall] Entered waiting room", {
				elapsedMs: Date.now() - joinStartTime,
			});
		}

		// Wait for call entry
		await this.waitForCallEntry();

		// Screenshot when admitted to call
		await this.screenshot("admitted-to-call.png", "admitted_to_call");

		this.logger.info("[joinCall] Successfully admitted to call", {
			totalJoinDurationMs: Date.now() - joinStartTime,
		});

		this.emitter.emit("event", EventCode.IN_CALL);

		return 0;
	}

	async leaveCall(): Promise<number> {
		const leaveStartTime = Date.now();

		this.logger.info("[leaveCall] Starting leave process", {
			hasPage: !!this.page,
			pageUrl: this.page?.url() ?? "no page",
			leaveRequested: this.leaveRequested,
		});

		// Screenshot before leaving
		try {
			await this.screenshot("before-leave.png", "before_leave");
		} catch {
			this.logger.debug(
				"[leaveCall] Could not capture screenshot before leave",
			);
		}

		if (this.page) {
			const leaveButtonClicked = await clickIfExists(
				this.page,
				SELECTORS.leaveButton,
				{ timeout: 1000 },
			);

			this.logger.debug("[leaveCall] Leave button click result", {
				clicked: leaveButtonClicked,
			});

			// Screenshot after clicking leave button
			try {
				await this.screenshot("after-leave-button.png", "after_leave_button");
			} catch {
				this.logger.debug(
					"[leaveCall] Could not capture screenshot after leave button",
				);
			}
		}

		await this.cleanup();

		this.logger.info("[leaveCall] Leave complete", {
			totalDurationMs: Date.now() - leaveStartTime,
		});

		return 0;
	}

	async cleanup(): Promise<void> {
		const cleanupStartTime = Date.now();

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
		let lastPeriodicScreenshotTime = 0;
		const PERIODIC_SCREENSHOT_INTERVAL_MS = 60_000; // Screenshot every 60 seconds

		this.logger.info("[monitorCall] Starting call monitoring", {
			recordingEnabled: this.settings.recordingEnabled,
			chatEnabled: this.chatEnabled,
			waitingRoomTimeoutMs: waitingRoomTimeout,
		});

		if (this.settings.recordingEnabled) {
			this.logger.debug("[monitorCall] Starting recording");
			await this.startRecording();
		}

		if (this.chatEnabled) {
			this.logger.debug("[monitorCall] Opening chat panel");
			await this.ensureChatPanelOpen();
		}

		await this.dismissPopupsQuick();

		// Screenshot at start of monitoring
		await this.screenshot("monitor-start.png", "monitor_start");

		let loopCount = 0;
		let exitReason = "unknown";

		try {
			while (true) {
				loopCount++;

				if (loopCount <= 3) {
					await this.dismissPopupsQuick();
				}

				// Periodic screenshot for debugging
				const now = Date.now();

				if (
					now - lastPeriodicScreenshotTime >=
					PERIODIC_SCREENSHOT_INTERVAL_MS
				) {
					lastPeriodicScreenshotTime = now;

					const elapsedMinutes = Math.floor((now - monitorStartTime) / 60_000);

					try {
						await this.screenshot(
							`monitor-periodic-${elapsedMinutes}min.png`,
							`monitor_periodic_${elapsedMinutes}min`,
						);

						this.logger.debug("[monitorCall] Periodic screenshot captured", {
							elapsedMinutes,
							loopCount,
						});
					} catch {
						this.logger.trace(
							"[monitorCall] Failed to capture periodic screenshot",
						);
					}
				}

				if (loopCount % MONITORING_CONFIG.HEALTH_CHECK_INTERVAL === 0) {
					this.logger.debug("[monitorCall] Health check", {
						loopCount,
						confirmedInCall,
						monitoringDurationMs: now - monitorStartTime,
						currentUrl: this.page?.url() ?? "no page",
					});
				}

				// Check 1: User requested leave
				if (this.leaveRequested) {
					exitReason = "user_requested_leave";

					this.logger.info("[monitorCall] Exit: User requested via API", {
						monitoringDurationMs: now - monitorStartTime,
					});

					// Screenshot on user-requested leave
					try {
						await this.screenshot(
							"exit-user-requested.png",
							"exit_user_requested",
						);
					} catch {
						// Ignore screenshot errors
					}

					break;
				}

				// Check 2: Waiting room timeout
				if (!confirmedInCall) {
					const elapsed = now - monitorStartTime;

					if (elapsed > waitingRoomTimeout) {
						exitReason = "waiting_room_timeout";

						this.logger.info("[monitorCall] Exit: Waiting room timeout", {
							elapsedMs: elapsed,
							timeoutMs: waitingRoomTimeout,
						});

						// Screenshot on waiting room timeout
						try {
							await this.screenshot(
								"exit-waiting-room-timeout.png",
								"exit_waiting_room_timeout",
							);
						} catch {
							// Ignore screenshot errors
						}

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
									monitoringDurationMs: now - monitorStartTime,
								});

								// Screenshot on removal
								try {
									await this.screenshot(
										`exit-removed-${result.reason}.png`,
										`exit_removed_${result.reason}`,
									);
								} catch {
									// Ignore screenshot errors
								}

								break;
							}

							this.logger.debug(
								"[monitorCall] Removal detected but not confirmed in-call",
								{ reason: result.reason },
							);
						} else if (!confirmedInCall && checkDuration < 5000) {
							confirmedInCall = true;

							this.logger.info("[monitorCall] Confirmed in-call", {
								elapsedMs: now - monitorStartTime,
								checkDurationMs: checkDuration,
							});

							// Emit IN_CALL if status is still JOINING_CALL
							// This is a fallback for cases where waitForCallEntry() didn't detect admission
							if (this.emitter.getState() === EventCode.JOINING_CALL) {
								this.emitter.emit("event", EventCode.IN_CALL);

								this.logger.info(
									"[monitorCall] Emitted IN_CALL (fallback from JOINING_CALL)",
								);
							}

							// Screenshot when confirmed in-call
							try {
								await this.screenshot(
									"confirmed-in-call.png",
									"confirmed_in_call",
								);
							} catch {
								// Ignore screenshot errors
							}
						}
					} catch (error) {
						this.logger.warn("[monitorCall] Removal check error", {
							error: error instanceof Error ? error.message : String(error),
							confirmedInCall,
						});

						if (confirmedInCall) {
							exitReason = "removal_check_error";

							this.logger.error(
								"[monitorCall] Exit: Removal check error",
								error instanceof Error ? error : new Error(String(error)),
							);

							// Screenshot on removal check error
							try {
								await this.screenshot(
									"exit-removal-check-error.png",
									"exit_removal_check_error",
								);
							} catch {
								// Ignore screenshot errors
							}

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

			// Screenshot on unexpected error
			try {
				await this.screenshot(
					"exit-unexpected-error.png",
					"exit_unexpected_error",
				);
			} catch {
				// Ignore screenshot errors
			}
		}

		this.logger.info("[monitorCall] Exiting monitoring loop", {
			loopCount,
			exitReason,
			confirmedInCall,
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
		let checkCount = 0;
		let lastScreenshotTime = 0;
		const WAITING_SCREENSHOT_INTERVAL_MS = 10_000; // Screenshot every 10 seconds while waiting

		this.logger.info("[waitForCallEntry] Starting admission wait", {
			timeoutMs: timeout,
			timeoutSeconds: timeout / 1000,
		});

		// Screenshot at start of waiting
		await this.screenshot("waiting-for-admission.png", "waiting_for_admission");

		// Run checks sequentially without delay: check -> check -> check
		// Each check takes ~500-700ms with parallel selector detection
		while (Date.now() - startTime < timeout) {
			checkCount++;
			const now = Date.now();
			const elapsed = now - startTime;

			// Periodic screenshot while waiting
			if (now - lastScreenshotTime >= WAITING_SCREENSHOT_INTERVAL_MS) {
				lastScreenshotTime = now;
				const elapsedSeconds = Math.floor(elapsed / 1000);

				try {
					await this.screenshot(
						`waiting-${elapsedSeconds}s.png`,
						`waiting_${elapsedSeconds}s`,
					);

					this.logger.debug("[waitForCallEntry] Waiting screenshot captured", {
						elapsedSeconds,
						checkCount,
					});
				} catch {
					// Ignore screenshot errors
				}
			}

			const result = await this.admissionDetector.check();

			if (result.admitted) {
				this.logger.debug("[waitForCallEntry] Admission detected, verifying", {
					method: result.method,
					elapsedMs: elapsed,
					checkCount,
				});

				// Quick stabilization check to avoid false positives
				await setTimeout(DETECTION_TIMEOUTS.STABILIZATION_DELAY);
				const verified = await this.admissionDetector.check();

				if (verified.admitted) {
					this.logger.info("[waitForCallEntry] Admission confirmed", {
						method: result.method,
						elapsedMs: Date.now() - startTime,
						checkCount,
					});

					return;
				}

				this.logger.debug(
					"[waitForCallEntry] Admission not stable, continuing",
				);
			}

			// Log progress every 50 checks (~25-35 seconds)
			if (checkCount % 50 === 0) {
				this.logger.debug("[waitForCallEntry] Still waiting for admission", {
					checkCount,
					elapsedMs: elapsed,
					remainingMs: timeout - elapsed,
				});
			}

			// No delay between checks, run continuously for fastest detection
		}

		// Screenshot on timeout
		try {
			await this.screenshot("admission-timeout.png", "admission_timeout");
		} catch {
			// Ignore screenshot errors
		}

		this.logger.warn("[waitForCallEntry] Admission timeout", {
			timeoutMs: timeout,
			checkCount,
		});

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

	/**
	 * Navigate to the meeting URL and fill the bot name.
	 * On retry, this performs a full page reload to reset state.
	 */
	private async navigateAndFillName(
		meetingUrl: string,
		botName: string,
		attempt = 1,
	): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		this.logger.debug("[navigateAndFillName] Starting", {
			attempt,
			meetingUrl,
		});

		// Reload the page to reset any bad state
		await this.page.goto(meetingUrl, {
			waitUntil: "domcontentloaded",
			timeout: 30_000,
		});

		// Screenshot after navigation
		await this.screenshot(
			`name-fill-attempt-${attempt}-after-navigation.png`,
			`name_fill_attempt_${attempt}_navigation`,
		);

		// Dismiss any blocking dialogs
		await this.dismissBlockingDialogs();

		// Screenshot after dismissing dialogs
		await this.screenshot(
			`name-fill-attempt-${attempt}-after-dialogs.png`,
			`name_fill_attempt_${attempt}_dialogs`,
		);

		// Find and fill the name input
		await this.fillNameInput(botName, attempt);
	}

	/**
	 * Fill the bot name input with stability checks.
	 */
	private async fillNameInput(botName: string, attempt = 1): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// 1. Dismiss any blocking dialogs (critical for visibility)
		await this.dismissPopupsQuick();

		// 2. Find the name input element
		const nameInputSelector = await this.findNameInput();

		if (!nameInputSelector) {
			// Screenshot when name input not found
			await this.screenshot(
				`name-fill-attempt-${attempt}-input-not-found.png`,
				`name_fill_attempt_${attempt}_input_not_found`,
			);

			await this.checkBlockingScreens();

			throw new Error("Name input not found");
		}

		this.logger.debug("[fillNameInput] Name input found", {
			attempt,
			selector: nameInputSelector,
		});

		// 3. Wait for element to be visible
		try {
			await this.page.waitForSelector(nameInputSelector, {
				state: "visible",
				timeout: GOOGLE_MEET_CONFIG.NAME_FILL_TIMEOUT_MS,
			});
		} catch (error) {
			// Screenshot when visibility wait fails
			await this.screenshot(
				`name-fill-attempt-${attempt}-not-visible.png`,
				`name_fill_attempt_${attempt}_not_visible`,
			);

			throw error;
		}

		// 4. Short stabilization delay after visibility
		await setTimeout(GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS);

		// Screenshot before filling
		await this.screenshot(
			`name-fill-attempt-${attempt}-before-fill.png`,
			`name_fill_attempt_${attempt}_before_fill`,
		);

		// 5. Clear any existing text (triple-click selects all, then delete)
		const input = this.page.locator(nameInputSelector);

		try {
			await input.click({ clickCount: 3, timeout: 2000 });
			await this.page.keyboard.press("Backspace");
		} catch {
			// Input may be empty, continue with fill
		}

		// 6. Fill with shorter timeout for faster failure detection
		try {
			await input.fill(botName, {
				timeout: GOOGLE_MEET_CONFIG.NAME_FILL_TIMEOUT_MS,
			});

			// Screenshot after successful fill
			await this.screenshot(
				`name-fill-attempt-${attempt}-success.png`,
				`name_fill_attempt_${attempt}_success`,
			);

			this.logger.debug("[fillNameInput] Name filled successfully", {
				attempt,
				botName,
			});
		} catch (error) {
			// Screenshot on fill failure
			await this.screenshot(
				`name-fill-attempt-${attempt}-fill-failed.png`,
				`name_fill_attempt_${attempt}_fill_failed`,
			);

			throw error;
		}
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
				this.emitter.emit("event", check.event);

				return;
			}
		}
	}

	private async disableMediaDevices(): Promise<void> {
		if (!this.page) return;

		this.logger.debug("[disableMediaDevices] Disabling camera and microphone");

		const muteResult = await clickIfExists(this.page, SELECTORS.muteButton, {
			timeout: 500,
		});

		const cameraResult = await clickIfExists(
			this.page,
			SELECTORS.cameraOffButton,
			{ timeout: 500 },
		);

		this.logger.debug("[disableMediaDevices] Media devices disabled", {
			muteButtonClicked: muteResult,
			cameraButtonClicked: cameraResult,
		});

		// Screenshot after disabling media
		await this.screenshot("media-disabled.png", "media_disabled");
	}

	private async clickJoinButton(): Promise<boolean> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		const startTime = Date.now();

		this.logger.info("[clickJoinButton] Looking for join button", {
			joinNowSelector: SELECTORS.joinNowButton,
			askToJoinSelector: SELECTORS.askToJoinButton,
		});

		const joinNowPromise = this.page
			.waitForSelector(SELECTORS.joinNowButton, { timeout: 60000 })
			.then(() => ({ button: SELECTORS.joinNowButton, isWaitingRoom: false }));

		const askToJoinPromise = this.page
			.waitForSelector(SELECTORS.askToJoinButton, { timeout: 60000 })
			.then(() => ({ button: SELECTORS.askToJoinButton, isWaitingRoom: true }));

		try {
			const result = await Promise.race([joinNowPromise, askToJoinPromise]);

			this.logger.debug("[clickJoinButton] Join button found", {
				buttonType: result.isWaitingRoom ? "Ask to join" : "Join now",
				elapsedMs: Date.now() - startTime,
			});

			await this.page.click(result.button);

			this.logger.info("[clickJoinButton] Join button clicked", {
				isWaitingRoom: result.isWaitingRoom,
				elapsedMs: Date.now() - startTime,
			});

			return result.isWaitingRoom;
		} catch (error) {
			this.logger.warn("[clickJoinButton] Could not find join button", {
				elapsedMs: Date.now() - startTime,
				error: error instanceof Error ? error.message : String(error),
			});

			// Screenshot on join button timeout
			try {
				await this.screenshot(
					"join-button-not-found.png",
					"join_button_not_found",
				);
			} catch {
				// Ignore screenshot errors
			}

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
		const startTime = Date.now();

		this.logger.info("[initializeBrowser] Starting browser initialization", {
			headless,
			browserArgsCount: this.browserArgs.length,
		});

		this.browser = await chromium.launch({
			headless,
			args: this.browserArgs,
		});

		this.logger.debug("[initializeBrowser] Browser launched", {
			elapsedMs: Date.now() - startTime,
		});

		const context = await this.browser.newContext({
			permissions: ["camera", "microphone"],
			userAgent: USER_AGENT,
			viewport: {
				width: SCREEN_DIMENSIONS.WIDTH,
				height: SCREEN_DIMENSIONS.HEIGHT,
			},
		});

		this.logger.debug("[initializeBrowser] Context created", {
			viewport: `${SCREEN_DIMENSIONS.WIDTH}x${SCREEN_DIMENSIONS.HEIGHT}`,
			elapsedMs: Date.now() - startTime,
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

		this.logger.info("[initializeBrowser] Browser ready", {
			totalInitTimeMs: Date.now() - startTime,
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

	/**
	 * Timeout in milliseconds for Playwright screenshot capture.
	 */
	private static readonly SCREENSHOT_TIMEOUT = 5000;

	/**
	 * Public screenshot method that serializes requests through a queue.
	 * This prevents concurrent Playwright screenshot operations which can timeout
	 * when the page is busy with navigation or other operations.
	 */
	async screenshot(
		filename = "screenshot.png",
		trigger?: string,
		type: "error" | "fatal" | "manual" | "state_change" = "manual",
	): Promise<string | null> {
		// Chain onto the queue to serialize screenshot requests
		const screenshotPromise = this.screenshotQueue.then(() =>
			this.captureScreenshotInternal(filename, trigger, type),
		);

		// Update queue with this operation (don't propagate errors to next screenshot)
		this.screenshotQueue = screenshotPromise.catch(() => null);

		return screenshotPromise;
	}

	/**
	 * Internal screenshot implementation. Called through the queue to prevent
	 * concurrent Playwright operations.
	 */
	private async captureScreenshotInternal(
		filename: string,
		trigger?: string,
		type: "error" | "fatal" | "manual" | "state_change" = "manual",
	): Promise<string | null> {
		if (!this.page) {
			this.logger.warn("Screenshot skipped: Page not initialized", {
				filename,
				trigger,
			});

			return null;
		}

		// Include bot ID in filename to avoid collisions between concurrent bots
		const uniqueFilename = `bot-${this.settings.id}-${filename}`;
		const screenshotPath = `/tmp/${uniqueFilename}`;

		// Check if page is in a usable state
		let pageUrl: string;

		try {
			pageUrl = this.page.url();
		} catch {
			this.logger.warn("Screenshot skipped: Page not accessible", {
				filename: uniqueFilename,
				trigger,
			});

			return null;
		}

		this.logger.trace("Screenshot capture starting", {
			filename: uniqueFilename,
			trigger,
			type,
			pageUrl,
		});

		const startTime = Date.now();

		// Step 1: Capture screenshot from Playwright
		try {
			await this.page.screenshot({
				path: screenshotPath,
				type: "png",
				timeout: GoogleMeetBot.SCREENSHOT_TIMEOUT,
			});
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			const elapsedMs = Date.now() - startTime;

			this.logger.error("Screenshot capture failed (Playwright)", error, {
				filename: uniqueFilename,
				trigger,
				elapsedMs,
				isTimeout: error.message.includes("Timeout"),
				isPageClosed:
					error.message.includes("closed") ||
					error.message.includes("Target page"),
				pageUrl,
			});

			return null;
		}

		const captureMs = Date.now() - startTime;

		// Step 2: Read file and upload to Milo (if configured)
		if (this.uploadScreenshot) {
			let data: Buffer;

			try {
				data = await fsPromises.readFile(screenshotPath);
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));

				this.logger.error("Screenshot file read failed", error, {
					path: screenshotPath,
					isNotFound: error.message.includes("ENOENT"),
					isPermission: error.message.includes("EACCES"),
				});

				return null;
			}

			// Step 3: Upload to Milo (which compresses to WebP and uploads to S3)
			let result: Awaited<ReturnType<UploadScreenshotUseCase["execute"]>>;

			try {
				result = await this.uploadScreenshot.execute({
					botId: this.settings.id,
					data,
					type,
					state: this.emitter.getState(),
					trigger,
				});
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));

				this.logger.error("Screenshot upload to Milo failed", error, {
					filename: uniqueFilename,
					trigger,
					isTimeout: error.message.includes("timeout"),
					isNetwork:
						error.message.includes("ECONNREFUSED") ||
						error.message.includes("ETIMEDOUT"),
				});

				// Clean up local file even on upload failure
				try {
					await fsPromises.unlink(screenshotPath);
				} catch {
					// Ignore cleanup errors
				}

				return null;
			}

			// Step 4: Clean up local file
			try {
				await fsPromises.unlink(screenshotPath);
			} catch (error) {
				// Non-critical: log but don't fail
				this.logger.trace("Screenshot file cleanup failed", {
					error: error instanceof Error ? error.message : String(error),
					path: screenshotPath,
				});
			}

			const totalMs = Date.now() - startTime;

			this.logger.debug("Screenshot uploaded and compressed", {
				key: result.key,
				captureMs,
				totalMs,
			});

			return result.key;
		}

		this.logger.debug("Screenshot saved locally", {
			path: screenshotPath,
			captureMs,
		});

		return screenshotPath;
	}
}
