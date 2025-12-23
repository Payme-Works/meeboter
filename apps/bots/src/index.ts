import type { Bot } from "./bot";
import { createBot } from "./bot-factory";
import { env } from "./config/env";
import { withAutoRestart } from "./helpers/with-auto-restart";
import type { BotLogger } from "./logger";
import { createServices } from "./services";
import {
	type BotConfig,
	createTrpcClient,
	EventCode,
	STATUS_EVENT_CODES,
	Status,
	type TrpcClient,
} from "./trpc";

/** Maximum number of restart attempts before marking as FATAL */
const MAX_RESTART_ATTEMPTS = 3;

/** Delay between restart attempts in milliseconds */
const RESTART_DELAY_MS = 5000;

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
 * Includes automatic restart on failure with configurable retry attempts.
 */
export const main = async () => {
	const botIdEnv = env.BOT_ID;
	const poolSlotUuid = env.POOL_SLOT_UUID;

	// Early initialization logging (before logger is available)
	console.log("[INIT] Bot container starting...");

	console.log("[INIT] Environment:", {
		NODE_ENV: env.NODE_ENV,
		BOT_ID: botIdEnv || "(not set)",
		POOL_SLOT_UUID: poolSlotUuid || "(not set)",
		MILO_URL: env.MILO_URL,
		DOCKER_MEETING_PLATFORM: env.DOCKER_MEETING_PLATFORM || "(not set)",
	});

	// Validate that at least one identifier is set
	if (!botIdEnv && !poolSlotUuid) {
		throw new Error("Either BOT_ID or POOL_SLOT_UUID must be set");
	}

	// Create a temporary tRPC client to fetch initial config
	const bootstrapTrpc = createTrpcClient({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	// Platform-aware config retrieval:
	// - BOT_ID: K8s/ECS ephemeral platforms → use bots.getConfig
	// - POOL_SLOT_UUID: Coolify pool-based → use bots.pool.getSlot
	let botConfig: BotConfig;

	if (botIdEnv) {
		console.log(`[INIT] Fetching bot config by ID: ${botIdEnv}`);
		console.log("[INIT] tRPC client created, calling bots.getConfig...");

		botConfig = await bootstrapTrpc.bots.getConfig.query({
			botId: Number(botIdEnv),
		});
	} else {
		console.log(`[INIT] Fetching bot config for pool slot: ${poolSlotUuid}`);

		console.log(
			"[INIT] tRPC client created, calling infrastructure.coolify.pool.getSlot...",
		);

		botConfig = await bootstrapTrpc.infrastructure.coolify.pool.getSlot.query({
			poolSlotUuid: poolSlotUuid!,
		});
	}

	console.log("[INIT] Bot config received:", {
		id: botConfig.id,
		platform: botConfig.meeting.platform,
		meetingUrl: `${botConfig.meeting.meetingUrl?.slice(0, 50)}...`,
		displayName: botConfig.displayName,
		recordingEnabled: botConfig.recordingEnabled,
	});

	const botId = botConfig.id;
	console.log(`[INIT] Bot ID: ${botId}`);

	// Track recording key for final status report (persists across retries)
	let recordingKey = "";

	// Track bot instances across retries
	let currentBot: Bot | null = null;
	let successfulBot: Bot | null = null;

	console.log("[INIT] Creating services...");

	const services = createServices({
		botId,
		getBot: () => currentBot,
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

	// Helper to report events
	const reportEvent = async (
		eventType: EventCode,
		data?: { message?: string; description?: string; sub_code?: string },
	) => {
		await reportEventWithStatus(trpc, botId, eventType, data);
	};

	// Run bot with automatic restart on failure
	const result = await withAutoRestart(
		async () => {
			logger.info("Creating platform-specific bot instance...", {
				platform: botConfig.meeting.platform,
			});

			// Create fresh bot instance for this attempt
			const bot = await createBot(botConfig, {
				emitter,
				logger,
				trpc,
			});

			currentBot = bot;

			// Register status change listener for screenshot capture
			const screenshotHandler = (eventType: EventCode) => {
				logger.debug(
					`Status change detected: ${eventType}, capturing screenshot`,
				);

				bot.screenshot(
					`state-change-${eventType}.png`,
					eventType,
					"state_change",
				);
			};

			emitter.on("event", screenshotHandler);

			logger.info("Bot instance created successfully", {
				botType: bot.constructor.name,
			});

			// Start monitoring workers (only in production)
			if (env.NODE_ENV !== "development") {
				logger.info("Starting heartbeat and duration monitor");

				workers.heartbeat.start(botId, {
					onLeaveRequested: () => bot.requestLeave(),
					onLogLevelChange: (logLevel) =>
						bot.logger.setLogLevelFromString(logLevel),
				});

				workers.durationMonitor.start(botConfig.startTime, async () => {
					logger.error("Bot exceeded maximum duration, terminating...");

					await reportEvent(EventCode.FATAL, {
						message: "Maximum duration exceeded",
					});

					bot.requestLeave();
				});
			}

			// Start message queue worker (chat is always enabled)
			workers.messageQueue.start(botId);

			return {
				bot,
				run: async () => {
					// Run the bot
					await bot.run();

					// Mark as successful (for final status reporting)
					successfulBot = bot;

					// Upload recording if enabled and successful
					if (bot.settings.recordingEnabled && uploadRecording) {
						logger.info("Starting upload to storage...");
						const platform = bot.settings.meeting.platform ?? "unknown";
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

						logger.info("Recording uploaded successfully", {
							key: recordingKey,
						});
					}
				},
				cleanup: async () => {
					// Stop workers
					workers.heartbeat.stop();
					workers.durationMonitor.stop();
					workers.messageQueue.stop();

					// Remove event listener
					emitter.removeAllListeners("event");

					// Cleanup bot resources
					try {
						await bot.cleanup();
					} catch (cleanupError) {
						logger.warn(
							`Error during bot cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
						);
					}

					currentBot = null;
					logger.info("Bot cleanup completed");
				},
			};
		},
		{
			maxRestarts: MAX_RESTART_ATTEMPTS,
			delayBetweenRestarts: RESTART_DELAY_MS,
		},
		{
			onRestart: async (attempt, error) => {
				logger.warn(
					`Bot failed, restarting (attempt ${attempt}/${MAX_RESTART_ATTEMPTS})`,
					{
						error: error.message,
					},
				);

				// Capture restart screenshot
				await currentBot?.screenshot("restart.png", error.message);

				// Report restart event to Milo (not a status change)
				await trpc.bots.events.report.mutate({
					id: String(botId),
					event: {
						eventType: EventCode.RESTARTING,
						eventTime: new Date(),
						data: {
							description: `Restart attempt ${attempt}/${MAX_RESTART_ATTEMPTS}: ${error.message}`,
							sub_code: `RESTART_${attempt}`,
						},
					},
				});
			},
			onFatalError: async (error, totalAttempts) => {
				logger.error(
					`All ${totalAttempts} attempts failed, marking as FATAL`,
					error,
				);

				// Capture fatal screenshot
				await currentBot?.screenshot("fatal.png", error.message);

				// Report FATAL status
				await reportEvent(EventCode.FATAL, {
					description: `Failed after ${totalAttempts} attempts: ${error.message}`,
				});
			},
		},
	);

	// Report final status if successful
	if (result.success && successfulBot) {
		// Type assertion needed because TypeScript can't track that successfulBot
		// is set inside the async callback before we reach this point
		const bot = successfulBot as Bot;

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

	process.exit(result.success ? 0 : 1);
};

// Only run automatically if not in a test
if (require.main === module) {
	main();
}
