import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
import { setTimeout } from "node:timers/promises";
import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Page } from "puppeteer";
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

// ============================================
// SECTION 2: MICROSOFT TEAMS BOT CLASS
// ============================================

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
	 */
	private async monitorCall(): Promise<void> {
		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Open participants panel
		await this.openParticipantsPanel();

		// Start participant tracking
		this.startParticipantTracking();

		// Start recording if enabled
		if (this.settings.recordingEnabled) {
			this.logger.info("Starting recording");
			await this.startRecording();
		}

		this.logger.debug("Monitoring call for exit conditions");

		// Race between exit conditions
		await Promise.race([this.waitForMeetingEnd(), this.waitForLeaveRequest()]);

		await this.cleanup();
	}

	/**
	 * Clean up resources.
	 */
	async cleanup(): Promise<void> {
		this.logger.info("State: IN_CALL → ENDING");

		// Stop participant tracking
		if (this.participantsIntervalId) {
			clearInterval(this.participantsIntervalId);
			this.participantsIntervalId = null;
		}

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
	 * Wait for meeting end (leave button disappears).
	 */
	private async waitForMeetingEnd(): Promise<void> {
		await this.page.waitForFunction(
			(selector) => !document.querySelector(selector),
			{ timeout: 0 },
			SELECTORS.leaveButton,
		);

		this.logger.info("Meeting ended: Leave button no longer visible");
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
	 * Check if bot has been kicked (not implemented for Teams).
	 */
	async checkKicked(): Promise<boolean> {
		return false;
	}

	// ============================================
	// PARTICIPANT TRACKING
	// ============================================

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
	 * Get speaker timeframes (not implemented for Teams).
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

	// Alias for backward compatibility
	async launchBrowser(): Promise<void> {
		await this.initializeBrowser();
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
