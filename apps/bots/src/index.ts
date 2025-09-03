import dotenv from "dotenv";
import { createBot } from "./bot";
import { safeReportEvent, startHeartbeat } from "./monitoring";
import { createS3Client, uploadRecordingToS3 } from "./s3";
import { type BotConfig, EventCode, type SpeakerTimeframe } from "./types";

dotenv.config({ path: "../.env.test" }); // Load .env.test for testing
dotenv.config();

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

	// Create AbortController for heartbeat
	const heartbeatController = new AbortController();

	// Do not start heartbeat in development
	if (process.env.NODE_ENV !== "development") {
		console.log("Starting heartbeat");

		const heartbeatInterval = botData.heartbeatInterval ?? 10000; // Default to 10 seconds if not set

		startHeartbeat(botId, heartbeatController.signal, heartbeatInterval);
	}

	// Report READY_TO_DEPLOY event (use safe reporting to prevent startup crashes)
	await safeReportEvent(botId, EventCode.READY_TO_DEPLOY);

	try {
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

	// After S3 upload and cleanup, stop the heartbeat
	heartbeatController.abort();

	console.log("Bot execution completed, heartbeat stopped.");

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
