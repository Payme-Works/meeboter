import type { Bot } from "./bot";
import { createBot } from "./bot-factory";
import { env } from "./config/env";
import { createServices } from "./services";
import {
	createTrpcClient,
	EventCode,
	STATUS_EVENT_CODES,
	Status,
	type TrpcClient,
} from "./trpc";

/**
 * Reports an event and updates status if it's a status-changing event
 */
async function reportEventWithStatus(
	trpc: TrpcClient,
	botId: number,
	eventType: EventCode,
	data?: { message?: string; description?: string; sub_code?: string },
): Promise<void> {
	// Report the event to the events log
	await trpc.bots.events.report.mutate({
		id: String(botId),
		event: {
			eventType,
			eventTime: new Date(),
			data: data
				? {
						description: data.message || data.description,
						sub_code: data.sub_code,
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
}

/**
 * Main entry point for the bot application.
 * Creates services with dependency injection and orchestrates the bot lifecycle.
 */
export const main = async () => {
	let hasErrorOccurred = false;
	const poolSlotUuid = env.POOL_SLOT_UUID;

	console.log(`Fetching bot config for pool slot: ${poolSlotUuid}`);

	// Create a temporary tRPC client to fetch initial config
	const bootstrapTrpc = createTrpcClient({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	// Fetch bot configuration
	const botConfig = await bootstrapTrpc.bots.pool.getSlot.query({
		poolSlotUuid,
	});

	console.log("Received bot config:", botConfig);

	const botId = botConfig.id;

	// Track bot instance (set after creation)
	let bot: Bot | null = null;

	// Create all services with dependency injection
	const services = createServices({
		botId,
		getBot: () => bot,
	});

	const { logger, trpc, storage, workers } = services;

	// Track recording key for final status report
	let recordingKey = "";

	// Create status change handler for screenshot capture on status transitions
	const onStatusChange = async (eventType: EventCode, botInstance: Bot) => {
		logger.debug(`Status change detected: ${eventType}, capturing screenshot`);
		await botInstance.screenshot(`state-change-${eventType}.png`, eventType);
	};

	try {
		// Create the platform-specific bot instance
		bot = await createBot(botConfig, {
			onStatusChange,
			trpcClient: trpc,
		});

		// Start monitoring workers (only in production)
		if (env.NODE_ENV !== "development") {
			logger.info("Starting heartbeat and duration monitor");

			// Start heartbeat worker
			workers.heartbeat.start(botId, {
				onLeaveRequested: () => bot?.requestLeave(),
				onLogLevelChange: (logLevel) =>
					bot?.logger.setLogLevelFromString(logLevel),
			});

			// Start duration monitor
			workers.durationMonitor.start(botConfig.startTime, async () => {
				logger.error("Bot exceeded maximum duration, terminating...");

				await reportEventWithStatus(trpc, botId, EventCode.FATAL, {
					message: "Maximum duration exceeded",
				});

				bot?.requestLeave();
			});
		}

		// Start message queue worker if chat is enabled
		if (botConfig.chatEnabled) {
			workers.messageQueue.start(botId);
		}

		// Run the bot
		await bot.run().catch(async (error) => {
			hasErrorOccurred = true;

			logger.error(
				"Error running bot",
				error instanceof Error ? error : new Error(String(error)),
			);

			await reportEventWithStatus(trpc, botId, EventCode.FATAL, {
				description: (error as Error).message,
			});

			// Capture error screenshot
			await bot?.screenshot("error.png", (error as Error).message);

			// Ensure cleanup
			try {
				await bot?.cleanup();
			} catch (cleanupError) {
				logger.warn(
					`Error during bot cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
				);
			}
		});

		// Upload recording if enabled and no error
		if (!hasErrorOccurred && bot.settings.recordingEnabled) {
			logger.info("Starting upload to storage...");
			const platform = bot.settings.meetingInfo.platform ?? "unknown";

			recordingKey = await storage.uploadRecording(
				bot.getRecordingPath(),
				platform,
				bot.getContentType(),
			);
		}
	} catch (error) {
		hasErrorOccurred = true;

		logger.error(
			"Error during bot lifecycle",
			error instanceof Error ? error : new Error(String(error)),
		);

		// Capture fatal screenshot
		await bot?.screenshot("fatal.png", (error as Error).message);

		await reportEventWithStatus(trpc, botId, EventCode.FATAL, {
			description: (error as Error).message,
		});
	} finally {
		// Stop all workers
		workers.heartbeat.stop();
		workers.durationMonitor.stop();
		workers.messageQueue.stop();

		logger.info("Bot execution completed, monitoring stopped");
	}

	// Report final status if no error
	if (!hasErrorOccurred && bot) {
		let speakerTimeframes: {
			start: number;
			end: number;
			speakerName: string;
		}[] = [];

		try {
			speakerTimeframes = bot.settings.recordingEnabled
				? (bot.getSpeakerTimeframes() ?? [])
				: [];
		} catch (error) {
			logger.warn(
				`Failed to get speaker timeframes: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		logger.debug("Speaker timeframes", { count: speakerTimeframes.length });

		await trpc.bots.updateStatus.mutate({
			id: String(botId),
			status: Status.DONE,
			recording: recordingKey || undefined,
			speakerTimeframes:
				speakerTimeframes.length > 0 ? speakerTimeframes : undefined,
		});
	}

	// Flush any remaining logs before exit
	await logger.shutdown();

	process.exit(hasErrorOccurred ? 1 : 0);
};

// Only run automatically if not in a test
if (require.main === module) {
	main();
}
