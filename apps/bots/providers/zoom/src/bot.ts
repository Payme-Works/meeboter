import fs from "node:fs";
import path from "node:path";
import type { Transform } from "node:stream";
import type { AppRouter } from "@meeboter/server";
import type { TRPCClient } from "@trpc/client";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { getStream, launch, wss } from "puppeteer-stream";
import { Bot } from "../../../src/bot";
import {
	type BotConfig,
	type EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";

// const muteButton = 'button[aria-label="Mute"]';
// const stopVideoButton = 'button[aria-label="Stop Video"]';
// Constant selectors

// Replaced buttons selector with IDs to avoid possible language mismatch
const muteButton = "#preview-audio-control-button";
const stopVideoButton = "#preview-video-control-button";
const joinButton = "button.zm-btn.preview-join-button";
const leaveButton = 'button[aria-label="Leave"]';
const acceptCookiesButton = "#onetrust-accept-btn-handler";
const acceptTermsButton = "#wc_agree1";

/**
 * Zoom bot implementation for managing Zoom meeting automation and recording.
 * Extends the base Bot class to provide Zoom-specific functionality including
 * joining meetings, recording audio/video, and handling meeting lifecycle events.
 */
export class ZoomBot extends Bot {
	/** Absolute path where the meeting recording will be saved */
	recordingPath: string;
	/** MIME type of the recording file (video/mp4) */
	contentType: string;
	/** Complete Zoom meeting URL with meeting ID and password */
	url: string;
	/** Puppeteer browser instance for web automation */
	browser!: Browser;
	/** Puppeteer page instance representing the meeting tab */
	page!: Page;
	/** File write stream for saving the recording */
	file!: fs.WriteStream | null;
	/** Transform stream for processing audio/video data */
	stream!: Transform;

	/**
	 * Creates a new ZoomBot instance.
	 * Initializes recording path, content type, and meeting URL based on bot configuration.
	 *
	 * @param botSettings - Configuration settings for the bot including meeting details
	 * @param onEvent - Callback function for handling bot events and status updates
	 */
	constructor(
		botSettings: BotConfig,
		onEvent: (
			eventType: EventCode,
			data?: Record<string, unknown>,
		) => Promise<void>,
		trpcInstance?: TRPCClient<AppRouter>,
	) {
		super(botSettings, onEvent, trpcInstance);
		this.recordingPath = path.resolve(__dirname, "recording.mp4");
		this.contentType = "video/mp4";
		this.url = `https://app.zoom.us/wc/${this.settings.meetingInfo.meetingId}/join?fromPWA=1&pwd=${this.settings.meetingInfo.meetingPassword}`;
	}

	/**
	 * Takes a screenshot of the current page and saves it to /tmp directory.
	 * Used for debugging and monitoring bot behavior during meeting participation.
	 *
	 * @param fName - Filename for the screenshot (defaults to "screenshot.png")
	 * @returns Promise that resolves when screenshot is saved
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
	 * Checks if the bot has been kicked from the meeting.
	 * Currently returns false as implementation is pending.
	 *
	 * @returns Promise that resolves to true if bot was kicked, false otherwise
	 * @todo Implement detection logic for when bot is removed from meeting
	 */
	async checkKicked(): Promise<boolean> {
		// TODO: Implement this
		return false;
	}

	/**
	 * Launches a headless browser with appropriate configuration for meeting automation.
	 * Sets up browser permissions for camera/microphone access and prepares the page context.
	 * Uses puppeteer-stream for video/audio capture capabilities.
	 *
	 * @returns Promise that resolves when browser is launched and configured
	 */
	async launchBrowser(): Promise<void> {
		// Launch a browser and open the meeting
		this.browser = (await launch({
			executablePath: puppeteer.executablePath(),
			headless: "new",
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--use-fake-device-for-media-stream",
				// "--use-fake-ui-for-media-stream"
			],
		})) as unknown as Browser; // It looks like theres a type issue with puppeteer.

		console.log("Browser launched");

		// Create a URL object from the url
		const urlObj = new URL(this.url);

		// Get the default browser context
		const context = this.browser.defaultBrowserContext();

		// Clear permission overrides and set our own to camera and microphone
		// This is to avoid the allow microphone and camera prompts
		context.clearPermissionOverrides();
		context.overridePermissions(urlObj.origin, ["camera", "microphone"]);
		console.log("Turned off camera & mic permissions");

		// Opens a new page in the browser
		this.page = await this.browser.newPage();
	}

	/**
	 * Opens a browser, navigates to the meeting URL, and joins the Zoom meeting.
	 * Handles various UI interactions including cookie acceptance, terms of service,
	 * muting audio/video, entering bot name, and waiting for successful meeting entry.
	 *
	 * @returns Promise that resolves when bot has successfully joined the meeting
	 * @throws {WaitingRoomTimeoutError} When bot is stuck in waiting room beyond timeout
	 * @throws {Error} When browser or page initialization fails
	 */
	async joinMeeting(): Promise<void> {
		// Launch
		await this.launchBrowser();

		// Create a URL object from the url
		const page = this.page;
		const urlObj = new URL(this.url);

		// Navigates to the url
		console.log("Attempting to open link");
		await page.goto(urlObj.href);
		console.log("Page opened");

		// Waits for the page's iframe to load
		console.log("Waiting for iFrame to load");
		const iframe = await page.waitForSelector(".pwa-webclient__iframe");
		const frame = await iframe?.contentFrame();
		console.log("Opened iFrame");

		if (frame) {
			// Wait for things to load (can be removed later in place of a check for a button to be clickable)
			await new Promise((resolve) => setTimeout(resolve, 1500));

			// Waits for mute button to be clickable and clicks it
			await new Promise((resolve) => setTimeout(resolve, 700)); // TODO: remove this line later

			// Checking if cookies modal popped up
			try {
				await frame.waitForSelector(acceptCookiesButton, {
					timeout: 700,
				});

				frame.click(acceptCookiesButton);
				console.log("Cookies Accepted");
			} catch (_error) {
				// It's OK
				console.warn("Cookies modal not found");
			}

			// Waits for the TOS button be clickable and clicks them
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Checking if TOS modal popped up
			try {
				await frame.waitForSelector(acceptTermsButton, {
					timeout: 700,
				});

				await frame.click(acceptTermsButton);
				console.log("TOS Accepted");
			} catch (_error) {
				// It's OK
				console.warn("TOS modal not found");
			}

			// Waits for the mute and video button to be clickable and clicks them
			// The timeout is big to make sure buttons are initialized. With smaller one click doesn't work randomly and bot joins the meeting with sound and/or video
			await new Promise((resolve) => setTimeout(resolve, 6000));

			await frame.waitForSelector(muteButton);
			await frame.click(muteButton);
			console.log("Muted");

			await frame.waitForSelector(stopVideoButton);
			await frame.click(stopVideoButton);
			console.log("Stopped video");

			// Waits for the input field and types the name from the config
			await frame.waitForSelector("#input-for-name");

			await frame.type(
				"#input-for-name",
				this.settings?.botDisplayName ?? "Meeboter",
			);

			console.log("Typed name");

			// Clicks the join button
			await frame.waitForSelector(joinButton);
			await frame.click(joinButton);
			console.log("Joined the meeting");

			// wait for the leave button to appear (meaning we've joined the meeting)
			await new Promise((resolve) => setTimeout(resolve, 1400)); // Needed to wait for the aria-label to be properly attached

			try {
				await frame.waitForSelector(leaveButton, {
					timeout: this.settings.automaticLeave.waitingRoomTimeout,
				});
			} catch (_error) {
				// Distinct error from regular timeout
				throw new WaitingRoomTimeoutError();
			}

			// Wait for the leave button to appear and be properly labeled before proceeding
			console.log("Leave button found and labeled, ready to start recording");
		} else {
			console.error("frame is not created!");
			console.error(frame);
			console.error(iframe);
		}
	}

	/**
	 * Starts recording the meeting audio and video streams.
	 * Creates a transform stream from the page and pipes it to a file write stream.
	 * Recording is saved to the path specified in recordingPath property.
	 *
	 * @returns Promise that resolves when recording has started
	 * @throws {Error} When page is not initialized
	 */
	async startRecording(): Promise<void> {
		// Check if the page is initialized
		if (!this.page) throw new Error("Page not initialized");

		// Create the stream
		this.stream = await getStream(
			this.page as unknown as Parameters<typeof getStream>[0],
			{
				audio: true,
				video: true,
			},
		);

		// Create and write the recording to a file, pipe the stream to a fileWriteStream
		this.file = fs.createWriteStream(this.recordingPath);
		this.stream.pipe(this.file);
	}

	/**
	 * Stops the meeting recording by destroying the transform stream.
	 * This closes the recording file and releases associated resources.
	 *
	 * @returns Promise that resolves when recording has stopped
	 */
	async stopRecording(): Promise<void> {
		// End the recording and close the file
		if (this.stream) this.stream.destroy();
	}

	/**
	 * Main execution method that orchestrates the complete bot lifecycle.
	 * Joins the meeting, starts recording (if enabled), and monitors meeting status.
	 * Continuously polls for meeting end conditions and handles cleanup when meeting ends.
	 *
	 * @returns Promise that resolves when meeting ends and bot lifecycle completes
	 * @throws {Error} When browser or page initialization fails
	 */
	async run(): Promise<void> {
		// Navigate and join the meeting
		await this.joinMeeting();

		// Ensure browser exists
		if (!this.browser) throw new Error("Browser not initialized");

		if (!this.page) throw new Error("Page is not initialized");

		// Start recording only if enabled
		if (this.settings.recordingEnabled) {
			console.log("Starting Recording");
			await this.startRecording();
		} else {
			console.log("Recording is disabled for this bot");
		}

		// Get the frame containing the meeting
		const iframe = await this.page.waitForSelector(".pwa-webclient__iframe");
		const frame = await iframe?.contentFrame();

		// Constantly check if the meeting has ended every second
		const checkMeetingEnd = () =>
			new Promise<void>((resolve, reject) => {
				const poll = async () => {
					try {
						// Wait for the "Ok" button to appear which indicates the meeting is over
						const okButton = await frame?.waitForSelector(
							'div[aria-label="Meeting is end now"] button.zm-btn.zm-btn-legacy.zm-btn--primary.zm-btn__outline--blue',
							{ timeout: 1000 },
						);

						if (okButton) {
							console.log("Meeting ended");

							// Click the button to leave the meeting
							await okButton.click();

							// Stop recording
							this.stopRecording();

							// End life -- close file, browser, and websocket server
							this.endLife();

							resolve();

							return;
						}

						// Schedule next iteration
						setTimeout(poll, 1000);
					} catch (err) {
						// If it was a timeout
						// @ts-expect-error
						if (err?.name === "TimeoutError") {
							// The button wasn’t there in the last second. Running next iteration
							setTimeout(poll, 1000);
						} else {
							// If it was some other error we throw it
							reject(err);
						}
					}
				};

				poll();
			});

		// Constantly check if Meeting is still running, every minute
		const checkIfMeetingRunning = () =>
			new Promise<void>((resolve, reject) => {
				const poll = async () => {
					try {
						// Checking if Leave buttons is present which indicates the meeting is still running
						const leaveButtonEl = await frame?.waitForSelector(leaveButton, {
							timeout: 700,
						});

						if (leaveButtonEl) {
							console.warn("Meeting in progress");
							setTimeout(poll, 60000);
						} else {
							// Leave button not found within timeout window
							console.error("Meeting ended unexpectedly");

							this.stopRecording();
							this.endLife();

							resolve();
						}
					} catch (err) {
						// Only treat a timeout as “meeting ended”; rethrow anything else.
						// @ts-expect-error
						if (err?.name === "TimeoutError") {
							console.error("Meeting ended unexpectedly");

							this.stopRecording();
							this.endLife();

							resolve();
						} else {
							reject(err);
						}
					}
				};

				poll();
			});

		// Start both meeting end checks in parallel and return once either of them finishes
		await Promise.race([checkMeetingEnd(), checkIfMeetingRunning()]);
	}

	/**
	 * Gets the absolute file path where the meeting recording is saved.
	 *
	 * @returns The complete file path to the recording file
	 */
	getRecordingPath(): string {
		return this.recordingPath;
	}

	/**
	 * Gets speaker timeframes for the meeting recording.
	 * Currently returns empty array as implementation is pending.
	 *
	 * @returns Array of speaker timeframes (empty until implemented)
	 * @todo Implement speaker detection and timeframe tracking
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		// TODO: Implement this
		return [];
	}

	/**
	 * Gets the MIME type of the recording file.
	 *
	 * @returns The content type string ("video/mp4")
	 */
	getContentType(): string {
		return this.contentType;
	}

	/**
	 * Cleans up all resources and terminates the bot lifecycle.
	 * Stops recording, closes file streams, shuts down browser, and closes websocket server.
	 * This method should be called when the meeting ends or bot needs to terminate.
	 *
	 * @returns Promise that resolves when all cleanup operations are complete
	 */
	async endLife(): Promise<void> {
		// Ensure recording is stopped in unideal situations
		this.stopRecording();

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
	}
}
