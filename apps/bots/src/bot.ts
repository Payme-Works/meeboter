import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import { env } from "./config/env";
import { BotLogger } from "./logger";
import {
	type BotConfig,
	createTrpcClient,
	type EventCode,
	type SpeakerTimeframe,
} from "./trpc";

/**
 * Abstract base class for all meeting bots.
 * Provides the foundation for platform-specific bot implementations
 * and handles common functionality shared across all platforms.
 */
export abstract class Bot {
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
	 * @param trpcInstance - tRPC client instance for backend API calls (optional, creates default if not provided)
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

		// Create default tRPC client if not provided (for backward compatibility with tests)
		this.trpc =
			trpcInstance ??
			createTrpcClient({
				url: env.MILO_URL,
				authToken: env.MILO_AUTH_TOKEN,
			});

		this.logger = logger || new BotLogger(settings.id);
	}

	/**
	 * Opens a browser and navigates to join the meeting.
	 */
	abstract joinCall(): Promise<unknown>;

	/**
	 * Takes a screenshot of the current page and uploads to S3.
	 */
	abstract screenshot(
		filename?: string,
		trigger?: string,
	): Promise<string | null>;

	/**
	 * Cleans up resources and closes the browser.
	 */
	abstract cleanup(): Promise<unknown>;

	/**
	 * Runs the platform-specific bot through its complete lifecycle.
	 */
	abstract run(): Promise<void>;

	/**
	 * Gets the file path where the meeting recording is stored.
	 */
	abstract getRecordingPath(): string;

	/**
	 * Gets the MIME content type of the recording file.
	 */
	abstract getContentType(): string;

	/**
	 * Gets the speaker timeframe information from the meeting recording.
	 */
	abstract getSpeakerTimeframes(): SpeakerTimeframe[];

	/**
	 * Checks if the bot has been kicked or removed from the meeting.
	 */
	abstract hasBeenRemovedFromCall(): Promise<boolean>;

	/**
	 * Sends a chat message in the meeting.
	 */
	abstract sendChatMessage(message: string): Promise<boolean>;

	/**
	 * Requests the bot to leave the meeting gracefully.
	 * Sets the leaveRequested flag which should be checked in the bot's main loop.
	 */
	requestLeave(): void {
		this.logger.info("Leave requested by user, setting leaveRequested flag");
		this.leaveRequested = true;
	}
}
