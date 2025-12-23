import type { AppRouter } from "@meeboter/milo";
import type { TRPCClient } from "@trpc/client";
import { env } from "./config/env";
import type { BotEventEmitter } from "./events";
import type { BotLogger } from "./logger";
import {
	type BotConfig,
	createTrpcClient,
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

	/** Event emitter for reporting bot lifecycle events and managing state */
	readonly emitter: BotEventEmitter;

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
	 * Creates a new Bot instance with the provided configuration and dependencies.
	 *
	 * @param settings - Bot configuration containing meeting info and other parameters
	 * @param emitter - Event emitter for reporting bot events and managing state
	 * @param logger - Logger instance for structured logging
	 * @param trpc - tRPC client instance for backend API calls (optional, creates default if not provided)
	 */
	constructor(
		settings: BotConfig,
		emitter: BotEventEmitter,
		logger: BotLogger,
		trpc?: TRPCClient<AppRouter>,
	) {
		this.settings = settings;
		this.emitter = emitter;
		this.logger = logger;

		// Create default tRPC client if not provided (for backward compatibility with tests)
		this.trpc =
			trpc ??
			createTrpcClient({
				url: env.MILO_URL,
				authToken: env.MILO_AUTH_TOKEN,
			});
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
		type?: "error" | "fatal" | "manual" | "state_change",
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
