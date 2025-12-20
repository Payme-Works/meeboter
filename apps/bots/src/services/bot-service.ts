import {
	BotCreationError,
	BotNotInitializedError,
	PlatformMismatchError,
	UnsupportedPlatformError,
} from "../errors/bot-errors";
import type { BotLogger, ScreenshotData } from "../logger";
import {
	type BotConfig,
	type EventCode,
	type SpeakerTimeframe,
	STATUS_EVENT_CODES,
	type Status,
	type TrpcClient,
} from "../trpc";
import type { S3Service } from "./s3-service";

/**
 * Interface defining the contract for all bot implementations.
 * This interface ensures consistent behavior across different platform bots.
 */
export interface BotInterface {
	readonly settings: BotConfig;
	readonly logger: BotLogger;

	onEvent: (
		eventType: EventCode,
		data?: Record<string, unknown>,
	) => Promise<void>;

	getRecordingPath(): string;
	getContentType(): string;
	getSpeakerTimeframes(): SpeakerTimeframe[];
	run(): Promise<void>;
	screenshot(fName?: string): Promise<void>;
	joinCall(): Promise<unknown>;
	cleanup(): Promise<unknown>;
	hasBeenRemovedFromCall(): Promise<boolean>;
	sendChatMessage(message: string): Promise<boolean>;
	requestLeave(): void;
}

/**
 * Options for creating a bot instance
 */
export interface CreateBotOptions {
	initialLogLevel?: string;
	onStatusChange?: (eventType: EventCode, bot: BotInterface) => Promise<void>;
}

/**
 * Service for managing bot lifecycle, screenshots, and orchestration.
 * Wraps the existing Bot hierarchy with a service layer.
 */
export class BotService {
	private bot: BotInterface | null = null;
	private leaveRequested = false;

	constructor(
		private readonly logger: BotLogger,
		private readonly trpc: TrpcClient,
		private readonly s3: S3Service,
	) {}

	/**
	 * Creates a platform-specific bot instance
	 */
	async createBot(
		config: BotConfig,
		options?: CreateBotOptions,
	): Promise<BotInterface> {
		const platform = config.meetingInfo.platform;

		if (!platform) {
			throw new UnsupportedPlatformError("undefined");
		}

		this.logger.info(`Creating bot for platform: ${platform}`);

		// Create event handler that reports events and updates status
		const createEventHandler =
			(bot: BotInterface) =>
			async (eventType: EventCode, data?: Record<string, unknown>) => {
				// Report the event to the events log
				await this.trpc.bots.events.report.mutate({
					id: String(config.id),
					event: {
						eventType,
						eventTime: new Date(),
						data: data
							? {
									description:
										(data.message as string) || (data.description as string),
									sub_code: data.sub_code as string | undefined,
								}
							: null,
					},
				});

				// Also update status if this is a status-changing event
				if (STATUS_EVENT_CODES.includes(eventType)) {
					await this.trpc.bots.updateStatus.mutate({
						id: String(config.id),
						status: eventType as unknown as Status,
					});
				}

				// Trigger onStatusChange callback for status events (non-blocking)
				if (options?.onStatusChange) {
					options.onStatusChange(eventType, bot).catch((err) => {
						this.logger.warn(
							`Failed to capture status change screenshot: ${err instanceof Error ? err.message : String(err)}`,
						);
					});
				}
			};

		// Placeholder handler used during bot construction
		const placeholderHandler = async () => {};

		// Import and create platform-specific bot
		let bot: BotInterface;

		try {
			switch (platform) {
				case "google": {
					const { GoogleMeetBot } = await import(
						"../../providers/google-meet/src/bot"
					);

					bot = new GoogleMeetBot(
						config,
						placeholderHandler,
						this.trpc,
						this.logger,
					);

					break;
				}

				case "teams": {
					const { MicrosoftTeamsBot } = await import(
						"../../providers/teams/src/bot"
					);

					bot = new MicrosoftTeamsBot(
						config,
						placeholderHandler,
						this.trpc,
						this.logger,
					);

					break;
				}

				case "zoom": {
					const { ZoomBot } = await import("../../providers/zoom/src/bot");

					bot = new ZoomBot(config, placeholderHandler, this.trpc, this.logger);

					break;
				}

				default:
					throw new UnsupportedPlatformError(platform);
			}
		} catch (error) {
			if (
				error instanceof UnsupportedPlatformError ||
				error instanceof PlatformMismatchError
			) {
				throw error;
			}

			throw new BotCreationError(
				platform,
				error instanceof Error ? error : new Error(String(error)),
			);
		}

		// Replace placeholder with full event handler
		bot.onEvent = createEventHandler(bot);

		this.bot = bot;

		return bot;
	}

	/**
	 * Gets the current bot instance
	 */
	getBot(): BotInterface | null {
		return this.bot;
	}

	/**
	 * Gets the bot instance, throwing if not initialized
	 */
	getBotOrThrow(): BotInterface {
		if (!this.bot) {
			throw new BotNotInitializedError();
		}

		return this.bot;
	}

	/**
	 * Captures a screenshot and uploads it to S3
	 */
	async captureAndUploadScreenshot(
		type: ScreenshotData["type"],
		trigger?: string,
	): Promise<ScreenshotData | null> {
		if (!this.bot) {
			this.logger.warn("Cannot capture screenshot: bot not initialized");

			return null;
		}

		try {
			const localPath = await this.bot.logger.captureScreenshot(type, trigger);

			if (!localPath) {
				return null;
			}

			const screenshotData = await this.s3.uploadScreenshot(
				localPath,
				this.bot.settings.id,
				type,
				this.bot.logger.getState(),
				trigger,
			);

			if (screenshotData) {
				// Save to backend
				try {
					await this.trpc.bots.addScreenshot.mutate({
						id: String(this.bot.settings.id),
						screenshot: {
							...screenshotData,
							capturedAt: screenshotData.capturedAt.toISOString(),
						},
					});

					this.logger.info(`Screenshot saved to backend: ${type}`);
				} catch (error) {
					this.logger.warn(
						`Failed to save screenshot to backend: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			return screenshotData;
		} catch (error) {
			this.logger.warn(
				`Failed to capture/upload screenshot: ${error instanceof Error ? error.message : String(error)}`,
			);

			return null;
		}
	}

	/**
	 * Uploads a recording to S3
	 */
	async uploadRecording(): Promise<string> {
		const bot = this.getBotOrThrow();

		if (!bot.settings.recordingEnabled) {
			this.logger.debug("Recording was disabled, skipping S3 upload");

			return "";
		}

		this.logger.info("Starting upload to S3...");

		const platform = bot.settings.meetingInfo.platform ?? "unknown";
		const filePath = bot.getRecordingPath();
		const contentType = bot.getContentType();

		return this.s3.uploadRecording(filePath, platform, contentType);
	}

	/**
	 * Requests the bot to leave the meeting gracefully
	 */
	requestLeave(): void {
		this.leaveRequested = true;
		this.bot?.requestLeave();
	}

	/**
	 * Checks if leave has been requested
	 */
	isLeaveRequested(): boolean {
		return this.leaveRequested;
	}

	/**
	 * Sends a chat message via the bot
	 */
	async sendChatMessage(message: string): Promise<boolean> {
		if (!this.bot) {
			this.logger.warn("Cannot send chat message: bot not initialized");

			return false;
		}

		return this.bot.sendChatMessage(message);
	}
}

/**
 * Validates if the given platform matches the expected Docker image name.
 */
export function validPlatformForImage(
	platform: string,
	imageName: string,
): boolean {
	if (platform === imageName) return true;

	// Special case: ignore any mismatch between platform and bot name for Google Meet
	if (platform === "google" && imageName === "meet") return true;

	return false;
}
