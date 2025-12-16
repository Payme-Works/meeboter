import { getMultipleBrazilianNames } from "./constants/bot-display-names";

const API_KEYS = {
	production:
		"00e137cd5b97f23ca34f170b780f4c9d368c784b0ec40c06d92160a9c293aaa2",
	development:
		"aa22bac1fe2db9d2b374a9291e4bf8b3813124086c173c799a768dbfc6082c85",
};

const API_BASE_URLS = {
	production: "https://meeboter.andredezzy.com/api",
	development: "https://development.meeboter.andredezzy.com/api",
};

const ENV: "production" | "development" = "production";

const API_BASE_URL = API_BASE_URLS[ENV];
const API_KEY = API_KEYS[ENV];

const GOOGLE_MEET_URL = "https://meet.google.com/qma-heii-nyx";

// Configuration for multiple bots
const BOT_CONFIG = {
	numberOfBots: 100, // Configure how many bots to deploy
	meetingDurationHours: 1, // Meeting duration in hours
	staggerDelay: 5000, // Delay between bot deployments in milliseconds (5 seconds)
} as const;

interface CreateBotRequest {
	botDisplayName: string;
	botImage?: string;
	meetingTitle: string;
	meetingInfo: {
		meetingId: string;
		meetingPassword?: string;
		meetingUrl: string;
		organizerId?: string;
		tenantId?: string;
		messageId?: string;
		threadId?: string;
		platform: "google" | "zoom";
	};
	startTime: string;
	endTime: string;
	heartbeatInterval: number;
	automaticLeave: {
		waitingRoomTimeout: number;
		noOneJoinedTimeout: number;
		everyoneLeftTimeout: number;
		inactivityTimeout: number;
	};
	callbackUrl?: string;
}

interface Bot {
	id: number;
	botDisplayName: string;
	status: string;
	meetingInfo: {
		meetingUrl: string;
		platform: string;
	};
	createdAt: string;
}

function extractMeetingIdFromUrl(url: string): string {
	// Extract meeting ID from Google Meet URL
	// Format: https://meet.google.com/xxx-xxxx-xxx
	const match = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);

	return match ? match[1] : "unknown-meeting-id";
}

async function createBot(
	botDisplayName: string,
	botIndex?: number,
): Promise<Bot> {
	const botLabel = botIndex !== undefined ? `Bot ${botIndex + 1}` : "Bot";
	console.log(`🤖 Creating ${botLabel} (${botDisplayName})...`);

	const now = new Date();

	const endTime = new Date(
		now.getTime() + BOT_CONFIG.meetingDurationHours * 60 * 60 * 1000,
	);

	const meetingId = extractMeetingIdFromUrl(GOOGLE_MEET_URL);

	const botRequest: CreateBotRequest = {
		botDisplayName,
		meetingTitle: "Google Meet Session",
		meetingInfo: {
			meetingId: meetingId,
			meetingUrl: GOOGLE_MEET_URL,
			platform: "google",
		},
		startTime: now.toISOString(),
		endTime: endTime.toISOString(),
		heartbeatInterval: 10000,
		automaticLeave: {
			waitingRoomTimeout: 3600000,
			noOneJoinedTimeout: 3600000,
			everyoneLeftTimeout: 3600000,
			inactivityTimeout: 3600000,
		},
	};

	const response = await fetch(`${API_BASE_URL}/bots`, {
		method: "POST",
		headers: {
			"x-api-key": API_KEY,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(botRequest),
	});

	if (!response.ok) {
		const error = await response.text();

		throw new Error(`API Error ${response.status}: ${error}`);
	}

	const bot: Bot = await response.json();
	console.log(`✅ ${botLabel} created with ID: ${bot.id}`);

	return bot;
}

async function checkBotStatus(botId: number): Promise<Bot> {
	const response = await fetch(`${API_BASE_URL}/bots/${botId}`, {
		headers: {
			"x-api-key": API_KEY,
		},
	});

	if (!response.ok) {
		const error = await response.text();

		throw new Error(`API Error ${response.status}: ${error}`);
	}

	return response.json();
}

async function monitorBot(
	botId: number,
	botName: string,
	botIndex?: number,
): Promise<void> {
	const botLabel = botIndex !== undefined ? `Bot ${botIndex + 1}` : "Bot";
	console.log(`👀 Monitoring ${botLabel} (${botName}) status...`);

	const maxAttempts = 10;
	const pollInterval = 5000; // 5 seconds

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const bot = await checkBotStatus(botId);
			console.log(`📊 ${botLabel} Status (${attempt}/10): ${bot.status}`);

			if (bot.status === "IN_CALL") {
				console.log(`🎉 ${botLabel} successfully joined the meeting!`);

				break;
			} else if (bot.status === "FATAL") {
				console.error(`💥 ${botLabel} deployment failed`);

				break;
			} else if (bot.status === "DONE") {
				console.log(`✅ ${botLabel} session completed`);

				break;
			}

			if (attempt < maxAttempts) {
				console.log(`⏳ ${botLabel} waiting ${pollInterval / 1000}s...`);
				await new Promise((resolve) => setTimeout(resolve, pollInterval));
			}
		} catch (error) {
			console.error(`❌ Error checking ${botLabel} status: ${error}`);

			if (attempt === maxAttempts) {
				throw error;
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
	}
}

async function testApiConnection(): Promise<void> {
	console.log("🔍 Testing API connection...");

	try {
		// Test with a simple GET request first
		const response = await fetch(`${API_BASE_URL}/bots`, {
			method: "GET",
			headers: {
				"x-api-key": API_KEY,
			},
		});

		console.log(`📡 API Response Status: ${response.status}`);

		const headers: Record<string, string> = {};

		response.headers.forEach((value, key) => {
			headers[key] = value;
		});

		console.log(`📡 API Response Headers:`, headers);

		if (!response.ok) {
			const errorText = await response.text();
			console.log(`📡 API Error Response:`, errorText);

			throw new Error(`API Test Failed ${response.status}: ${errorText}`);
		}

		const data = await response.json();
		console.log(`✅ API Connection successful! Response:`, data);
	} catch (error) {
		console.error("❌ API Connection test failed:", error);

		throw error;
	}
}

async function deployBot(botName: string, botIndex: number): Promise<Bot> {
	try {
		// Add stagger delay for multiple bots (except the first one)
		if (botIndex > 0) {
			console.log(
				`⏳ Waiting ${BOT_CONFIG.staggerDelay / 1000}s before deploying Bot ${botIndex + 1}...`,
			);

			await new Promise((resolve) =>
				setTimeout(resolve, BOT_CONFIG.staggerDelay),
			);
		}

		// Create the bot
		const bot = await createBot(botName, botIndex);

		// Monitor the bot deployment
		await monitorBot(bot.id, botName, botIndex);

		return bot;
	} catch (error) {
		console.error(
			`❌ Failed to deploy Bot ${botIndex + 1} (${botName}):`,
			error,
		);

		throw error;
	}
}

async function deployMultipleBots(): Promise<Bot[]> {
	console.log(`🚀 Deploying ${BOT_CONFIG.numberOfBots} bots...`);
	console.log("");

	// Get unique Brazilian names for all bots
	const botNames = getMultipleBrazilianNames(BOT_CONFIG.numberOfBots);
	const deployedBots: Bot[] = [];
	const deploymentPromises: Promise<void>[] = [];

	// Deploy bots with staggered timing
	for (let i = 0; i < BOT_CONFIG.numberOfBots; i++) {
		const botName = botNames[i];

		const deploymentPromise = deployBot(botName, i)
			.then((bot) => {
				deployedBots.push(bot);
			})
			.catch((error) => {
				console.error(`❌ Bot ${i + 1} deployment failed:`, error);
				// Continue with other bots even if one fails
			});

		deploymentPromises.push(deploymentPromise);
	}

	// Wait for all bot deployments to complete
	await Promise.allSettled(deploymentPromises);

	console.log("");

	console.log(
		`📊 Deployment Summary: ${deployedBots.length}/${BOT_CONFIG.numberOfBots} bots deployed successfully`,
	);

	return deployedBots;
}

async function _main(): Promise<void> {
	console.log("🚀 Live Boost - Google Meet Multiple Bot Deployment");
	console.log("==================================================");
	console.log(`🎯 Target meeting: ${GOOGLE_MEET_URL}`);
	console.log(`🤖 Number of bots to deploy: ${BOT_CONFIG.numberOfBots}`);

	console.log(
		`⏱️  Meeting duration: ${BOT_CONFIG.meetingDurationHours} hour(s)`,
	);

	console.log(
		`🕐 Stagger delay: ${BOT_CONFIG.staggerDelay / 1000}s between deployments`,
	);

	console.log("");

	try {
		// Step 0: Test API connection first
		await testApiConnection();
		console.log("");

		// Step 1: Deploy multiple bots
		const deployedBots = await deployMultipleBots();

		console.log("");
		console.log("🎉 Bot deployment process completed!");
		console.log("==================================================");

		if (deployedBots.length > 0) {
			console.log(`📊 Successfully deployed ${deployedBots.length} bot(s):`);
			console.log("");

			deployedBots.forEach((bot, index) => {
				console.log(`Bot ${index + 1}:`);
				console.log(`  - ID: ${bot.id}`);
				console.log(`  - Name: ${bot.botDisplayName}`);
				console.log(`  - Status: ${bot.status}`);
				console.log(`  - Created: ${new Date(bot.createdAt).toLocaleString()}`);
				console.log("");
			});

			console.log(`Meeting: ${deployedBots[0].meetingInfo.meetingUrl}`);
			console.log(`Platform: ${deployedBots[0].meetingInfo.platform}`);
			console.log("");

			console.log(
				"💡 The bots should now be joining your Google Meet session!",
			);
		} else {
			console.log("⚠️  No bots were successfully deployed.");
		}
	} catch (error) {
		console.error("");
		console.error("❌ Bot deployment failed:");
		console.error("========================");

		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);

			if (
				error.message.includes("401") ||
				error.message.includes("Authorization")
			) {
				console.error("💡 Check your API key - it may be invalid or expired");
			} else if (error.message.includes("404")) {
				console.error("💡 Check the API endpoint URL");
			} else if (error.message.includes("timeout")) {
				console.error("💡 Check your internet connection");
			}
		}

		process.exit(1);
	}
}

async function main(): Promise<void> {
	console.log("Emulating main function");
}

// Run the application
main().catch((error) => {
	console.error("💥 Fatal error:", error);
	process.exit(1);
});
