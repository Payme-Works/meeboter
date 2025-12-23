import fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import type { Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { getStream, launch, wss } from "puppeteer-stream";
import { Bot } from "../../../src/bot";
import { env } from "../../../src/config/env";
import { CLEANUP_TIMEOUTS } from "../../../src/constants";
import type { BotEventEmitter } from "../../../src/events";
import { withTimeout } from "../../../src/helpers/with-timeout";
import type { BotLogger } from "../../../src/logger";
import type { StorageService } from "../../../src/services/storage/storage-service";
import { HEARTBEAT_INTERVAL } from "../../../src/trpc";
import {
	type BotConfig,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";
import { UploadScreenshotUseCase } from "../../../src/use-cases";
import { MicrosoftTeamsRemovalDetector } from "./detection";
import { SELECTORS } from "./selectors";

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
	private uploadScreenshot: UploadScreenshotUseCase | null = null;
	private s3Ready: Promise<void> | null = null;
	private removalDetector: MicrosoftTeamsRemovalDetector | null = null;

	browser!: Browser;
	page!: Page;
	participants: string[] = [];
	private participantsIntervalId: NodeJS.Timeout | null = null;
	private file: fs.WriteStream | null = null;
	private stream!: Transform;

	constructor(
		config: BotConfig,
		emitter: BotEventEmitter,
		logger: BotLogger,
		trpc?: TRPCClient<AppRouter>,
	) {
		super(config, emitter, logger, trpc);

		this.recordingPath = path.resolve(__dirname, "recording.webm");
		this.contentType = "video/webm";
		this.meetingUrl = `https://teams.microsoft.com/v2/?meetingjoin=true#/l/meetup-join/19:meeting_${this.settings.meeting.meetingId}@thread.v2/0?context=%7b%22Tid%22%3a%22${this.settings.meeting.tenantId}%22%2c%22Oid%22%3a%22${this.settings.meeting.organizerId}%22%7d&anon=true`;

		// Initialize S3 storage via dynamic import (Bun-specific API)
		// Store the promise so we can await it before taking screenshots
		this.s3Ready = this.initializeS3();
	}

	/**
	 * Initialize S3 storage provider via dynamic import.
	 * Returns a Promise that resolves when S3 is ready.
	 */
	private async initializeS3(): Promise<void> {
		const s3Endpoint = env.S3_ENDPOINT;
		const s3AccessKey = env.S3_ACCESS_KEY;
		const s3SecretKey = env.S3_SECRET_KEY;
		const s3BucketName = env.S3_BUCKET_NAME;

		if (!s3Endpoint || !s3AccessKey || !s3SecretKey || !s3BucketName) {
			this.logger.debug(
				"S3 storage not configured, screenshots will be local only",
			);

			return;
		}

		try {
			const { S3StorageProvider } = await import(
				"../../../src/services/storage/s3-provider"
			);

			const storageService: StorageService = new S3StorageProvider({
				endpoint: s3Endpoint,
				region: env.S3_REGION,
				accessKeyId: s3AccessKey,
				secretAccessKey: s3SecretKey,
				bucketName: s3BucketName,
			});

			this.uploadScreenshot = new UploadScreenshotUseCase(storageService);
			this.logger.debug("S3 storage initialized successfully");
		} catch (error) {
			this.logger.warn("S3 storage initialization failed", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	// --- Lifecycle methods ----------------------------------------

	/**
	 * Main entry point: join meeting and monitor until exit.
	 */
	async run(): Promise<void> {
		// Ensure S3 storage is initialized before proceeding
		if (this.s3Ready) {
			await this.s3Ready;
		}

		await this.joinCall();
		await this.monitorCall();
	}

	/**
	 * Join the Teams call.
	 */
	async joinCall(): Promise<void> {
		await this.initializeBrowser();

		// Initialize removal detector now that page is ready
		this.removalDetector = new MicrosoftTeamsRemovalDetector(
			this.page,
			this.logger,
		);

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
	 * Delegates to the RemovalDetector for detection logic.
	 */
	async hasBeenRemovedFromCall(): Promise<boolean> {
		if (!this.removalDetector) {
			return true;
		}

		const result = await this.removalDetector.check();

		return result.removed;
	}

	// --- Participant tracking -------------------------------------

	/**
	 * Open the participants panel.
	 */
	private async openParticipantsPanel(): Promise<void> {
		this.logger.debug("Opening participants panel");
		await this.page.locator(SELECTORS.peopleButton).click();
		await this.page.waitForSelector(SELECTORS.participantsTree);
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
						const tree = document.querySelector(selectors.participantsTree);

						if (!tree) return [];

						const items = Array.from(
							tree.querySelectorAll(selectors.participantInCall),
						);

						return items
							.map((el) => {
								const nameSpan = (el as Element).querySelector("span[title]");

								return (
									nameSpan?.getAttribute("title") ||
									nameSpan?.textContent?.trim() ||
									""
								);
							})
							.filter((name) => name);
					},
					{
						participantsTree: SELECTORS.participantsTree,
						participantInCall: SELECTORS.participantInCall,
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
			HEARTBEAT_INTERVAL,
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
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				// Memory optimization flags for resource-constrained environments
				"--disable-dev-shm-usage",
				"--disable-background-networking",
				"--disable-default-apps",
				"--disable-extensions",
				"--disable-sync",
				"--disable-translate",
				"--metrics-recording-only",
				"--no-first-run",
				"--safebrowsing-disable-auto-update",
				"--js-flags=--max-old-space-size=512",
			],
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
			.fill(this.settings.displayName ?? "Meeboter");

		this.logger.debug("Entered display name");

		await this.page.locator(SELECTORS.toggleMute).click();
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
	 * Timeout in milliseconds for Puppeteer screenshot capture.
	 */
	private static readonly SCREENSHOT_TIMEOUT = 5000;

	/**
	 * Take a screenshot, upload to S3, and persist to database.
	 * @param filename - Local filename for the screenshot
	 * @param trigger - Optional trigger description for S3 metadata
	 * @returns The S3 key if uploaded, local path if S3 not configured, or null on error
	 */
	async screenshot(
		filename: string = "screenshot.png",
		trigger?: string,
		type: "error" | "fatal" | "manual" | "state_change" = "manual",
	): Promise<string | null> {
		if (!this.page || !this.browser) {
			this.logger.warn("Screenshot failed: Browser/page not initialized", {
				filename,
				trigger,
			});

			return null;
		}

		// Include bot ID in filename to avoid collisions between concurrent bots
		const uniqueFilename = `bot-${this.settings.id}-${filename}`;
		const screenshotPath = `/tmp/${uniqueFilename}`;

		// Step 1: Capture screenshot from Puppeteer
		try {
			await withTimeout(
				this.page.screenshot({
					path: screenshotPath,
					type: "png",
				}),
				MicrosoftTeamsBot.SCREENSHOT_TIMEOUT,
				"Screenshot capture timed out",
			);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));

			this.logger.error("Screenshot capture failed (Puppeteer)", error, {
				filename: uniqueFilename,
				trigger,
				isTimeout: error.message.includes("timed out"),
				isPageClosed:
					error.message.includes("closed") ||
					error.message.includes("Target page"),
			});

			return null;
		}

		// Step 2: Read file and upload to S3 (if configured)
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

			// Step 3: Upload to S3
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

				this.logger.error("Screenshot S3 upload failed", error, {
					filename: uniqueFilename,
					trigger,
					isTimeout: error.message.includes("timeout"),
					isNetwork:
						error.message.includes("ECONNREFUSED") ||
						error.message.includes("ETIMEDOUT"),
				});

				// Clean up local file even on S3 failure
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
				this.logger.trace("Screenshot file cleanup failed", {
					error: error instanceof Error ? error.message : String(error),
					path: screenshotPath,
				});
			}

			this.logger.debug("Screenshot uploaded to S3", { key: result.key });

			// Step 5: Persist to database (non-blocking, fire-and-forget pattern)
			this.trpc.bots.addScreenshot
				.mutate({
					id: String(this.settings.id),
					screenshot: result,
				})
				.catch((dbError) => {
					this.logger.warn("Failed to persist screenshot to database", {
						error: dbError instanceof Error ? dbError.message : String(dbError),
						key: result.key,
					});
				});

			return result.key;
		}

		this.logger.debug("Screenshot saved locally", { path: screenshotPath });

		return screenshotPath;
	}
}
