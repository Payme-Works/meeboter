import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import { env } from "./env";
import { BotLogger, parseLogLevel } from "./logger";
import { reportEvent } from "./monitoring";
import { trpc } from "./trpc";
import {
	type BotConfig,
	type EventCode,
	type SpeakerTimeframe,
	Status,
} from "./types";

/**
 * Interface defining the contract for all bot implementations.
 * This interface ensures consistent behavior across different platform bots
 * and provides a standardized API for bot lifecycle management.
 */
export interface BotInterface {
	/** Bot configuration settings containing meeting info and other parameters */
	readonly settings: BotConfig;

	/** Logger instance for structured logging with breadcrumbs and screenshots */
	readonly logger: BotLogger;

	/**
	 * Event handler for bot lifecycle and operational events.
	 * @param eventType - The type of event being reported
	 * @param data - Optional additional data associated with the event
	 * @returns Promise that resolves when the event is processed
	 */
	onEvent: (
		eventType: EventCode,
		data?: Record<string, unknown>,
	) => Promise<void>;

	/**
	 * Gets the file path where the meeting recording is stored.
	 * @returns The absolute path to the recording file
	 */
	getRecordingPath(): string;

	/**
	 * Gets the MIME content type of the recording file.
	 * @returns The content type string (e.g., "video/mp4", "audio/wav")
	 */
	getContentType(): string;

	/**
	 * Executes the main bot workflow including joining the meeting,
	 * setting up recording, and managing the bot lifecycle.
	 * @returns Promise that resolves when the bot completes its execution
	 */
	run(): Promise<void>;

	/**
	 * Captures a screenshot of the current page for debugging purposes.
	 * @param fName - Optional filename for the screenshot
	 * @returns Promise that resolves when the screenshot is saved
	 */
	screenshot(fName?: string): Promise<void>;

	/**
	 * Initiates the process of joining the meeting.
	 * @returns Promise that resolves with platform-specific join result
	 */
	joinMeeting(): Promise<unknown>;

	/**
	 * Cleans up resources and terminates the bot session.
	 * @returns Promise that resolves with cleanup result
	 */
	endLife(): Promise<unknown>;

	/**
	 * Checks if the bot has been removed or kicked from the meeting.
	 * @returns Promise that resolves to true if the bot was kicked, false otherwise
	 */
	checkKicked(): Promise<boolean>;

	/**
	 * Sends a chat message in the meeting (if supported by the platform).
	 * @param message - The message text to send
	 * @returns Promise that resolves to true if message was sent successfully, false otherwise
	 */
	sendChatMessage(message: string): Promise<boolean>;

	/**
	 * Requests the bot to leave the meeting gracefully.
	 * Called when user requests bot removal via the UI.
	 */
	requestLeave(): void;
}

/**
 * Base implementation for all meeting bots.
 * This abstract implementation provides the foundation for platform-specific
 * bot implementations and handles common functionality shared across all platforms.
 */
export class Bot implements BotInterface {
	/** Bot configuration settings containing meeting information and parameters */
	readonly settings: BotConfig;

	/** Logger instance for structured logging with breadcrumbs and screenshots */
	readonly logger: BotLogger;

	/**
	 * Event handler function for reporting bot lifecycle and operational events.
	 * This function is injected during bot creation to handle event reporting.
	 */
	onEvent: (
		eventType: EventCode,
		data?: Record<string, unknown>,
	) => Promise<void>;

	/**
	 * tRPC client instance for making API calls to the backend
	 */
	protected trpc: TRPCClient<AppRouter>;

	/**
	 * Flag indicating if a leave has been requested via user action.
	 * When true, the bot's main loop should exit gracefully.
	 */
	protected leaveRequested: boolean = false;

	/**
	 * Creates a new Bot instance with the provided configuration and event handler.
	 *
	 * @param settings - Bot configuration containing meeting info and other parameters
	 * @param onEvent - Event handler function for reporting bot events
	 * @param trpcInstance - tRPC client instance for backend API calls
	 * @param logger - Optional logger instance (created if not provided)
	 */
	constructor(
		settings: BotConfig,
		onEvent: (
			eventType: EventCode,
			data?: Record<string, unknown>,
		) => Promise<void>,
		trpcInstance?: TRPCClient<AppRouter>,
		logger?: BotLogger,
	) {
		this.settings = settings;
		this.onEvent = onEvent;
		this.trpc = trpcInstance || trpc;
		this.logger = logger || new BotLogger(settings.id);
	}

	/**
	 * Opens a browser and navigates to join the meeting.
	 * This method handles the platform-specific process of connecting to a meeting,
	 * including authentication, navigation, and initial setup.
	 *
	 * @returns Promise that resolves with platform-specific join result data
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	async joinMeeting(): Promise<unknown> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Takes a screenshot of the current page and saves it to a file for debugging purposes.
	 * This method captures the current state of the browser window to help with
	 * troubleshooting bot behavior and meeting interface interactions.
	 *
	 * @param _fName - Optional filename for the screenshot. If not provided, a default name will be generated
	 * @returns Promise that resolves when the screenshot is successfully saved
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	async screenshot(_fName?: string): Promise<void> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Cleans up resources and closes the browser.
	 * This method handles the graceful shutdown of the bot by cleaning up all
	 * allocated resources, closing browser instances, and performing any necessary
	 * cleanup operations. Implementation varies by platform but should always be
	 * called at the end of the bot's lifecycle.
	 *
	 * Particularly useful in testing environments where the bot might not be able
	 * to close the browser due to different lifecycle management or test termination.
	 *
	 * @returns Promise that resolves with cleanup result data
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	async endLife(): Promise<unknown> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Runs the platform-specific bot through its complete lifecycle.
	 * This method orchestrates the entire bot workflow including:
	 * 1. Joining the meeting
	 * 2. Setting up recording capabilities
	 * 3. Monitoring the meeting session
	 * 4. Gracefully leaving when appropriate
	 *
	 * The implementation varies by platform but follows this general pattern
	 * to ensure consistent behavior across all bot types.
	 *
	 * @returns Promise that resolves when the bot completes its full lifecycle
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	async run(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Gets the file path where the meeting recording is stored.
	 * This method returns the absolute path to the recording file that was
	 * created during the meeting session. The path format and location may
	 * vary depending on the platform and configuration settings.
	 *
	 * @returns The absolute file path to the recording
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	getRecordingPath(): string {
		throw new Error("Method not implemented.");
	}

	/**
	 * Gets the MIME content type of the recording file.
	 * This method returns the appropriate content type string for the recording
	 * file format, such as "video/mp4" for video recordings or "audio/wav" for
	 * audio-only recordings. The content type depends on the platform's recording
	 * capabilities and configuration.
	 *
	 * @returns The MIME content type string for the recording file
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	getContentType(): string {
		throw new Error("Method not implemented.");
	}

	/**
	 * Gets the speaker timeframe information from the meeting recording.
	 * This method returns an array of timeframe objects that indicate when
	 * different speakers were active during the meeting. This information is
	 * useful for creating speaker-segmented transcriptions or summaries.
	 *
	 * @returns Array of speaker timeframe objects containing timing and speaker information
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		throw new Error("Method not implemented.");
	}

	/**
	 * Checks if the bot has been kicked or removed from the meeting.
	 * This method monitors the meeting state to determine if the bot has been
	 * forcibly removed by a meeting host or due to meeting policies. Different
	 * platforms may have varying indicators for this condition.
	 *
	 * @returns Promise that resolves to true if the bot has been kicked, false otherwise
	 * @throws Error when called on the base implementation - must be overridden by platform-specific bots
	 */
	async checkKicked(): Promise<boolean> {
		throw new Error("Method not implemented.");
	}

	async sendChatMessage(_message: string): Promise<boolean> {
		throw new Error("Method not implemented.");
	}

	/**
	 * Requests the bot to leave the meeting gracefully.
	 * Sets the leaveRequested flag which should be checked in the bot's main loop.
	 */
	requestLeave(): void {
		this.logger.info("Leave requested by user, setting leaveRequested flag");
		this.leaveRequested = true;
	}
}

/**
 * Validates if the given platform matches the expected Docker image name.
 * This function ensures that the bot is running on the correct platform as defined
 * in the Docker environment or configuration, providing a safety check to prevent
 * platform mismatches that could cause runtime errors.
 *
 * @param platform - The platform name from BotConfig (e.g., "google", "teams", "zoom")
 * @param imageName - The Docker image name from Dockerfile or environment variable
 * @returns True if the platform matches the image name, or if platform is "google" and image name is "meet"
 */
const validPlatformForImage = (
	platform: string,
	imageName: string,
): boolean => {
	if (platform === imageName) return true;

	// Special case: ignore any mismatch between platform and bot name for Google Meet
	if (platform === "google" && imageName === "meet") return true;

	return false;
};

/**
 * Options for creating a bot instance
 */
export interface CreateBotOptions {
	/** Initial log level string from database */
	initialLogLevel?: string;

	/**
	 * Callback fired when bot status changes (status events like IN_CALL, IN_WAITING_ROOM, etc.)
	 * Used for capturing screenshots on status transitions for debugging purposes.
	 * @param eventType - The status event type
	 * @param bot - The bot instance for capturing screenshots
	 */
	onStatusChange?: (eventType: EventCode, bot: Bot) => Promise<void>;
}

/**
 * Factory function that creates platform-specific bot instances.
 * This function handles the dynamic creation of bot implementations based on
 * the meeting platform specified in the configuration. It includes safety checks
 * to ensure platform compatibility and dynamically imports the appropriate
 * bot implementation to optimize bundle size.
 *
 * The factory pattern allows for:
 * - Dynamic bot creation based on platform
 * - Lazy loading of platform-specific implementations
 * - Centralized event handling setup
 * - Platform validation and safety checks
 *
 * @param botData - Configuration data containing meeting info and bot settings
 * @param options - Optional configuration including initialLogLevel and onStatusChange callback
 * @returns Promise that resolves to a platform-specific bot instance
 * @throws Error if the platform is unsupported or if there's a platform/Docker image mismatch
 */
export const createBot = async (
	botData: BotConfig,
	options?: CreateBotOptions,
): Promise<Bot> => {
	const botId = botData.id;
	const platform = botData.meetingInfo.platform;
	const { initialLogLevel, onStatusChange } = options ?? {};

	// Retrieve Docker image name from environment variable
	const dockerImageName = env.DOCKER_MEETING_PLATFORM;

	// Ensure the Docker image name matches the platform - safety check
	// If local development (implies DOCKER_MEETING_PLATFORM is not set), we don't need this check
	if (
		dockerImageName &&
		!validPlatformForImage(platform ?? "", dockerImageName)
	) {
		throw new Error(
			`Docker image name ${dockerImageName} does not match platform ${platform}`,
		);
	}

	// Create logger with initial log level from database
	const logLevel = initialLogLevel ? parseLogLevel(initialLogLevel) : undefined;
	const logger = new BotLogger(botId, { logLevel });

	logger.info(`Creating bot for platform: ${platform}`);

	/**
	 * Creates an event handler that reports events and triggers status change callbacks.
	 * The bot instance is captured in a closure to enable screenshot capture on status changes.
	 */
	const createEventHandler =
		(bot: Bot) =>
		async (eventType: EventCode, data?: Record<string, unknown>) => {
			await reportEvent(botId, eventType, data);

			// Trigger onStatusChange callback for status events (non-blocking)
			if (onStatusChange && eventType in Status) {
				onStatusChange(eventType, bot).catch((err) => {
					logger.warn(
						`Failed to capture status change screenshot: ${err instanceof Error ? err.message : String(err)}`,
					);
				});
			}
		};

	// Placeholder event handler used during bot construction
	// Will be replaced with the full handler after bot creation
	const placeholderHandler = async () => {};

	let bot: Bot;

	switch (botData.meetingInfo.platform) {
		case "google": {
			const { GoogleMeetBot } = await import("../providers/meet/src/bot");

			bot = new GoogleMeetBot(botData, placeholderHandler, trpc, logger);

			break;
		}

		case "teams": {
			const { MicrosoftTeamsBot } = await import("../providers/teams/src/bot");

			bot = new MicrosoftTeamsBot(botData, placeholderHandler, trpc, logger);

			break;
		}

		case "zoom": {
			const { ZoomBot } = await import("../providers/zoom/src/bot");

			bot = new ZoomBot(botData, placeholderHandler, trpc, logger);

			break;
		}

		default:
			throw new Error(`Unsupported platform: ${botData.meetingInfo.platform}`);
	}

	// Replace placeholder with full event handler that has access to the bot instance
	bot.onEvent = createEventHandler(bot);

	return bot;
};
