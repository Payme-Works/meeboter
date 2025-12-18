import {
	DescribeTasksCommand,
	type ECSClient,
	RunTaskCommand,
	StopTaskCommand,
} from "@aws-sdk/client-ecs";

import type { BotConfig } from "@/server/database/schema";
import type {
	PlatformBotStatus,
	PlatformDeployWithQueueResult,
	PlatformService,
} from "./platform-service";

/**
 * Configuration for AWS ECS platform
 */
export interface AWSPlatformConfig {
	/** ECS cluster name or ARN */
	cluster: string;

	/** VPC subnet IDs for task networking */
	subnets: string[];

	/** Security group IDs for task networking */
	securityGroups: string[];

	/** Task definition ARN or family:revision for each platform */
	taskDefinitions: {
		zoom: string;
		teams: string;
		meet: string;
	};

	/** Whether to assign public IP to tasks */
	assignPublicIp?: boolean;
}

/**
 * Environment configuration passed to bot containers
 */
export interface AWSBotEnvConfig {
	botAuthToken: string;
	backendUrl: string;
	s3Endpoint: string;
	s3AccessKey: string;
	s3SecretKey: string;
	s3BucketName: string;
	s3Region: string;
}

/**
 * AWS ECS platform service implementation
 *
 * Uses AWS ECS Fargate to run bot containers on-demand.
 * Each bot deployment creates a new task that runs until completion.
 * No pool concept - tasks are ephemeral.
 */
export class AWSPlatformService implements PlatformService {
	readonly platformName = "aws" as const;

	constructor(
		private readonly ecsClient: ECSClient,
		private readonly config: AWSPlatformConfig,
		private readonly botEnvConfig: AWSBotEnvConfig,
	) {}

	async deployBot(
		botConfig: BotConfig,
	): Promise<PlatformDeployWithQueueResult> {
		const taskDefinition = this.getTaskDefinition(
			botConfig.meetingInfo.platform,
		);

		const containerName = this.getContainerName(botConfig.meetingInfo.platform);

		try {
			const result = await this.ecsClient.send(
				new RunTaskCommand({
					cluster: this.config.cluster,
					taskDefinition,
					launchType: "FARGATE",
					networkConfiguration: {
						awsvpcConfiguration: {
							subnets: this.config.subnets,
							securityGroups: this.config.securityGroups,
							assignPublicIp: this.config.assignPublicIp
								? "ENABLED"
								: "DISABLED",
						},
					},
					overrides: {
						containerOverrides: [
							{
								name: containerName,
								environment: this.buildEnvironmentVariables(botConfig),
							},
						],
					},
				}),
			);

			const task = result.tasks?.[0];

			if (!task?.taskArn) {
				return {
					success: false,
					error: "Failed to start ECS task: no task ARN returned",
				};
			}

			console.log(
				`[AWSPlatform] Bot ${botConfig.id} deployed as task ${task.taskArn}`,
			);

			return {
				success: true,
				identifier: task.taskArn,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			console.error(
				`[AWSPlatform] Failed to deploy bot ${botConfig.id}:`,
				error,
			);

			return {
				success: false,
				error: `ECS RunTask failed: ${errorMessage}`,
			};
		}
	}

	async stopBot(identifier: string): Promise<void> {
		try {
			await this.ecsClient.send(
				new StopTaskCommand({
					cluster: this.config.cluster,
					task: identifier,
					reason: "Bot stopped by platform service",
				}),
			);

			console.log(`[AWSPlatform] Stopped task ${identifier}`);
		} catch (error) {
			console.error(`[AWSPlatform] Failed to stop task ${identifier}:`, error);

			throw error;
		}
	}

	async getBotStatus(identifier: string): Promise<PlatformBotStatus> {
		try {
			const result = await this.ecsClient.send(
				new DescribeTasksCommand({
					cluster: this.config.cluster,
					tasks: [identifier],
				}),
			);

			const task = result.tasks?.[0];

			if (!task) {
				return "unknown";
			}

			return this.normalizeStatus(task.lastStatus);
		} catch {
			return "unknown";
		}
	}

	async releaseBot(_botId: number): Promise<void> {
		// AWS tasks are ephemeral, nothing to release
		// The task will be stopped when the bot completes its work
		console.log(
			`[AWSPlatform] Release called for bot ${_botId} (no-op for ECS)`,
		);
	}

	async processQueue(): Promise<void> {
		// AWS doesn't have a queue concept
		// Tasks are created on-demand without resource limits
		// (ECS handles scaling automatically)
	}

	/**
	 * Gets the task definition for a meeting platform
	 */
	private getTaskDefinition(platform: string | undefined): string {
		switch (platform?.toLowerCase()) {
			case "zoom":
				return this.config.taskDefinitions.zoom;
			case "teams":
				return this.config.taskDefinitions.teams;
			case "google":
				return this.config.taskDefinitions.meet;
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	/**
	 * Gets the container name for a meeting platform
	 */
	private getContainerName(platform: string | undefined): string {
		switch (platform?.toLowerCase()) {
			case "zoom":
				return "zoom-bot";
			case "teams":
				return "teams-bot";
			case "google":
				return "meet-bot";
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	/**
	 * Builds environment variables for the bot container
	 */
	private buildEnvironmentVariables(
		botConfig: BotConfig,
	): Array<{ name: string; value: string }> {
		return [
			// Bot identification
			{ name: "BOT_ID", value: String(botConfig.id) },
			{ name: "BOT_DATA", value: JSON.stringify(botConfig) },

			// Authentication
			{ name: "BOT_AUTH_TOKEN", value: this.botEnvConfig.botAuthToken },
			{ name: "BACKEND_URL", value: this.botEnvConfig.backendUrl },

			// S3-compatible storage configuration
			{ name: "S3_ENDPOINT", value: this.botEnvConfig.s3Endpoint },
			{ name: "S3_ACCESS_KEY", value: this.botEnvConfig.s3AccessKey },
			{ name: "S3_SECRET_KEY", value: this.botEnvConfig.s3SecretKey },
			{ name: "S3_BUCKET_NAME", value: this.botEnvConfig.s3BucketName },
			{ name: "S3_REGION", value: this.botEnvConfig.s3Region },

			// Runtime
			{ name: "NODE_ENV", value: "production" },
		];
	}

	/**
	 * Normalizes ECS task status to platform-agnostic status
	 */
	private normalizeStatus(ecsStatus: string | undefined): PlatformBotStatus {
		if (!ecsStatus) {
			return "unknown";
		}

		const status = ecsStatus.toUpperCase();

		if (status === "RUNNING") {
			return "running";
		}

		if (status === "STOPPED" || status === "DEPROVISIONING") {
			return "stopped";
		}

		if (
			status === "PENDING" ||
			status === "ACTIVATING" ||
			status === "PROVISIONING"
		) {
			return "deploying";
		}

		return "unknown";
	}
}
