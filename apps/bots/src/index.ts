import type { Bot } from "./bot";
import { createBot } from "./bot-factory";
import { env } from "./config/env";
import type { BotLogger } from "./logger";
import { createServices } from "./services";
import {
	createTrpcClient,
	EventCode,
	STATUS_EVENT_CODES,
	Status,
	type TrpcClient,
} from "./trpc";

// Declare global logger type
declare global {
	var logger: BotLogger | undefined;
}

/**
 * Global error handler for uncaught exceptions.
 * Ensures logs are flushed before process exit.
 */
process.on("uncaughtException", async (error) => {
	console.error("[FATAL] Uncaught exception:", error);

	if (global.logger) {
		global.logger.error("Uncaught exception", error);
		await global.logger.shutdown();
	}

	process.exit(1);
});

/**
 * Global error handler for unhandled promise rejections.
 * Ensures logs are flushed before process exit.
 */
process.on("unhandledRejection", async (reason) => {
	const error = reason instanceof Error ? reason : new Error(String(reason));

	console.error("[FATAL] Unhandled rejection:", error);

	if (global.logger) {
		global.logger.error("Unhandled rejection", error);
		await global.logger.shutdown();
	}

	process.exit(1);
});

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

	// Early initialization logging (before logger is available)
	console.log("[INIT] Bot container starting...");

	console.log("[INIT] Environment:", {
		NODE_ENV: env.NODE_ENV,
		POOL_SLOT_UUID: poolSlotUuid,
		MILO_URL: env.MILO_URL,
		DOCKER_MEETING_PLATFORM: env.DOCKER_MEETING_PLATFORM || "(not set)",
	});

	console.log(`[INIT] Fetching bot config for pool slot: ${poolSlotUuid}`);

	// Create a temporary tRPC client to fetch initial config
	const bootstrapTrpc = createTrpcClient({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	console.log("[INIT] tRPC client created, calling bots.pool.getSlot...");

	// Fetch bot configuration
	const botConfig = await bootstrapTrpc.bots.pool.getSlot.query({
		poolSlotUuid,
	});

	console.log("[INIT] Bot config received:", {
		id: botConfig.id,
		platform: botConfig.meetingInfo.platform,
		meetingUrl: `${botConfig.meetingInfo.meetingUrl?.slice(0, 50)}...`,
		botDisplayName: botConfig.botDisplayName,
		recordingEnabled: botConfig.recordingEnabled,
		chatEnabled: botConfig.chatEnabled,
	});

	const botId = botConfig.id;
	console.log(`[INIT] Bot ID: ${botId}`);

	// Track bot instance (set after creation)
	let bot: Bot | null = null;

	console.log("[INIT] Creating services...");

	// Create all services with dependency injection
	const services = createServices({
		botId,
		getBot: () => bot,
	});

	const { emitter, logger, trpc, uploadRecording, workers } = services;

	// Set global logger reference for uncaught exception handling
	global.logger = logger;

	logger.info("Services initialized successfully");

	logger.debug("Service components ready", {
		hasLogger: !!logger,
		hasTrpc: !!trpc,
		hasUploadRecording: !!uploadRecording,
		hasWorkers: !!workers,
	});

	// Track recording key for final status report
	let recordingKey = "";

	try {
		logger.info("Creating platform-specific bot instance...", {
			platform: botConfig.meetingInfo.platform,
		});

		// Create the platform-specific bot instance using shared services
		bot = await createBot(botConfig, {
			emitter,
			logger,
			trpcClient: trpc,
		});

		// Register status change listener for screenshot capture
		emitter.on("event", (eventType: EventCode) => {
			logger.debug(`Status change detected: ${eventType}, capturing screenshot`);
			bot?.screenshot(`state-change-${eventType}.png`, eventType);
		});

		logger.info("Bot instance created successfully", {
			botType: bot.constructor.name,
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
		if (!hasErrorOccurred && bot.settings.recordingEnabled && uploadRecording) {
			logger.info("Starting upload to storage...");
			const platform = bot.settings.meetingInfo.platform ?? "unknown";
			const recordingPath = bot.getRecordingPath();
			const contentType = bot.getContentType();

			const { promises: fs } = await import("node:fs");
			const data = await fs.readFile(recordingPath);

			recordingKey = await uploadRecording.execute({
				botId,
				data,
				platform,
				contentType,
			});

			await fs.unlink(recordingPath);
			logger.info("Recording uploaded successfully", { key: recordingKey });
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
