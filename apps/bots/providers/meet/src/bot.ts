import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright-extra";
import type { PageVideoCapture } from "playwright-video";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Bot } from "../../../src/bot";
import {
	type BotConfig,
	EventCode,
	type SpeakerTimeframe,
	WaitingRoomTimeoutError,
} from "../../../src/types";

// Use stealth plugin to avoid detection
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromium.use(stealthPlugin);

// User agent constant -- set Feb 2025
const userAgent =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// Constant selectors
const enterNameField = 'input[type="text"][aria-label="Your name"]';
const askToJoinButton = '//button[.//span[text()="Ask to join"]]';
const joinNowButton = '//button[.//span[text()="Join now"]]';
const gotKickedDetector = '//button[.//span[text()="Return to home screen"]]';
const leaveButton = `//button[@aria-label="Leave call"]`;
const peopleButton = `//button[@aria-label="People"]`;

const _onePersonRemainingField =
	'//span[.//div[text()="Contributors"]]//div[text()="1"]';

const muteButton = `[aria-label*="Turn off microphone"]`; // *= -> contains
const cameraOffButton = `[aria-label*="Turn off camera"]`;

const infoPopupClick = `//button[.//span[text()="Got it"]]`;

const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

/**
 * Represents a participant in the Google Meet meeting.
 */
type Participant = {
	/** Unique identifier for the participant */
	id: string;
	/** Display name of the participant */
	name: string;
	/** Optional mutation observer for monitoring participant activity */
	observer?: MutationObserver;
};

/**
 * Generates a random delay with variance to simulate human-like behavior.
 * @param amount - Base delay amount in milliseconds
 * @returns Random delay within 10% variance of the base amount
 */
const randomDelay = (amount: number) =>
	(2 * Math.random() - 1) * (amount / 10) + amount;

/**
 * Global window interface extensions for browser context functions.
 * These functions are exposed to the browser page context for participant monitoring and recording.
 */
declare global {
	interface Window {
		/** Saves audio chunk data during recording */
		saveChunk: (chunk: number[]) => void;
		/** Stops the current recording session */
		stopRecording: () => void;

		/** Returns current list of meeting participants */
		getParticipants: () => Participant[];
		/** Handles participant join events */
		onParticipantJoin: (participant: Participant) => void;
		/** Handles participant leave events */
		onParticipantLeave: (participant: Participant) => void;
		/** Registers when a participant is speaking */
		registerParticipantSpeaking: (participant: Participant) => void;
		/** Sets up speech observation for a participant */
		observeSpeech: (node: Element, participant: Participant) => void;
		/** Handles merged audio scenarios in Google Meet */
		handleMergedAudio: () => void;

		/** Array of all participants currently tracked */
		participantArray: Participant[];
		/** Array of participants in merged audio mode */
		mergedAudioParticipantArray: Participant[];
		/** Media recorder instance for audio capture */
		recorder: MediaRecorder | undefined;
	}
}

/**
 * Google Meet bot implementation for automated meeting participation.
 *
 * Provides comprehensive functionality for joining Google Meet meetings,
 * recording sessions, monitoring participants, and managing meeting lifecycle.
 *
 * Key capabilities:
 * - Automated meeting join with configurable bot settings
 * - Screen and audio recording using FFmpeg
 * - Real-time participant monitoring and speech detection
 * - Automatic leave conditions (timeout, inactivity, kick detection)
 * - Speaker timeline tracking for meeting analysis
 *
 * @extends Bot
 */
export class GoogleMeetBot extends Bot {
	browserArgs: string[];
	browser?: Browser;
	page?: Page;

	meetingUrl: string;
	recorder: PageVideoCapture | undefined;
	kicked: boolean = false;
	recordingPath: string;
	participants: Participant[] = [];

	private registeredActivityTimestamps: {
		[participantName: string]: [number];
	} = {};

	private startedRecording: boolean = false;

	private lastActivity: number | undefined = undefined;
	private recordingStartedAt: number = 0;

	private ffmpegProcess: ChildProcessWithoutNullStreams | null;

	/**
	 * Creates a new Google Meet bot instance.
	 *
	 * @param botSettings - Bot configuration including meeting URL, display name, and behavior settings
	 * @param onEvent - Event callback function for communicating with the backend
	 */
	constructor(
		botSettings: BotConfig,
		onEvent: (
			eventType: EventCode,
			data?: Record<string, unknown>,
		) => Promise<void>,
	) {
		super(botSettings, onEvent);

		this.recordingPath = path.resolve(__dirname, "recording.mp4");

		this.browserArgs = [
			"--incognito",
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-features=IsolateOrigins,site-per-process",
			"--disable-infobars",
			"--disable-gpu", // disable gpu rendering

			"--use-fake-ui-for-media-stream", // automatically grants screen sharing permissions without a selection dialog
			"--use-file-for-fake-video-capture=/dev/null",
			"--use-file-for-fake-audio-capture=/dev/null",
			'--auto-select-desktop-capture-source="Chrome"', // record the first tab automatically
		];

		// Fetch
		this.meetingUrl = botSettings.meetingInfo.meetingUrl ?? "";
		this.kicked = false; // Flag for if the bot was kicked from the meeting, no need to click exit button
		this.startedRecording = false; // Flag to not duplicate recording start

		this.ffmpegProcess = null;
	}

	/**
	 * Executes the complete bot lifecycle: join meeting and perform monitoring actions.
	 */
	async run(): Promise<void> {
		await this.joinMeeting();
		await this.meetingActions();
	}

	/**
	 * Gets the consistent video recording file path.
	 * Ensures the directory exists before returning the path.
	 *
	 * @returns The absolute path to the recording file
	 */
	getRecordingPath(): string {
		// Ensure the directory exists
		const dir = path.dirname(this.recordingPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Give back the path
		return this.recordingPath;
	}

	/**
	 * Processes and returns speaker activity timeframes from the meeting.
	 * Consolidates speaking events into continuous timeframes with utterance grouping.
	 *
	 * @returns Array of speaker timeframes with names, start times, and end times
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		const processedTimeframes: {
			speakerName: string;
			start: number;
			end: number;
		}[] = [];

		// If time between chunks is less than this, we consider it the same utterance.
		const utteranceThresholdMs = 3000;
		for (const [speakerName, timeframesArray] of Object.entries(
			this.registeredActivityTimestamps,
		)) {
			let start = timeframesArray[0];
			let end = timeframesArray[0];

			for (let i = 1; i < timeframesArray.length; i++) {
				const currentTimeframe = timeframesArray[i] as number;

				if (currentTimeframe - end < utteranceThresholdMs) {
					end = currentTimeframe;
				} else {
					if (end - start > 500) {
						processedTimeframes.push({ speakerName, start, end });
					}

					start = currentTimeframe;
					end = currentTimeframe;
				}
			}
			processedTimeframes.push({ speakerName, start, end });
		}
		processedTimeframes.sort((a, b) => a.start - b.start || a.end - b.end);

		return processedTimeframes;
	}

	/**
	 * Gets the MIME content type for the recording file.
	 *
	 * @returns The content type string for MP4 video files
	 */
	getContentType(): string {
		return "video/mp4";
	}

	/**
	 * Launches Chromium browser with stealth configuration and creates a new page.
	 * Sets up proper viewport, permissions, and user agent for meeting participation.
	 *
	 * @param headless - Whether to run browser in headless mode (default: false)
	 */
	async launchBrowser(headless: boolean = false): Promise<void> {
		console.log("Launching browser...");

		// Launch browser
		this.browser = await chromium.launch({
			headless,
			args: this.browserArgs,
		});

		// Unpack dimensions
		const vp = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

		// Create browser context
		const context = await this.browser.newContext({
			permissions: ["camera", "microphone"],
			userAgent: userAgent,
			viewport: vp,
		});

		// Create page
		this.page = await context.newPage();
	}

	/**
	 * Joins the Google Meet meeting by launching browser and navigating through join flow.
	 * Handles name entry, camera/microphone settings, and waiting room scenarios.
	 *
	 * @throws WaitingRoomTimeoutError if stuck in waiting room beyond timeout
	 * @returns Promise that resolves to 0 on successful join
	 */
	async joinMeeting(): Promise<number> {
		// Launch
		await this.launchBrowser();

		console.log("Joining meeting...");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Initial delay
		await this.page.waitForTimeout(randomDelay(1000));

		// Inject anti-detection code using addInitScript
		await this.page.addInitScript(() => {
			// Disable navigator.webdriver to avoid detection
			Object.defineProperty(navigator, "webdriver", { get: () => undefined });

			// Override navigator.plugins to simulate real plugins
			Object.defineProperty(navigator, "plugins", {
				get: () => [
					{ name: "Chrome PDF Plugin" },
					{ name: "Chrome PDF Viewer" },
				],
			});

			// Override navigator.languages to simulate real languages
			Object.defineProperty(navigator, "languages", {
				get: () => ["en-US", "en"],
			});

			// Override other properties
			Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 }); // Fake number of CPU cores
			Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }); // Fake memory size
			Object.defineProperty(window, "innerWidth", { get: () => SCREEN_WIDTH }); // Fake screen resolution

			Object.defineProperty(window, "innerHeight", {
				get: () => SCREEN_HEIGHT,
			});

			Object.defineProperty(window, "outerWidth", { get: () => SCREEN_WIDTH });

			Object.defineProperty(window, "outerHeight", {
				get: () => SCREEN_HEIGHT,
			});
		});

		// Define bot name
		const name = this.settings.botDisplayName || "Live Boost";

		// Go to the meeting URL (simulate movement)
		console.log("Simulating movement...");

		await this.page.mouse.move(10, 672);
		await this.page.mouse.move(102, 872);
		await this.page.mouse.move(114, 1472);

		await this.page.waitForTimeout(300);

		await this.page.mouse.move(114, 100);
		await this.page.mouse.click(100, 100);

		// Navigate to meeting
		// Ensure the meeting URL is valid and normalized before navigating
		let normalizedUrl = this.meetingUrl.trim();

		// Add protocol if not http or https (default to https)
		if (
			!normalizedUrl.startsWith("http://") &&
			!normalizedUrl.startsWith("https://")
		) {
			normalizedUrl = `https://${normalizedUrl}`;
		}

		try {
			// Validate the URL
			const url = new URL(normalizedUrl);

			console.log(`Navigating to "${url.href}", waiting until "networkidle"`);

			await this.page.goto(url.href, {
				waitUntil: "networkidle",
			});
		} catch (error) {
			console.error(
				`Invalid meeting URL provided: "${this.meetingUrl}". Error:`,
				error,
			);

			throw new Error(
				`Cannot navigate to invalid meeting URL: "${this.meetingUrl}"`,
			);
		}

		console.log("Navigated to meeting URL");

		await this.page.bringToFront(); // Ensure active

		console.log("Waiting for the input field to be visible...");

		await this.page.waitForSelector(enterNameField, { timeout: 15000 }); // If it can't find the enter name field in 15 seconds then something went wrong

		console.log("Found it. Waiting for 1 second...");

		await this.page.waitForTimeout(randomDelay(1000));

		console.log("Filling the input field with the name...");

		await this.page.fill(enterNameField, name);

		console.log("Turning off camera and microphone...");

		try {
			await this.page.waitForTimeout(randomDelay(500));

			await this.page.click(muteButton, { timeout: 200 });

			await this.page.waitForTimeout(200);
		} catch (_e) {
			console.log("Could not turn off microphone, probably already off.");
		}

		try {
			await this.page.click(cameraOffButton, { timeout: 200 });
			await this.page.waitForTimeout(200);
		} catch (_e) {
			console.log("Could not turn off camera, probably already off.");
		}

		console.log(
			'Waiting for either the "Join now" or "Ask to join" button to appear...',
		);

		const entryButton = await Promise.race([
			this.page
				.waitForSelector(joinNowButton, { timeout: 60000 })
				.then(() => joinNowButton),
			this.page
				.waitForSelector(askToJoinButton, { timeout: 60000 })
				.then(() => askToJoinButton),
		]);

		await this.page.click(entryButton);

		// Should exit after the waiting room timeout if we're in the waiting room
		const timeout = this.settings.automaticLeave.waitingRoomTimeout; // in milliseconds

		// Wait for the leave button to appear (meaning we've joined the meeting)
		try {
			await this.page.waitForSelector(leaveButton, {
				timeout: timeout,
			});
		} catch (_e) {
			throw new WaitingRoomTimeoutError();
		}

		console.log("Joined call");

		await this.onEvent(EventCode.JOINING_CALL);

		return 0;
	}

	/**
	 * Generates FFmpeg command parameters for screen and audio recording.
	 * Uses test parameters when X11 server is not available, otherwise uses production settings.
	 *
	 * @returns Array of FFmpeg command line parameters
	 */
	getFFmpegParams(): string[] {
		// For testing (pnpm test) -- no docker x11 server running
		if (!fs.existsSync("/tmp/.X11-unix")) {
			console.log("Using test ffmpeg params");

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

		console.log("Loading FFmpeg params ...");

		const videoInputFormat = "x11grab";
		const audioInputFormat = "pulse";
		const videoSource = ":99.0";
		const audioSource = "default";
		const audioBitrate = "128k";
		const fps = "25";

		return [
			"-v",
			"verbose", // Verbose logging for debugging
			"-thread_queue_size",
			"512", // Increase thread queue size to handle input buffering
			"-video_size",
			`${SCREEN_WIDTH}x${SCREEN_HEIGHT}`, // Full screen resolution
			"-framerate",
			fps, // Lower frame rate to reduce CPU usage
			"-f",
			videoInputFormat,
			"-i",
			videoSource,
			"-thread_queue_size",
			"512",
			"-f",
			audioInputFormat,
			"-i",
			audioSource,
			"-c:v",
			"libx264", // H.264 codec for browser compatibility
			"-pix_fmt",
			"yuv420p", // Ensures compatibility with most browsers
			"-preset",
			"veryfast", // Use a faster preset to reduce CPU usage
			"-crf",
			"28", // Increase CRF for reduced CPU usage
			"-c:a",
			"aac", // AAC codec for audio compatibility
			"-b:a",
			audioBitrate, // Lower audio bitrate for reduced CPU usage
			"-vsync",
			"2", // Synchronize video and audio
			"-vf",
			"scale=1280:720", // Ensure the video is scaled to 720p
			"-y",
			this.getRecordingPath(), // Output file path
		];
	}

	/**
	 * Starts screen and audio recording using FFmpeg subprocess.
	 * Prevents duplicate recording processes and monitors FFmpeg output for status updates.
	 */
	async startRecording(): Promise<void> {
		console.log(
			"Attempting to start the recording to:",
			this.getRecordingPath(),
		);

		if (this.ffmpegProcess) {
			return console.log("Recording already started.");
		}

		this.ffmpegProcess = spawn("ffmpeg", this.getFFmpegParams());

		console.log("Spawned a subprocess to record, PID:", this.ffmpegProcess.pid);

		// Report any data / errors (DEBUG, since it also prints that data is available)
		this.ffmpegProcess.stderr.on("data", (_data) => {
			// Log that we got data, and the recording started
			if (!this.startedRecording) {
				console.log("Recording started...");

				this.startedRecording = true;
			}
		});

		// Log output of stderr
		// Log to console if the env var is set
		// Turn it on if FFmpeg gives a weird error code
		const logFfmpeg = process.env.MEET_FFMPEG_STDERR_ECHO === "true";

		if (logFfmpeg ?? false) {
			this.ffmpegProcess.stderr.on("data", (data) => {
				const text = data.toString();
				console.error(`ffmpeg stderr: ${text}`);
			});
		}

		// Report when the process exits
		this.ffmpegProcess.on("exit", (code) => {
			console.log(`FFmpeg exited with code ${code}`);

			this.ffmpegProcess = null;
		});

		console.log("Started FFmpeg process");
	}

	/**
	 * Gracefully stops the FFmpeg recording process and waits for file finalization.
	 * Sends SIGINT signal to allow proper video encoding completion.
	 *
	 * @returns Promise that resolves to 0 on success, 1 on failure
	 */
	async stopRecording(): Promise<number> {
		console.log("Attempting to stop the recording ...");

		// Await encoding result
		const promiseResult = await new Promise<number>((resolve) => {
			// No recording
			if (!this.ffmpegProcess) {
				console.log("No recording in progress, cannot end recording");

				resolve(1);

				return;
			}

			console.log("Killing FFmpeg process gracefully");

			this.ffmpegProcess.kill("SIGINT");

			console.log("Waiting for FFmpeg to finish encoding");

			// Modify the exit handler to resolve the promise
			// This will be called when the video is done encoding
			this.ffmpegProcess.on("exit", (code, signal) => {
				if (code === 0) {
					console.log("Recording stopped and file finalized");

					resolve(0);
				} else {
					console.error(
						`FFmpeg exited with code ${code}${signal ? ` and signal ${signal}` : ""}`,
					);

					resolve(1);
				}
			});

			// Modify the error handler to resolve the promise
			this.ffmpegProcess.on("error", (err) => {
				console.error("Error while stopping FFmpeg:", err);

				resolve(1);
			});
		});

		return promiseResult;
	}

	/**
	 * Takes a screenshot of the current browser page and saves it to /tmp directory.
	 *
	 * @param filename - Filename for the screenshot (default: "screenshot.png")
	 */
	async screenshot(filename: string = "screenshot.png"): Promise<void> {
		console.log("Taking screenshot...");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			const screenshot = await this.page.screenshot({
				type: "png",
			});

			// Save the screenshot to a file
			const screenshotPath = path.resolve(`/tmp/${filename}`);

			fs.writeFileSync(screenshotPath, screenshot);

			console.log(`Screenshot saved to ${screenshotPath}`);
		} catch (error) {
			console.log("Error taking screenshot:", error);
		}
	}

	/**
	 * Detects if the bot has been removed from the meeting.
	 * Checks multiple conditions including kick dialog, hidden leave button, and removal messages.
	 *
	 * @returns True if bot was kicked from meeting, false otherwise
	 */
	async checkKicked(): Promise<boolean> {
		console.log("Checking if bot has been kicked...");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		// Check if "Return to Home Page" button exists (kick condition 1)
		const returnHomeButtonCount = await this.page
			.locator(gotKickedDetector)
			.count()
			.catch(() => 0);

		console.log(
			`Kick condition 1: "Return home" button count: ${returnHomeButtonCount}`,
		);

		if (returnHomeButtonCount > 0) {
			console.log("Kick detected: Found 'Return to home screen' button");

			return true;
		}

		// Hidden leave button (Kick condition 2)
		const leaveButtonHidden = await this.page
			.locator(leaveButton)
			.isHidden({ timeout: 500 })
			.catch(() => true);

		console.log(`Kick condition 2: Leave button hidden: ${leaveButtonHidden}`);

		if (leaveButtonHidden) {
			console.log("Kick detected: Leave button is hidden");

			return true;
		}

		// Removed from meeting text (Kick condition 3)
		if (
			await this.page
				.locator('text="You\'ve been removed from the meeting"')
				.isVisible({ timeout: 500 })
				.catch(() => false)
		) {
			return true;
		}

		// Did not get kicked if reached here
		return false;
	}

	/**
	 * Handles Google Meet information popups by automatically dismissing them.
	 *
	 * @param timeout - Maximum time to wait for popup appearance (default: 5000ms)
	 */
	async handleInfoPopup(timeout = 5000): Promise<void> {
		console.log("Handling info popup...");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			await this.page.waitForSelector(infoPopupClick, { timeout });
		} catch (_e) {
			return;
		}

		console.log("Clicking the popup...");
		await this.page.click(infoPopupClick);
	}

	/**
	 * Orchestrates all meeting activities including recording, participant monitoring, and exit conditions.
	 *
	 * Main workflow:
	 * 1. Starts recording (if enabled)
	 * 2. Opens participant panel for monitoring
	 * 3. Sets up participant event handlers and observers
	 * 4. Monitors meeting conditions (alone timeout, kick detection, inactivity)
	 * 5. Exits when termination conditions are met
	 *
	 * @returns Promise that resolves to 0 on successful completion
	 */
	async meetingActions(): Promise<number> {
		// Start recording only if enabled
		if (this.settings.recordingEnabled) {
			console.log("Starting Recording");

			this.startRecording();
		} else {
			console.log("Recording is disabled for this bot");
		}

		console.log("Waiting for the 'Others might see you differently' popup...");

		await this.handleInfoPopup();

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			// UI patch: Find new people icon and click parent button
			const hasPeopleIcon = await this.page.evaluate(() => {
				const peopleButtonChild = Array.from(
					document.querySelectorAll("i"),
				).find((el) => el.textContent?.trim() === "people");

				if (peopleButtonChild) {
					const newPeopleButton = peopleButtonChild.closest("button");

					if (newPeopleButton) {
						newPeopleButton.click();

						return true;
					}
				}

				return false;
			});

			if (hasPeopleIcon) {
				console.log("Using new People button selector.");
			} else {
				console.warn("People button not found, using fallback selector.");

				await this.page.click(peopleButton);
			}

			// Wait for the people panel to be visible
			await this.page.waitForSelector('[aria-label="Participants"]', {
				state: "visible",
			});
		} catch (_error) {
			console.warn("Could not click People button. Continuing anyways.");
		}

		await this.page.exposeFunction("getParticipants", () => {
			return this.participants;
		});

		await this.page.exposeFunction(
			"onParticipantJoin",
			async (participant: Participant) => {
				this.participants.push(participant);
				await this.onEvent(EventCode.PARTICIPANT_JOIN, participant);
			},
		);

		await this.page.exposeFunction(
			"onParticipantLeave",
			async (participant: Participant) => {
				await this.onEvent(EventCode.PARTICIPANT_LEAVE, participant);

				this.participants = this.participants.filter(
					(p) => p.id !== participant.id,
				);

				// this.timeAloneStarted =
				// 	this.participants.length === 1 ? Date.now() : Infinity;
			},
		);

		await this.page.exposeFunction(
			"registerParticipantSpeaking",
			(participant: Participant) => {
				this.lastActivity = Date.now();

				const relativeTimestamp = Date.now() - this.recordingStartedAt;

				console.log(
					`Participant ${participant.name} is speaking at ${relativeTimestamp}ms`,
				);

				if (!this.registeredActivityTimestamps[participant.name]) {
					this.registeredActivityTimestamps[participant.name] = [
						relativeTimestamp,
					];
				} else {
					this.registeredActivityTimestamps[participant.name]?.push(
						relativeTimestamp,
					);
				}
			},
		);

		// Add mutation observer for participant list
		// Use in the browser context to monitor for participants joining and leaving
		await this.page.evaluate(() => {
			const peopleList = document.querySelector('[aria-label="Participants"]');

			if (!peopleList) {
				console.error("Could not find participants list element");

				return;
			}

			const initialParticipants = Array.from(peopleList.childNodes).filter(
				(node) => node.nodeType === Node.ELEMENT_NODE,
			);

			window.participantArray = [];
			window.mergedAudioParticipantArray = [];

			window.observeSpeech = (node, participant) => {
				console.debug("Observing speech for participant:", participant.name);

				const activityObserver = new MutationObserver((mutations) => {
					mutations.forEach(() => {
						window.registerParticipantSpeaking(participant);
					});
				});

				activityObserver.observe(node, {
					attributes: true,
					subtree: true,
					childList: true,
					attributeFilter: ["class"],
				});

				participant.observer = activityObserver;
			};

			window.handleMergedAudio = () => {
				const mergedAudioNode = document.querySelector(
					'[aria-label="Merged audio"]',
				);

				if (mergedAudioNode) {
					const detectedParticipants: Participant[] = [];

					// Gather all participants in the merged audio node
					mergedAudioNode.parentNode?.childNodes.forEach((childNode) => {
						const participantId = (childNode as Element).getAttribute(
							"data-participant-id",
						);

						if (!participantId) {
							return;
						}

						detectedParticipants.push({
							id: participantId,
							name: (childNode as Element).getAttribute("aria-label") ?? "",
						});
					});

					// Detected new participant in the merged node
					if (
						detectedParticipants.length >
						window.mergedAudioParticipantArray.length
					) {
						// Add them
						const filteredParticipants = detectedParticipants.filter(
							(participant: Participant) =>
								!window.mergedAudioParticipantArray.find(
									(p: Participant) => p.id === participant.id,
								),
						);

						filteredParticipants.forEach((participant: Participant) => {
							const vidBlock = document.querySelector(
								`[data-requested-participant-id="${participant.id}"]`,
							);

							window.mergedAudioParticipantArray.push(participant);
							window.onParticipantJoin(participant);
							window.observeSpeech(vidBlock as Element, participant);
							window.participantArray.push(participant);
						});
					} else if (
						detectedParticipants.length <
						window.mergedAudioParticipantArray.length
					) {
						// Some participants no longer in the merged node
						const filteredParticipants =
							window.mergedAudioParticipantArray.filter(
								(participant: Participant) =>
									!detectedParticipants.find(
										(p: Participant) => p.id === participant.id,
									),
							);

						filteredParticipants.forEach((participant: Participant) => {
							const videoRectangle = document.querySelector(
								`[data-requested-participant-id="${participant.id}"]`,
							);

							if (!videoRectangle) {
								// They've left the meeting
								window.onParticipantLeave(participant);

								window.participantArray = window.participantArray.filter(
									(p: Participant) => p.id !== participant.id,
								);
							}

							// Update participants under merged audio
							window.mergedAudioParticipantArray =
								window.mergedAudioParticipantArray.filter(
									(p: Participant) => p.id !== participant.id,
								);
						});
					}
				}
			};

			initialParticipants.forEach((node) => {
				const participant = {
					id: (node as Element).getAttribute("data-participant-id") ?? "",
					name: (node as Element).getAttribute("aria-label") ?? "",
				};

				if (!participant.id) {
					window.handleMergedAudio();

					return;
				}

				window.onParticipantJoin(participant);
				window.observeSpeech(node as Element, participant);
				window.participantArray.push(participant);
			});

			console.log("Setting up mutation observer on participants list");

			const peopleObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.type === "childList") {
						mutation.removedNodes.forEach((node) => {
							console.log("Removed node:", node);

							if (
								node.nodeType === Node.ELEMENT_NODE &&
								(node as Element).getAttribute &&
								(node as Element).getAttribute("data-participant-id") &&
								window.participantArray.find(
									(p: Participant) =>
										p.id ===
										(node as Element).getAttribute("data-participant-id"),
								)
							) {
								console.log(
									"Participant left:",
									(node as Element).getAttribute("aria-label"),
								);

								window.onParticipantLeave({
									id:
										(node as Element).getAttribute("data-participant-id") ?? "",
									name: (node as Element).getAttribute("aria-label") ?? "",
								});

								window.participantArray = window.participantArray.filter(
									(p: Participant) =>
										p.id !==
										(node as Element).getAttribute("data-participant-id"),
								);
							} else if (
								document.querySelector('[aria-label="Merged audio"]')
							) {
								window.handleMergedAudio();
							}
						});
					}

					mutation.addedNodes.forEach((node) => {
						console.log("Added node:", node);

						if (
							(node as Element).getAttribute?.("data-participant-id") &&
							!window.participantArray.find(
								(p: Participant) =>
									p.id ===
									(node as Element).getAttribute("data-participant-id"),
							)
						) {
							console.log(
								"Participant joined:",
								(node as Element).getAttribute("aria-label"),
							);

							const participant = {
								id: (node as Element).getAttribute("data-participant-id") ?? "",
								name: (node as Element).getAttribute("aria-label") ?? "",
							};

							window.onParticipantJoin(participant);
							window.observeSpeech(node as Element, participant);

							window.participantArray.push(participant);
						} else if (document.querySelector('[aria-label="Merged audio"]')) {
							window.handleMergedAudio();
						}
					});
				});
			});

			peopleObserver.observe(peopleList, { childList: true, subtree: true });
		});

		// Loop -- check for end meeting conditions every second
		console.log("Waiting until a leave condition is fulfilled..");

		while (true) {
			// DISABLED: Check if it's only me in the meeting
			// This functionality has been temporarily disabled due to false positives
			// where the bot incorrectly detects it's alone when other participants are present
			/*
			if (this.participants.length === 1) {
				const leaveMs =
					this.settings?.automaticLeave?.everyoneLeftTimeout ?? 60000;

				const msDiff = Date.now() - this.timeAloneStarted;

				console.log(
					`[DEBUG] Only me left check - Participants: ${this.participants.length}, Time alone: ${msDiff / 1000}s / ${leaveMs / 1000}s`,
				);
				console.log(
					`[DEBUG] Current participants: ${JSON.stringify(this.participants.map(p => ({ id: p.id, name: p.name })))}`,
				);

				if (msDiff > leaveMs) {
					console.log(
						"[DEBUG] LEAVING: Only one participant remaining for more than allocated time",
					);
					console.log(
						`[DEBUG] LEAVE REASON: EVERYONE_LEFT_TIMEOUT - Was alone for ${msDiff / 1000}s (threshold: ${leaveMs / 1000}s)`,
					);

					break;
				}
			}
			*/

			console.log(
				`Participants check: ${this.participants.length} participants detected (everyone-left detection DISABLED)`,
			);

			// Got kicked, no longer in the meeting
			// Check each of the potential conditions
			if (await this.checkKicked()) {
				console.log("Leaving: Detected that we were kicked from the meeting");

				console.log("Leave reason: KICKED");

				this.kicked = true; // Store

				break; // Exit loop
			}

			// Inactivity timeout disabled - bots will remain in meetings regardless of speaking activity

			await this.handleInfoPopup(1000);

			// Reset loop
			console.log("Waiting 5 seconds.");

			await setTimeout(5000); // 5 second loop
		}

		// Exit
		console.log("Starting end life actions...");

		try {
			await this.leaveMeeting();

			return 0;
		} catch (_e) {
			await this.endLife();

			return 1;
		}
	}

	/**
	 * Performs cleanup operations including stopping recording and closing browser.
	 */
	async endLife(): Promise<void> {
		// Ensure recording is done
		if (this.settings.recordingEnabled) {
			console.log("Stopping recording...");

			await this.stopRecording();
		}

		console.log("Done");

		// Close my browser
		if (this.browser) {
			await this.browser.close();

			console.log("Closed browser");
		}
	}

	/**
	 * Attempts to gracefully leave the meeting and performs cleanup.
	 * Tries to click the leave button, then calls endLife() regardless of success.
	 *
	 * @returns Promise that resolves to 0 on successful completion
	 */
	async leaveMeeting(): Promise<number> {
		// Try and find the leave button, press. Otherwise, just delete the browser
		console.log("Trying to leave the call...");

		if (!this.page) {
			throw new Error("Page not initialized");
		}

		try {
			await this.page.click(leaveButton, { timeout: 1000 }); // Short attempt

			console.log("Left call");
		} catch (_e) {
			// If we couldn't leave the call, we probably already left
			console.log("Attempted to leave call, couldn't (probably already left)");
		}

		console.log("Ending life...");

		await this.endLife();

		return 0;
	}
}
