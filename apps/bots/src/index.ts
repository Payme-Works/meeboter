import dotenv from "dotenv";

// Load environment variables before importing modules that use them
dotenv.config({ path: "../.env.test" }); // Load .env.test for testing
dotenv.config();

import { env } from "./config/env";
import { createServices, EventCode, Status } from "./services";

/**
 * Main entry point for the bot application.
 * Creates services with dependency injection and orchestrates the bot lifecycle.
 */
export const main = async () => {
	let hasErrorOccurred = false;
	const poolSlotUuid = env.POOL_SLOT_UUID;

	console.log(`Fetching bot config for pool slot: ${poolSlotUuid}`);

	// Create a temporary tRPC service to fetch initial config
	const { TrpcService } = await import("./services/trpc-service");

	const bootstrapTrpc = new TrpcService({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	// Fetch bot configuration
	const botConfig = await bootstrapTrpc.getPoolSlot(poolSlotUuid);
	console.log("Received bot data:", botConfig);

	const botId = botConfig.id;

	// Create all services with dependency injection
	const services = createServices({ botId });
	const { logger, trpc, bot: botService, workers } = services;

	// Track recording key for final status report
	let recordingKey = "";

	// Create status change handler for screenshot capture on status transitions
	const onStatusChange = async (eventType: EventCode) => {
		logger.debug(`Status change detected: ${eventType}, capturing screenshot`);
		await botService.captureAndUploadScreenshot("state_change", eventType);
	};

	try {
		// Create the platform-specific bot instance
		const bot = await botService.createBot(botConfig, { onStatusChange });

		// Start monitoring workers (only in production)
		if (env.NODE_ENV !== "development") {
			logger.info("Starting heartbeat and duration monitor");

			// Start heartbeat worker
			workers.heartbeat.start(botId, {
				onLeaveRequested: () => botService.requestLeave(),
				onLogLevelChange: (logLevel) =>
					bot.logger.setLogLevelFromString(logLevel),
			});

			// Start duration monitor
			workers.durationMonitor.start(botConfig.startTime, async () => {
				logger.error("Bot exceeded maximum duration, terminating...");

				await trpc.reportEvent(botId, EventCode.FATAL, {
					message: "Maximum duration exceeded",
				});

				botService.requestLeave();
			});
		}

		// Report initial status
		await trpc.reportEvent(botId, EventCode.READY_TO_DEPLOY);

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

			await trpc.reportEvent(botId, EventCode.FATAL, {
				description: (error as Error).message,
			});

			// Capture error screenshot
			await botService.captureAndUploadScreenshot(
				"error",
				(error as Error).message,
			);

			// Ensure cleanup
			try {
				await bot.endLife();
			} catch (cleanupError) {
				logger.warn(
					`Error during bot cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
				);
			}
		});

		// Upload recording if enabled and no error
		if (!hasErrorOccurred && bot.settings.recordingEnabled) {
			recordingKey = await botService.uploadRecording();
		}
	} catch (error) {
		hasErrorOccurred = true;

		logger.error(
			"Error during bot lifecycle",
			error instanceof Error ? error : new Error(String(error)),
		);

		// Capture fatal screenshot
		await botService.captureAndUploadScreenshot(
			"fatal",
			(error as Error).message,
		);

		await trpc.reportEvent(botId, EventCode.FATAL, {
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
	if (!hasErrorOccurred) {
		const bot = botService.getBot();

		let speakerTimeframes: {
			start: number;
			end: number;
			speakerName: string;
		}[] = [];

		try {
			speakerTimeframes = bot?.settings.recordingEnabled
				? (bot.getSpeakerTimeframes() ?? [])
				: [];
		} catch (error) {
			logger.warn(
				`Failed to get speaker timeframes: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		logger.debug("Speaker timeframes", { count: speakerTimeframes.length });

		await trpc.updateBotStatus(
			botId,
			Status.DONE,
			recordingKey || undefined,
			speakerTimeframes.length > 0 ? speakerTimeframes : undefined,
		);
	}

	process.exit(hasErrorOccurred ? 1 : 0);
};

// Only run automatically if not in a test
if (require.main === module) {
	main();
}
