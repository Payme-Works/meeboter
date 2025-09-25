import dotenv from "dotenv";
import { type BotInterface, createBot } from "./bot";
import {
	safeReportEvent,
	startDurationMonitor,
	startHeartbeat,
} from "./monitoring";
import { createS3Client, uploadRecordingToS3 } from "./s3";
import { trpc } from "./trpc";
import { type BotConfig, EventCode, type SpeakerTimeframe } from "./types";

dotenv.config({ path: "../.env.test" }); // Load .env.test for testing
dotenv.config();

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

export const main = async () => {
	let hasErrorOccurred = false;

	const requiredEnvVars = [
		"BOT_DATA",
		"AWS_BUCKET_NAME",
		"AWS_REGION",
		"NODE_ENV",
	] as const;

	// Check all required environment variables are present
	for (const envVar of requiredEnvVars) {
		if (!process.env[envVar]) {
			throw new Error(`Missing required environment variable: ${envVar}`);
		}
	}

	// Parse bot data
	if (!process.env.BOT_DATA)
		throw new Error("BOT_DATA environment variable is required");

	const botData: BotConfig = JSON.parse(process.env.BOT_DATA);

	console.log("Received bot data:", botData);

	const botId = botData.id;

	// Declare key variable at the top level of the function
	let key: string = "";

	// Initialize S3 client
	const s3Client = createS3Client(
		process.env.AWS_REGION ?? "us-east-2",
		process.env.AWS_ACCESS_KEY_ID,
		process.env.AWS_SECRET_ACCESS_KEY,
	);

	if (!s3Client) {
		throw new Error("Failed to create S3 client");
	}

	// Create the appropriate bot instance based on platform
	const bot = await createBot(botData);

	// Create AbortController for heartbeat and duration monitor
	const monitoringController = new AbortController();

	// Record bot start time for duration monitoring
	const botStartTime = new Date();

	// Do not start heartbeat in development
	if (process.env.NODE_ENV !== "development") {
		console.log("Starting heartbeat and duration monitor");

		const heartbeatInterval = botData.heartbeatInterval ?? 10000; // Default to 10 seconds if not set

		// Start both heartbeat and duration monitoring
		startHeartbeat(botId, monitoringController.signal, heartbeatInterval);
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
			console.error("Error running bot:", error);

			// Use safe reporting to prevent cascading failures
			await safeReportEvent(botId, EventCode.FATAL, {
				description: (error as Error).message,
			});

			// Check what's on the screen in case of an error
			try {
				await bot.screenshot();
			} catch (screenshotError) {
				console.warn("Failed to take screenshot:", screenshotError);
			}

			// **Ensure** the bot cleans up its resources after a breaking error
			try {
				await bot.endLife();
			} catch (cleanupError) {
				console.warn("Error during bot cleanup:", cleanupError);
			}
		});

		// Upload recording to S3 only if recording was enabled
		if (bot.settings.recordingEnabled) {
			console.log("Start upload to S3...");

			key = await uploadRecordingToS3(s3Client, bot);
		} else {
			console.log("Recording was disabled, skipping S3 upload");

			key = ""; // No recording to upload
		}
	} catch (error) {
		hasErrorOccurred = true;

		console.error("Error running bot:", error);

		// Use safe reporting to prevent secondary crashes
		await safeReportEvent(botId, EventCode.FATAL, {
			description: (error as Error).message,
		});
	}

	// After S3 upload and cleanup, stop the monitoring
	monitoringController.abort();

	console.log("Bot execution completed, monitoring stopped.");

	// Only report DONE if no error occurred
	if (!hasErrorOccurred) {
		// Report final DONE event
		let speakerTimeframes: SpeakerTimeframe[] = [];

		try {
			speakerTimeframes = bot.settings.recordingEnabled
				? bot.getSpeakerTimeframes()
				: [];
		} catch (error) {
			console.warn("Failed to get speaker timeframes:", error);
		}

		console.debug("Speaker timeframes:", speakerTimeframes);

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
