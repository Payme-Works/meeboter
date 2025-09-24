import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	ECSClient,
	type ECSClientConfig,
	RunTaskCommand,
	type RunTaskRequest,
} from "@aws-sdk/client-ecs";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/env";
import type * as schema from "@/server/database/schema";
import { type BotConfig, botsTable } from "@/server/database/schema";

/**
 * Get the directory path using import.meta.url for ES modules
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AWS ECS client configuration with optional credentials
 */
const config: ECSClientConfig = {
	region: env.AWS_REGION,
};

if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
	config.credentials = {
		accessKeyId: env.AWS_ACCESS_KEY_ID,
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
	};
}

/**
 * AWS ECS client instance for bot deployment operations
 */
const client = new ECSClient(config);

/**
 * Selects the appropriate bot task definition based on meeting platform information
 *
 * @param meetingInfo - Information about the meeting, including platform
 * @returns The ECS task definition ARN to use for deployment
 * @throws Error if the platform is unsupported
 */
export function selectBotTaskDefinition(
	meetingInfo: schema.MeetingInfo,
): string {
	const platform = meetingInfo.platform;

	switch (platform?.toLowerCase()) {
		case "google":
			return env.ECS_TASK_DEFINITION_MEET;
		case "teams":
			return env.ECS_TASK_DEFINITION_TEAMS;
		case "zoom":
			return env.ECS_TASK_DEFINITION_ZOOM;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}
}

/**
 * Custom error implementation for bot deployment failures
 */
export class BotDeploymentError extends Error {
	/**
	 * Creates a new BotDeploymentError instance
	 *
	 * @param message - The error message describing the deployment failure
	 */
	constructor(message: string) {
		super(message);
		this.name = "BotDeploymentError";
	}
}

/**
 * Deploys a bot either locally (development) or on AWS ECS (production)
 *
 * @param params - Deployment parameters
 * @param params.botId - The ID of the bot to deploy
 * @param params.db - The database instance for bot operations
 * @returns The updated bot record after successful deployment
 * @throws BotDeploymentError if deployment fails
 */
export async function deployBot({
	botId,
	db,
}: {
	botId: number;
	db: PostgresJsDatabase<typeof schema>;
}) {
	const botResult = await db
		.select()
		.from(botsTable)
		.where(eq(botsTable.id, botId));

	if (!botResult[0]) {
		throw new Error("Bot not found");
	}

	const bot = botResult[0];
	const dev = env.NODE_ENV === "development";

	// First, update bot status to deploying
	await db
		.update(botsTable)
		.set({ status: "DEPLOYING" })
		.where(eq(botsTable.id, botId));

	try {
		// Get the absolute path to the bots directory (parent directory)
		const botsDir = path.resolve(__dirname, "../../../../../bots");

		// Build bot configuration from database record
		const config: BotConfig = {
			id: botId,
			userId: bot.userId,
			meetingTitle: bot.meetingTitle,
			meetingInfo: bot.meetingInfo,
			startTime: bot.startTime,
			endTime: bot.endTime,
			botDisplayName: bot.botDisplayName,
			botImage: bot.botImage ?? undefined,
			recordingEnabled: bot.recordingEnabled,
			heartbeatInterval: bot.heartbeatInterval,
			chatEnabled: bot.chatEnabled,
			automaticLeave: bot.automaticLeave,
			callbackUrl: bot.callbackUrl ?? undefined,
		};

		if (dev) {
			// Spawn the bot process for local development
			const botProcess = spawn("pnpm", ["start"], {
				cwd: botsDir,
				env: {
					...process.env,
					BOT_DATA: JSON.stringify(config),
					BOT_AUTH_TOKEN: process.env.BOT_AUTH_TOKEN,
				},
			});

			// Log output for debugging
			botProcess.stdout.on("data", (data) => {
				console.log(`Bot ${botId} stdout: ${data}`);
			});

			botProcess.stderr.on("data", (data) => {
				console.error(`Bot ${botId} stderr: ${data}`);
			});

			botProcess.on("error", (error) => {
				console.error(`Bot ${botId} process error:`, error);
			});
		} else {
			// Deploy bot on AWS ECS for production
			const input: RunTaskRequest = {
				cluster: env.ECS_CLUSTER_NAME,
				taskDefinition: selectBotTaskDefinition(bot.meetingInfo),
				launchType: "FARGATE",
				networkConfiguration: {
					awsvpcConfiguration: {
						// Read subnets from environment variables
						subnets: env.ECS_SUBNETS,
						securityGroups: env.ECS_SECURITY_GROUPS,
						assignPublicIp: "ENABLED",
					},
				},
				overrides: {
					containerOverrides: [
						{
							name: "bot",
							environment: [
								{
									name: "BOT_DATA",
									value: JSON.stringify(config),
								},
								{
									name: "BOT_AUTH_TOKEN",
									value: env.BOT_AUTH_TOKEN,
								},
							],
						},
					],
				},
			};

			const command = new RunTaskCommand(input);

			await client.send(command);
		}

		// Update status to joining call after successful deployment
		const result = await db
			.update(botsTable)
			.set({
				status: "JOINING_CALL",
				deploymentError: null,
			})
			.where(eq(botsTable.id, botId))
			.returning();

		if (!result[0]) {
			throw new BotDeploymentError("Bot not found");
		}

		return result[0];
	} catch (error) {
		// Update status to fatal and store error message
		await db
			.update(botsTable)
			.set({
				status: "FATAL",
				deploymentError:
					error instanceof Error ? error.message : "Unknown error",
			})
			.where(eq(botsTable.id, botId));

		throw error;
	}
}

/**
 * Determines whether a bot should be deployed immediately based on its start time
 *
 * @param startTime - The scheduled start time for the bot meeting
 * @returns True if the bot should be deployed immediately, false if it should wait
 */
export async function shouldDeployImmediately(
	startTime: Date | undefined | null,
): Promise<boolean> {
	if (!startTime) {
		return true;
	}

	const now = new Date();
	const deploymentBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds

	return startTime.getTime() - now.getTime() <= deploymentBuffer;
}
