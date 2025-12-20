import type { Bot } from "./bot";
import { env } from "./config/env";
import type { BotLogger } from "./logger";
import {
	type BotConfig,
	type EventCode,
	STATUS_EVENT_CODES,
	Status,
	type TrpcClient,
} from "./trpc";

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

	/** tRPC client for API calls (required) */
	trpcClient: TrpcClient;

	/** Logger instance with streaming enabled (required) */
	logger: BotLogger;
}

/**
 * Validates if the given platform matches the expected Docker image name.
 */
function validPlatformForImage(platform: string, imageName: string): boolean {
	if (platform === imageName) return true;

	// Special case: ignore any mismatch between platform and bot name for Google Meet
	if (platform === "google" && imageName === "meet") return true;

	return false;
}

/**
 * Factory function that creates platform-specific bot instances.
 * This function handles the dynamic creation of bot implementations based on
 * the meeting platform specified in the configuration.
 *
 * @param config - Configuration data containing meeting info and bot settings
 * @param options - Configuration including logger and trpcClient (required)
 * @returns Promise that resolves to a platform-specific bot instance
 * @throws Error if the platform is unsupported or if there's a platform/Docker image mismatch
 */
export async function createBot(
	config: BotConfig,
	options: CreateBotOptions,
): Promise<Bot> {
	const botId = config.id;
	const platform = config.meetingInfo.platform;
	const { onStatusChange, trpcClient: trpc, logger } = options;

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

	logger.info(`Creating bot for platform: ${platform}`);

	/**
	 * Creates an event handler that reports events and triggers status change callbacks.
	 * The bot instance is captured in a closure to enable screenshot capture on status changes.
	 */
	const createEventHandler =
		(bot: Bot) =>
		async (eventType: EventCode, data?: Record<string, unknown>) => {
			// Report the event to the events log
			await trpc.bots.events.report.mutate({
				id: String(botId),
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
				await trpc.bots.updateStatus.mutate({
					id: String(botId),
					status: eventType as unknown as Status,
				});
			}

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

	switch (config.meetingInfo.platform) {
		case "google": {
			const { GoogleMeetBot } = await import(
				"../providers/google-meet/src/bot"
			);

			bot = new GoogleMeetBot(config, placeholderHandler, trpc, logger);

			break;
		}

		case "microsoft-teams": {
			const { MicrosoftTeamsBot } = await import(
				"../providers/microsoft-teams/src/bot"
			);

			bot = new MicrosoftTeamsBot(config, placeholderHandler, trpc, logger);

			break;
		}

		case "zoom": {
			const { ZoomBot } = await import("../providers/zoom/src/bot");

			bot = new ZoomBot(config, placeholderHandler, trpc, logger);

			break;
		}

		default:
			throw new Error(`Unsupported platform: ${config.meetingInfo.platform}`);
	}

	// Replace placeholder with full event handler that has access to the bot instance
	bot.onEvent = createEventHandler(bot);

	return bot;
}
