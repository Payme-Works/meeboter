import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { getStream, launch, wss } from "puppeteer-stream";
import { Bot } from "../../../src/bot";
import { env } from "../../../src/config/env";
import { withTimeout } from "../../../src/helpers/with-timeout";
import type { BotLogger } from "../../../src/logger";
import { createS3ProviderFromEnv } from "../../../src/services/storage/s3-provider";
import { StorageService } from "../../../src/services/storage/storage-service";
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

// Expected domain for Microsoft Teams
const TEAMS_DOMAIN = "teams.microsoft.com";

// --- Selectors ------------------------------------------------

const SELECTORS = {
	// Pre-join controls
	displayNameInput: '[data-tid="prejoin-display-name-input"]',
	muteButton: '[data-tid="toggle-mute"]',
	joinButton: '[data-tid="prejoin-join-button"]',

	// In-call controls
	leaveButton:
		'button[aria-label="Leave (Ctrl+Shift+H)"], button[aria-label="Leave (⌘+Shift+H)"]',
	peopleButton: '[aria-label="People"]',

	// Participants panel
	attendeesTree: '[role="tree"]',
	participantItem: '[data-tid^="participantsInCall-"]',
} as const;

// --- Microsoft Teams bot class --------------------------------

/**
 * Simplified Microsoft Teams bot for automated meeting participation.
 *
 * Key capabilities:
 * - Join Teams meetings via web client
 * - Screen and audio recording using puppeteer-stream
 * - Participant tracking via interval polling
 * - Automatic leave on meeting end or user request
 */
export class MicrosoftTeamsBot extends Bot {
	private recordingPath: string;
	private contentType: string;
	private meetingUrl: string;
	private storageService: StorageService;

	browser!: Browser;
	page!: Page;
	participants: string[] = [];
	private participantsIntervalId: NodeJS.Timeout | null = null;
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

		this.recordingPath = path.resolve(__dirname, "recording.webm");
		this.contentType = "video/webm";
		this.meetingUrl = `https://teams.microsoft.com/v2/?meetingjoin=true#/l/meetup-join/19:meeting_${this.settings.meetingInfo.meetingId}@thread.v2/0?context=%7b%22Tid%22%3a%22${this.settings.meetingInfo.tenantId}%22%2c%22Oid%22%3a%22${this.settings.meetingInfo.organizerId}%22%7d&anon=true`;
		const s3Provider = createS3ProviderFromEnv(env);
		this.storageService = new StorageService(s3Provider);
	}

	// --- Lifecycle methods ----------------------------------------

	/**
	 * Main entry point: join meeting and monitor until exit.
	 */
	async run(): Promise<void> {
		await this.joinCall();
		await this.monitorCall();
	}

	/**
	 * Join the Teams call.
	 */
	async joinCall(): Promise<void> {
		await this.initializeBrowser();

		this.logger.info("State: LAUNCHING → NAVIGATING");

		// Navigate to meeting
		await this.page.goto(this.meetingUrl);
		this.logger.info("State: NAVIGATING → PRE_JOIN");

		// Fill name and configure media
		await this.fillNameAndMute();
		await this.clickJoinButton();

		// Wait for call entry
		await this.waitForCallEntry();

		this.logger.info("State: JOINING → IN_CALL");
	}

	/**
	 * Monitor the call and handle exit conditions.
	 * Uses a polling loop pattern consistent with Google Meet bot.
	 */
	private async monitorCall(): Promise<void> {
		const monitorStartTime = Date.now();

		this.logger.info("[monitorCall] Starting call monitoring");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Open participants panel
		await this.openParticipantsPanel();

		// Start participant tracking
		this.startParticipantTracking();

		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("[monitorCall] Starting recording");
			await this.startRecording();
		}

		this.logger.debug("[monitorCall] Entering monitoring loop");

		let loopCount = 0;
		let exitReason = "unknown";

		// Polling loop (consistent with Google Meet pattern)
		try {
			while (true) {
				loopCount++;

				// Log every 12 iterations (~1 minute) for health check
				if (loopCount % 12 === 0) {
					this.logger.trace("[monitorCall] Health check", {
						loopCount,
						leaveRequested: this.leaveRequested,
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

				// Check 2: Were we removed from the call?
				try {
					const checkStart = Date.now();
					const wasRemoved = await this.hasBeenRemovedFromCall();

					if (wasRemoved) {
						exitReason = "removed_from_call";

						this.logger.info("[monitorCall] Exit: Removed from meeting", {
							checkDurationMs: Date.now() - checkStart,
						});

						break;
					}
				} catch (error) {
					exitReason = "removal_check_error";

					this.logger.error(
						"[monitorCall] Exit: Error checking removal status",
						error instanceof Error ? error : new Error(String(error)),
					);

					break;
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

		const monitorDurationMs = Date.now() - monitorStartTime;

		this.logger.info("[monitorCall] Exit condition triggered", {
			exitReason,
			loopCount,
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
			hasParticipantsInterval: !!this.participantsIntervalId,
			hasFile: !!this.file,
			hasBrowser: !!this.browser,
		});

		// Stop participant tracking
		if (this.participantsIntervalId) {
			clearInterval(this.participantsIntervalId);
			this.participantsIntervalId = null;
			this.logger.debug("[cleanup] Participant tracking stopped");
		}

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

	// --- Meeting monitoring ---------------------------------------

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

		// Check 1: Verify we're still on Teams domain
		try {
			const currentUrl = this.page.url();
			const url = new URL(currentUrl);

			this.logger.trace("[hasBeenRemovedFromCall] URL check", {
				currentHostname: url.hostname,
				expectedHostname: TEAMS_DOMAIN,
				fullUrl: currentUrl,
			});

			if (url.hostname !== TEAMS_DOMAIN) {
				this.logger.info(
					"[hasBeenRemovedFromCall] REMOVED: Domain mismatch detected",
					{
						currentDomain: url.hostname,
						expectedDomain: TEAMS_DOMAIN,
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

		// Check 2: Leave button gone (call ended or kicked)
		try {
			const leaveButton = await this.page.$(SELECTORS.leaveButton);

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
				"[hasBeenRemovedFromCall] Error checking leave button, assuming still in call",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);
		}

		this.logger.trace("[hasBeenRemovedFromCall] Still in call");

		return false;
	}

	// --- Participant tracking -------------------------------------

	/**
	 * Open the participants panel.
	 */
	private async openParticipantsPanel(): Promise<void> {
		this.logger.debug("Opening participants panel");
		await this.page.locator(SELECTORS.peopleButton).click();
		await this.page.waitForSelector(SELECTORS.attendeesTree);
		this.logger.debug("Participants panel opened");
	}

	/**
	 * Start periodic participant list updates.
	 */
	private startParticipantTracking(): void {
		const updateParticipants = async (): Promise<void> => {
			try {
				const currentParticipants = await this.page.evaluate(
					(selectors) => {
						const tree = document.querySelector(selectors.attendeesTree);

						if (!tree) return [];

						const items = Array.from(
							tree.querySelectorAll(selectors.participantItem),
						);

						return items
							.map((el) => {
								const nameSpan = el.querySelector("span[title]");

								return (
									nameSpan?.getAttribute("title") ||
									nameSpan?.textContent?.trim() ||
									""
								);
							})
							.filter((name) => name);
					},
					{
						attendeesTree: SELECTORS.attendeesTree,
						participantItem: SELECTORS.participantItem,
					},
				);

				this.participants = currentParticipants;
			} catch {
				// Silently continue on error
			}
		};

		// Initial update
		updateParticipants();

		// Periodic updates
		this.participantsIntervalId = setInterval(
			updateParticipants,
			this.settings.heartbeatInterval,
		);
	}

	// --- Recording ------------------------------------------------

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
	 * Get speaker timeframes (not implemented for Teams).
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		return [];
	}

	/**
	 * Send a chat message (not implemented for Teams).
	 */
	async sendChatMessage(_message: string): Promise<boolean> {
		this.logger.debug("Chat not implemented for Teams");

		return false;
	}

	// --- Browser utilities ----------------------------------------

	/**
	 * Initialize browser.
	 */
	async initializeBrowser(): Promise<void> {
		this.logger.info("Initializing browser");

		this.browser = (await launch({
			executablePath: puppeteer.executablePath(),
			headless: "new",
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
			protocolTimeout: 0,
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
	 * Fill display name and mute microphone.
	 */
	private async fillNameAndMute(): Promise<void> {
		await this.page
			.locator(SELECTORS.displayNameInput)
			.fill(this.settings.botDisplayName ?? "Meeboter");

		this.logger.debug("Entered display name");

		await this.page.locator(SELECTORS.muteButton).click();
		this.logger.debug("Muted microphone");
	}

	/**
	 * Click join button and wait for it to be processed.
	 */
	private async clickJoinButton(): Promise<void> {
		await this.page.locator(SELECTORS.joinButton).click();
		this.logger.debug("Clicked join button");

		// Wait for join button to be disabled or disappear
		await this.page.waitForFunction(
			(selector) => {
				const joinButton = document.querySelector(selector);

				return !joinButton || joinButton.hasAttribute("disabled");
			},
			{},
			SELECTORS.joinButton,
		);
	}

	/**
	 * Wait for call entry (leave button visible).
	 */
	private async waitForCallEntry(): Promise<void> {
		// Check if we're in waiting room
		const joinButton = await this.page.$(SELECTORS.joinButton);

		const isWaitingRoom =
			joinButton &&
			(await joinButton.evaluate((button) => button.hasAttribute("disabled")));

		const timeout = isWaitingRoom
			? this.settings.automaticLeave.waitingRoomTimeout
			: 30000;

		if (isWaitingRoom) {
			this.logger.info("In waiting room, waiting for admission", {
				timeout: `${timeout / 1000}s`,
			});
		}

		try {
			await this.page.waitForSelector(SELECTORS.leaveButton, { timeout });
		} catch {
			throw new WaitingRoomTimeoutError("Bot was not admitted to meeting");
		}

		this.logger.debug("Call entry confirmed");
	}

	/**
	 * Take a screenshot, upload to S3, and persist to database.
	 * @param filename - Local filename for the screenshot
	 * @param trigger - Optional trigger description for S3 metadata
	 * @returns The S3 key if uploaded, local path if S3 failed, or null on error
	 */
	async screenshot(
		filename: string = "screenshot.png",
		trigger?: string,
	): Promise<string | null> {
		if (!this.page || !this.browser) {
			throw new Error("Browser/page not initialized");
		}

		try {
			const screenshotPath = `/tmp/${filename}`;

			await this.page.screenshot({
				path: screenshotPath,
				type: "png",
			});

			const s3Result = await this.storageService.uploadScreenshot(
				screenshotPath,
				this.settings.id,
				"manual",
				this.logger.getState(),
				trigger,
			);

			if (s3Result) {
				this.logger.debug("Screenshot uploaded to S3", { key: s3Result.key });

				// Persist screenshot to database
				try {
					await this.trpc.bots.addScreenshot.mutate({
						id: String(this.settings.id),
						screenshot: s3Result,
					});
				} catch (dbError) {
					this.logger.warn("Failed to persist screenshot to database", {
						error: dbError instanceof Error ? dbError.message : String(dbError),
					});
				}

				return s3Result.key;
			}

			this.logger.debug("Screenshot saved locally", { path: screenshotPath });

			return screenshotPath;
		} catch (error) {
			this.logger.error("Error taking screenshot", error as Error);

			return null;
		}
	}
}
