import type { Bot } from "./bot";
import { env } from "./config/env";
import type { BotEventEmitter } from "./events";
import type { BotLogger } from "./logger";
import { type BotConfig, type EventCode, type TrpcClient } from "./trpc";

/**
 * Options for creating a bot instance
 */
interface CreateBotOptions {
	/**
	 * Callback fired when bot status changes (status events like IN_CALL, IN_WAITING_ROOM, etc.)
	 * Used for capturing screenshots on status transitions for debugging purposes.
	 * @param eventType - The status event type
	 * @param bot - The bot instance for capturing screenshots
	 */
	onStatusChange?: (eventType: EventCode, bot: Bot) => Promise<void>;

	/** Event emitter for reporting bot events and managing state (required) */
	eventEmitter: BotEventEmitter;

	/** Logger instance (required) */
	logger: BotLogger;

	/** tRPC client for API calls (required) */
	trpcClient: TrpcClient;
}

/**
 * Validates if the given platform matches the expected Docker image name.
 */
function validPlatformForImage(platform: string, imageName: string): boolean {
	return platform === imageName;
}

/**
 * Factory function that creates platform-specific bot instances.
 * This function handles the dynamic creation of bot implementations based on
 * the meeting platform specified in the configuration.
 *
 * @param config - Configuration data containing meeting info and bot settings
 * @param options - Configuration including trpcClient (required)
 * @returns Promise that resolves to a platform-specific bot instance
 * @throws Error if the platform is unsupported or if there's a platform/Docker image mismatch
 */
export async function createBot(
	config: BotConfig,
	options: CreateBotOptions,
): Promise<Bot> {
	const botId = config.id;
	const platform = config.meetingInfo.platform;
	const { onStatusChange, eventEmitter, logger, trpcClient: trpc } = options;

	logger.debug("createBot called", {
		botId,
		platform,
		hasOnStatusChange: !!onStatusChange,
		hasTrpc: !!trpc,
	});

	// Retrieve Docker image name from environment variable
	const dockerImageName = env.DOCKER_MEETING_PLATFORM;

	logger.debug("Docker platform check", {
		dockerImageName: dockerImageName || "(not set)",
		configPlatform: platform,
		willCheck: !!dockerImageName,
	});

	// Ensure the Docker image name matches the platform - safety check
	// If local development (implies DOCKER_MEETING_PLATFORM is not set), we don't need this check
	if (
		dockerImageName &&
		!validPlatformForImage(platform ?? "", dockerImageName)
	) {
		logger.error("Platform mismatch detected", undefined, {
			dockerImageName,
			configPlatform: platform,
		});

		throw new Error(
			`Docker image name ${dockerImageName} does not match platform ${platform}`,
		);
	}

	logger.info(`Creating bot for platform: ${platform}`);

	let bot: Bot;

	logger.debug("Loading platform module...", {
		platform: config.meetingInfo.platform,
	});

	// 3. Create platform-specific bot with emitter and logger
	switch (config.meetingInfo.platform) {
		case "google-meet": {
			logger.debug("Importing GoogleMeetBot module...");

			const { GoogleMeetBot } = await import(
				"../providers/google-meet/src/bot"
			);

			logger.debug("GoogleMeetBot module imported, creating instance...");

			bot = new GoogleMeetBot(config, eventEmitter, logger, trpc);
			logger.debug("GoogleMeetBot instance created");

			break;
		}

		case "microsoft-teams": {
			logger.debug("Importing MicrosoftTeamsBot module...");

			const { MicrosoftTeamsBot } = await import(
				"../providers/microsoft-teams/src/bot"
			);

			logger.debug("MicrosoftTeamsBot module imported, creating instance...");

			bot = new MicrosoftTeamsBot(config, eventEmitter, logger, trpc);
			logger.debug("MicrosoftTeamsBot instance created");

			break;
		}

		case "zoom": {
			logger.debug("Importing ZoomBot module...");
			const { ZoomBot } = await import("../providers/zoom/src/bot");
			logger.debug("ZoomBot module imported, creating instance...");

			bot = new ZoomBot(config, eventEmitter, logger, trpc);
			logger.debug("ZoomBot instance created");

			break;
		}

		default:
			logger.error(`Unsupported platform: ${config.meetingInfo.platform}`);

			throw new Error(`Unsupported platform: ${config.meetingInfo.platform}`);
	}

	// 4. Register onStatusChange listener if provided (needs bot reference)
	if (onStatusChange) {
		eventEmitter.on("event", (eventCode) => {
			onStatusChange(eventCode, bot).catch((err) => {
				logger.warn(
					`Failed to capture status change screenshot: ${err instanceof Error ? err.message : String(err)}`,
				);
			});
		});
		logger.debug("Status change listener registered");
	}

	return bot;
}
