import dotenv from "dotenv";

// Load environment variables before importing modules that use them
dotenv.config({ path: "../.env.test" }); // Load .env.test for testing
dotenv.config();

import { type BotInterface, createBot } from "./bot";
import { env } from "./env";
import type { ScreenshotData } from "./logger";
import { uploadScreenshotToS3 } from "./logger/screenshot";
import {
	safeReportEvent,
	startDurationMonitor,
	startHeartbeat,
} from "./monitoring";
import { createS3ClientFromEnv, uploadRecordingToS3 } from "./s3";
import { trpc } from "./trpc";
import { EventCode, type SpeakerTimeframe } from "./types";

/**
 * Starts message processing for a bot with chat functionality enabled.
 * Polls the backend API for queued messages and sends them via the bot.
 */
async function startMessageProcessing(
	bot: BotInterface,
	botId: number,
): Promise<void> {
	if (!bot.settings.chatEnabled) {
		console.log("Chat functionality is disabled for this bot");

		return;
	}

	console.log("Starting message processing for bot", botId);

	// Check for messages every 5 seconds
	const messageInterval = setInterval(async () => {
		try {
			// Call the backend API to get next queued message using tRPC
			const queuedMessage = await trpc.chat.getNextQueuedMessage.query({
				botId: botId.toString(),
			});

			if (queuedMessage?.messageText) {
				console.log(`Sending queued message: ${queuedMessage.messageText}`);

				// Add random delay between 1-6 seconds before sending message
				const delay = Math.random() * 5000 + 1000; // 1000ms to 6000ms
				console.log(`Waiting ${Math.round(delay)}ms before sending message...`);
				await new Promise((resolve) => setTimeout(resolve, delay));

				const success = await bot.sendChatMessage(queuedMessage.messageText);

				if (success) {
					console.log("Message sent successfully");
				} else {
					console.log("Failed to send message");
				}
			}
		} catch (error) {
			console.log("Error processing messages:", error);
		}
	}, 5000);

	// Clean up interval when bot process ends
	process.on("SIGTERM", () => {
		clearInterval(messageInterval);
	});

	process.on("SIGINT", () => {
		clearInterval(messageInterval);
	});
}

/**
 * Helper function to upload screenshot to S3 and save to backend
 */
async function uploadAndSaveScreenshot(
	bot: BotInterface,
	s3Client: ReturnType<typeof createS3ClientFromEnv>,
	localPath: string,
	type: ScreenshotData["type"],
	trigger?: string,
): Promise<void> {
	if (!s3Client) {
		return;
	}

	const screenshotData = await uploadScreenshotToS3(
		s3Client,
		localPath,
		bot.settings.id,
		type,
		bot.logger.getState(),
		trigger,
	);

	if (screenshotData) {
		// Save to backend
		try {
			await trpc.bots.appendScreenshot.mutate({
				id: String(bot.settings.id),
				screenshot: {
					...screenshotData,
					capturedAt: screenshotData.capturedAt.toISOString(),
				},
			});

			bot.logger.info(`Screenshot saved to backend: ${type}`);
		} catch (error) {
			bot.logger.warn(
				`Failed to save screenshot to backend: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

export const main = async () => {
	let hasErrorOccurred = false;

	// Environment variables are validated by env.ts on import
	// This will throw if required variables are missing or invalid
	const poolSlotUuid = env.POOL_SLOT_UUID;

	console.log(`Fetching bot config for pool slot: ${poolSlotUuid}`);

	// Use bootstrap trpc client to fetch config (uses MILO_URL env var)
	const botData = await trpc.bots.getPoolSlot.query({
		poolSlotUuid,
	});

	console.log("Received bot data:", botData);

	// tRPC client is already configured with MILO_URL env var on bootstrap
	// No reconfiguration needed - just use the same client for all calls

	const botId = botData.id;

	// Declare key variable at the top level of the function
	let key: string = "";

	// Initialize S3 client (supports both MinIO and AWS S3)
	const s3Client = createS3ClientFromEnv();

	if (!s3Client) {
		throw new Error(
			"Failed to create S3 client - check S3_* or AWS_* environment variables",
		);
	}

	// Create the appropriate bot instance based on platform
	// Note: We don't have logLevel in getPoolSlot response yet, so we create without it
	const bot = await createBot(botData);

	// Create AbortController for heartbeat and duration monitor
	const monitoringController = new AbortController();

	// Record bot start time for duration monitoring
	const botStartTime = new Date();

	// Do not start heartbeat in development
	if (env.NODE_ENV !== "development") {
		bot.logger.info("Starting heartbeat and duration monitor");

		const heartbeatInterval = botData.heartbeatInterval ?? 10000; // Default to 10 seconds if not set

		// Start both heartbeat and duration monitoring with callbacks
		startHeartbeat(botId, monitoringController.signal, heartbeatInterval, {
			onLeaveRequested: () => bot.requestLeave(),
			onLogLevelChange: (logLevel) =>
				bot.logger.setLogLevelFromString(logLevel),
		});

		startDurationMonitor(botId, botStartTime, monitoringController.signal);
	}

	// Report READY_TO_DEPLOY event (use safe reporting to prevent startup crashes)
	await safeReportEvent(botId, EventCode.READY_TO_DEPLOY);

	try {
		// Start message processing if chat is enabled
		if (botData.chatEnabled) {
			// Start message processing in the background
			startMessageProcessing(bot, botId);
		}

		// Run the bot
		await bot.run().catch(async (error) => {
			bot.logger.error(
				"Error running bot",
				error instanceof Error ? error : new Error(String(error)),
			);

			// Use safe reporting to prevent cascading failures
			await safeReportEvent(botId, EventCode.FATAL, {
				description: (error as Error).message,
			});

			// Capture screenshot on error using logger (auto-uploads)
			try {
				const screenshotPath = await bot.logger.captureScreenshot(
					"error",
					(error as Error).message,
				);

				if (screenshotPath) {
					await uploadAndSaveScreenshot(
						bot,
						s3Client,
						screenshotPath,
						"error",
						(error as Error).message,
					);
				}
			} catch (screenshotError) {
				bot.logger.warn(
					`Failed to capture/upload screenshot: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`,
				);
			}

			// **Ensure** the bot cleans up its resources after a breaking error
			try {
				await bot.endLife();
			} catch (cleanupError) {
				bot.logger.warn(
					`Error during bot cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
				);
			}
		});

		// Upload recording to S3 only if recording was enabled
		if (bot.settings.recordingEnabled) {
			bot.logger.info("Starting upload to S3...");

			key = await uploadRecordingToS3(s3Client, bot);
		} else {
			bot.logger.debug("Recording was disabled, skipping S3 upload");

			key = ""; // No recording to upload
		}
	} catch (error) {
		hasErrorOccurred = true;

		bot.logger.error(
			"Error running bot",
			error instanceof Error ? error : new Error(String(error)),
		);

		// Capture fatal screenshot
		try {
			const screenshotPath = await bot.logger.captureScreenshot(
				"fatal",
				(error as Error).message,
			);

			if (screenshotPath) {
				await uploadAndSaveScreenshot(
					bot,
					s3Client,
					screenshotPath,
					"fatal",
					(error as Error).message,
				);
			}
		} catch (screenshotError) {
			bot.logger.warn(
				`Failed to capture/upload fatal screenshot: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`,
			);
		}

		// Use safe reporting to prevent secondary crashes
		await safeReportEvent(botId, EventCode.FATAL, {
			description: (error as Error).message,
		});
	}

	// After S3 upload and cleanup, stop the monitoring
	monitoringController.abort();

	bot.logger.info("Bot execution completed, monitoring stopped");

	// Only report DONE if no error occurred
	if (!hasErrorOccurred) {
		// Report final DONE event
		let speakerTimeframes: SpeakerTimeframe[] = [];

		try {
			speakerTimeframes = bot.settings.recordingEnabled
				? bot.getSpeakerTimeframes()
				: [];
		} catch (error) {
			bot.logger.warn(
				`Failed to get speaker timeframes: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		bot.logger.debug("Speaker timeframes", { count: speakerTimeframes.length });

		// Use safe reporting for final event
		await safeReportEvent(botId, EventCode.DONE, {
			recording: key || undefined,
			speakerTimeframes,
		});
	}

	// Exit with appropriate code
	process.exit(hasErrorOccurred ? 1 : 0);
};

// Only run automatically if not in a test
if (require.main === module) {
	main();
}
