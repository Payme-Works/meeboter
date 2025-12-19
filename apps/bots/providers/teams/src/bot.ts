import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
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

/** CSS selector for the leave button that appears when in a Microsoft Teams meeting */
const leaveButtonSelector =
	'button[aria-label="Leave (Ctrl+Shift+H)"], button[aria-label="Leave (⌘+Shift+H)"]';

/**
 * Microsoft Teams bot implementation that can join meetings, record audio/video,
 * track participants, and handle meeting lifecycle events.
 *
 * This bot uses Puppeteer to automate browser interactions with Microsoft Teams
 * web interface, enabling automated meeting participation and recording.
 */
export class MicrosoftTeamsBot extends Bot {
	/** File path where the meeting recording will be saved */
	recordingPath: string;
	/** MIME type for the recorded content */
	contentType: string;
	/** Microsoft Teams meeting URL constructed from meeting information */
	url: string;
	/** Array of current meeting participants' names */
	participants: string[];
	/** Interval ID for periodic participant list updates */
	participantsIntervalId: NodeJS.Timeout;
	/** Puppeteer browser instance for automation */
	browser!: Browser;
	/** Puppeteer page instance representing the Teams meeting tab */
	page!: Page;
	/** File write stream for saving the meeting recording */
	file!: fs.WriteStream | null;
	/** Transform stream for processing audio/video data */
	stream!: Transform;

	/**
	 * Creates a new Microsoft Teams bot instance.
	 *
	 * Initializes the bot with meeting configuration, sets up the Teams meeting URL,
	 * and prepares recording settings based on the provided bot configuration.
	 *
	 * @param botSettings - Configuration object containing meeting details and bot behavior settings
	 * @param onEvent - Callback function to handle bot lifecycle events and data updates
	 * @param trpcInstance - tRPC client instance for backend API calls
	 * @param logger - Logger instance for structured logging
	 */
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
		this.recordingPath = "./recording.webm";
		this.contentType = "video/webm";
		this.url = `https://teams.microsoft.com/v2/?meetingjoin=true#/l/meetup-join/19:meeting_${this.settings.meetingInfo.meetingId}@thread.v2/0?context=%7b%22Tid%22%3a%22${this.settings.meetingInfo.tenantId}%22%2c%22Oid%22%3a%22${this.settings.meetingInfo.organizerId}%22%7d&anon=true`;
		this.participants = [];
		this.participantsIntervalId = setInterval(() => {}, 0);
	}

	/**
	 * Gets the file path where the meeting recording is saved.
	 *
	 * @returns The absolute or relative path to the recording file
	 */
	getRecordingPath(): string {
		return this.recordingPath;
	}

	/**
	 * Gets speaker timeframes for the recorded meeting.
	 *
	 * This method is not yet implemented for Microsoft Teams bot.
	 * Future implementation should analyze the recording to identify
	 * when different speakers were active during the meeting.
	 *
	 * @returns Empty array (implementation pending)
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		// TODO: Implement this
		return [];
	}

	/**
	 * Gets the MIME content type of the recorded meeting file.
	 *
	 * @returns The content type string for the recording format
	 */
	getContentType(): string {
		return this.contentType;
	}

	/**
	 * Takes a screenshot of the current Teams meeting page.
	 *
	 * Captures the current state of the Teams meeting interface and saves it
	 * as a PNG file in the /tmp directory. Useful for debugging and monitoring
	 * the bot's visual state during meeting participation.
	 *
	 * @param fName - The filename for the screenshot (defaults to "screenshot.png")
	 * @returns Promise that resolves when the screenshot is saved
	 */
	async screenshot(fName: string = "screenshot.png"): Promise<void> {
		try {
			if (!this.page) throw new Error("Page not initialized");

			if (!this.browser) throw new Error("Browser not initialized");

			const screenshot = await this.page.screenshot({
				type: "png",
				encoding: "binary",
			});

			// Save the screenshot to a file
			const screenshotPath = path.resolve(`/tmp/${fName}`);
			fs.writeFileSync(screenshotPath, screenshot);
			console.log(`Screenshot saved to ${screenshotPath}`);
		} catch (e) {
			console.log("Error taking screenshot:", e);
		}
	}

	/**
	 * Launches a headless browser instance configured for Teams meeting participation.
	 *
	 * Initializes a Puppeteer browser with appropriate settings for media access,
	 * sets up camera and microphone permissions for the Teams domain, and creates
	 * a new page ready for meeting navigation.
	 *
	 * @returns Promise that resolves when the browser and page are ready
	 */
	async launchBrowser(): Promise<void> {
		// Launch the browser and open a new blank page
		this.browser = (await launch({
			executablePath: puppeteer.executablePath(),
			headless: "new",
			// args: ["--use-fake-ui-for-media-stream"],
			args: ["--no-sandbox"],
			protocolTimeout: 0,
		})) as unknown as Browser;

		// Parse the URL
		console.log("Parsing URL:", this.url);
		const urlObj = new URL(this.url);

		// Override camera and microphone permissions
		const context = this.browser.defaultBrowserContext();
		context.clearPermissionOverrides();
		context.overridePermissions(urlObj.origin, ["camera", "microphone"]);

		// Open a new page
		this.page = await this.browser.newPage();
		console.log("Opened Page");
	}

	/**
	 * Joins a Microsoft Teams meeting through automated browser interactions.
	 *
	 * This method orchestrates the complete meeting join workflow:
	 * 1. Launches and configures the browser
	 * 2. Navigates to the Teams meeting URL
	 * 3. Fills in the bot's display name
	 * 4. Mutes the microphone
	 * 5. Attempts to join the meeting
	 * 6. Handles waiting room scenarios with timeout
	 * 7. Waits for confirmation of successful meeting entry
	 *
	 * @throws {WaitingRoomTimeoutError} When stuck in waiting room longer than configured timeout
	 * @returns Promise that resolves when successfully joined the meeting
	 */
	async joinMeeting(): Promise<void> {
		await this.launchBrowser();

		// Navigate the page to a URL
		const urlObj = new URL(this.url);
		console.log("Navigating to URL:", urlObj.href);
		await this.page.goto(urlObj.href);

		// Fill in the display name
		await this.page
			.locator(`[data-tid="prejoin-display-name-input"]`)
			.fill(this.settings.botDisplayName ?? "Meeboter");

		console.log("Entered display name");

		// Mute microphone before joining
		await this.page.locator(`[data-tid="toggle-mute"]`).click();
		console.log("Muted microphone");

		// Join the meeting
		await this.page.locator(`[data-tid="prejoin-join-button"]`).click();
		console.log("Found and clicked the join button");

		// Wait until join button is disabled or disappears
		await this.page.waitForFunction(
			(selector) => {
				const joinButton = document.querySelector(selector);

				return !joinButton || joinButton.hasAttribute("disabled");
			},
			{},
			'[data-tid="prejoin-join-button"]',
		);

		// Check if we're in a waiting room by checking if the join button exists and is disabled
		const joinButton = await this.page.$('[data-tid="prejoin-join-button"]');

		const isWaitingRoom =
			joinButton &&
			(await joinButton.evaluate((button) => button.hasAttribute("disabled")));

		let timeout = 30000; // If not in the waiting room, wait 30 seconds to join the meeting

		if (isWaitingRoom) {
			console.log(
				`Joined waiting room, will wait for ${
					this.settings.automaticLeave.waitingRoomTimeout > 60 * 1000
						? `${
								this.settings.automaticLeave.waitingRoomTimeout / 60 / 1000
							} minute(s)`
						: `${
								this.settings.automaticLeave.waitingRoomTimeout / 1000
							} second(s)`
				}`,
			);

			// If in the waiting room, wait for the waiting room timeout
			timeout = this.settings.automaticLeave.waitingRoomTimeout; // In milliseconds
		}

		// Wait for the leave button to appear (meaning we've joined the meeting)
		console.log(
			"Waiting for the ability to leave the meeting (when I'm in the meeting...)",
			timeout,
			"ms",
		);

		try {
			await this.page.waitForSelector(leaveButtonSelector, {
				timeout: timeout,
			});
		} catch (_error) {
			// Distinct error from regular timeout
			throw new WaitingRoomTimeoutError();
		}

		// Log completion
		console.log("Successfully joined meeting");
	}

	/**
	 * Checks if the bot has been kicked or removed from the meeting.
	 *
	 * This method is not yet implemented. Future implementation should
	 * monitor the page for indicators that the bot has been removed
	 * from the meeting by a host or due to connection issues.
	 *
	 * @returns Promise that resolves to false (implementation pending)
	 */
	async checkKicked(): Promise<boolean> {
		// TODO: Implement this
		return false;
	}

	/**
	 * Starts recording the meeting audio and video stream.
	 *
	 * Initializes a media stream capture from the Teams meeting page,
	 * creates a file write stream, and begins piping the audio/video
	 * data to the designated recording file.
	 *
	 * @throws {Error} When the page is not initialized
	 * @returns Promise that resolves when recording has started
	 */
	async startRecording(): Promise<void> {
		if (!this.page) throw new Error("Page not initialized");

		// Get the stream
		this.stream = await getStream(
			this.page as unknown as Parameters<typeof getStream>[0],
			{ audio: true, video: true },
		);

		// Create a file
		this.file = fs.createWriteStream(this.getRecordingPath());
		this.stream.pipe(this.file);

		// Pipe the stream to a file
		console.log("Recording...");
	}

	/**
	 * Stops the ongoing meeting recording.
	 *
	 * Terminates the media stream capture and closes the recording pipeline.
	 * Safe to call multiple times - will only act if a recording is active.
	 *
	 * @returns Promise that resolves when recording has stopped
	 */
	async stopRecording(): Promise<void> {
		// Stop recording
		if (this.stream) {
			console.log("Stopping recording...");
			this.stream.destroy();
		}
	}

	/**
	 * Main execution method that orchestrates the complete bot lifecycle.
	 *
	 * This method handles the full workflow of bot operation:
	 * 1. Joins the Teams meeting
	 * 2. Sets up participant monitoring
	 * 3. Starts recording (if enabled)
	 * 4. Monitors meeting status until it ends
	 * 5. Performs cleanup operations
	 *
	 * The bot will remain active until the meeting ends (detected by the
	 * disappearance of the leave button) or until manually terminated.
	 *
	 * @returns Promise that resolves when the bot lifecycle is complete
	 */
	async run(): Promise<void> {
		// Start join process
		await this.joinMeeting();

		// Create a file to record to
		this.file = fs.createWriteStream(this.getRecordingPath());

		// Click the people button
		console.log("Opening the participants list");
		await this.page.locator('[aria-label="People"]').click();

		// Wait for the attendees tree to appear
		console.log("Waiting for the attendees tree to appear");
		const _tree = await this.page.waitForSelector('[role="tree"]');
		console.log("Attendees tree found");

		/**
		 * Updates the participants list by extracting names from the Teams UI.
		 * This function runs periodically to track meeting attendance changes.
		 */
		const updateParticipants = async (): Promise<void> => {
			try {
				const currentParticipants = await this.page.evaluate(() => {
					const participantsList = document.querySelector('[role="tree"]');

					if (!participantsList) {
						console.log("No participants list found");

						return [];
					}

					const currentElements = Array.from(
						participantsList.querySelectorAll(
							'[data-tid^="participantsInCall-"]',
						),
					);

					return currentElements
						.map((el) => {
							const nameSpan = el.querySelector("span[title]");

							return (
								nameSpan?.getAttribute("title") ||
								nameSpan?.textContent?.trim() ||
								""
							);
						})
						.filter((name) => name);
				});

				this.participants = currentParticipants;
			} catch (error) {
				console.log("Error getting participants:", error);
			}
		};

		// Get initial participants list
		await updateParticipants();

		// Then check for participants every heartbeatInterval milliseconds
		this.participantsIntervalId = setInterval(
			updateParticipants,
			this.settings.heartbeatInterval,
		);

		// Start recording only if enabled
		if (this.settings.recordingEnabled) {
			console.log("Starting recording");
			await this.startRecording();
		} else {
			console.log("Recording is disabled for this bot");
		}

		// Wait for meeting to end by watching for the "Leave" button to disappear
		// OR user requesting leave via UI (LEAVING status)
		const checkLeaveRequested = async (): Promise<"USER_REQUESTED"> => {
			while (!this.leaveRequested) {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			console.log(
				"Leaving: User requested bot removal via UI (LEAVING status)",
			);

			return "USER_REQUESTED";
		};

		const waitForMeetingEnd = async (): Promise<"MEETING_ENDED"> => {
			await this.page.waitForFunction(
				(selector) => !document.querySelector(selector),
				{ timeout: 0 },
				leaveButtonSelector,
			);

			return "MEETING_ENDED";
		};

		const leaveReason = await Promise.race([
			checkLeaveRequested(),
			waitForMeetingEnd(),
		]);

		console.log(`Meeting ended, reason: ${leaveReason}`);

		// Clear the participants checking interval
		clearInterval(this.participantsIntervalId);

		this.endLife();
	}

	/**
	 * Performs comprehensive cleanup of all bot resources.
	 *
	 * This method ensures proper cleanup of all resources used by the bot:
	 * - Closes file streams to prevent memory leaks
	 * - Terminates the browser instance
	 * - Shuts down the WebSocket server
	 * - Clears all intervals and timers
	 * - Stops any ongoing recording
	 *
	 * Should be called when the bot lifecycle ends to prevent resource leaks
	 * and ensure clean shutdown.
	 *
	 * @returns Promise that resolves when all cleanup is complete
	 */
	async endLife(): Promise<void> {
		// Close file if it exists
		if (this.file) {
			this.file.close();
			this.file = null;
		}

		// Close browser
		if (this.browser) {
			await this.browser.close();

			// Close the websocket server
			(await wss).close();
		}

		// Clear any intervals or timeouts to prevent open handles
		if (this.participantsIntervalId) {
			clearInterval(this.participantsIntervalId);
		}

		// Stop recording
		this.stopRecording();
	}
}
