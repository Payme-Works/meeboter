import {
	DescribeTasksCommand,
	type ECSClient,
	ListTasksCommand,
	RunTaskCommand,
	StopTaskCommand,
} from "@aws-sdk/client-ecs";

import type { BotConfig } from "@/server/database/schema";
import { AWSStatusMapper } from "../mappers/aws-status-mapper";
import {
	PlatformDeployError,
	type PlatformDeployResult,
	type PlatformService,
} from "../platform-service";

/**
 * AWS ECS task status values (UPPERCASE convention)
 */
export type AWSBotStatus = "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED";

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
		"microsoft-teams": string;
		"google-meet": string;
	};

	/** Whether to assign public IP to tasks */
	assignPublicIp?: boolean;
}

/**
 * Environment configuration passed to bot containers
 */
export interface AWSBotEnvConfig {
	miloUrl: string;
	miloAuthToken: string;
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
export class AWSPlatformService implements PlatformService<AWSBotStatus> {
	readonly platformName = "aws" as const;

	constructor(
		private readonly ecsClient: ECSClient,
		private readonly config: AWSPlatformConfig,
		private readonly botEnvConfig: AWSBotEnvConfig,
	) {}

	async deployBot(botConfig: BotConfig): Promise<PlatformDeployResult> {
		const taskDefinition = this.getTaskDefinition(botConfig.meeting.platform);
		const containerName = this.getContainerName(botConfig.meeting.platform);

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
				throw new PlatformDeployError(
					"Failed to start ECS task: no task ARN returned",
					"aws",
				);
			}

			console.log(
				`[AWSPlatform] Bot ${botConfig.id} deployed as task ${task.taskArn}`,
			);

			return { identifier: task.taskArn };
		} catch (error) {
			// Re-throw if already a PlatformDeployError
			if (error instanceof PlatformDeployError) {
				throw error;
			}

			const cause = error instanceof Error ? error : undefined;

			console.error(
				`[AWSPlatform] Failed to deploy bot ${botConfig.id}:`,
				error,
			);

			throw new PlatformDeployError(
				`ECS RunTask failed: ${cause?.message ?? "Unknown error"}`,
				"aws",
				cause,
			);
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
			// Task not found means it's already stopped/terminated (idempotent operation)
			const isTaskNotFound =
				error instanceof Error &&
				error.name === "InvalidParameterException" &&
				error.message.includes("not found");

			if (isTaskNotFound) {
				console.log(
					`[AWSPlatform] Task ${identifier} already stopped (not found in ECS)`,
				);

				return;
			}

			console.error(`[AWSPlatform] Failed to stop task ${identifier}:`, error);

			throw error;
		}
	}

	async getBotStatus(identifier: string): Promise<AWSBotStatus> {
		try {
			const result = await this.ecsClient.send(
				new DescribeTasksCommand({
					cluster: this.config.cluster,
					tasks: [identifier],
				}),
			);

			const task = result.tasks?.[0];

			if (!task) {
				console.warn(
					`[AWSPlatform] No task found for identifier ${identifier}`,
				);

				return "FAILED";
			}

			return AWSStatusMapper.toDomain(task.lastStatus);
		} catch (error) {
			console.error(
				`[AWSPlatform] Failed to get status for task ${identifier}:`,
				error,
			);

			return "FAILED";
		}
	}

	/**
	 * Gets cluster metrics for capacity monitoring
	 * Field order: metadata, then status fields (UPPERCASE per PLATFORM_NOMENCLATURE.md)
	 */
	async getClusterMetrics(): Promise<{
		cluster: string;
		region: string;
		PROVISIONING: number;
		RUNNING: number;
		STOPPED: number;
		FAILED: number;
		total: number;
	}> {
		try {
			// List all tasks in the cluster
			const listResult = await this.ecsClient.send(
				new ListTasksCommand({
					cluster: this.config.cluster,
				}),
			);

			const taskArns = listResult.taskArns ?? [];

			if (taskArns.length === 0) {
				return {
					cluster: this.config.cluster,
					region: this.getRegionFromCluster(),
					PROVISIONING: 0,
					RUNNING: 0,
					STOPPED: 0,
					FAILED: 0,
					total: 0,
				};
			}

			// Describe tasks to get their statuses
			const describeResult = await this.ecsClient.send(
				new DescribeTasksCommand({
					cluster: this.config.cluster,
					tasks: taskArns,
				}),
			);

			let PROVISIONING = 0;
			let RUNNING = 0;
			let STOPPED = 0;
			let FAILED = 0;

			for (const task of describeResult.tasks ?? []) {
				const status = AWSStatusMapper.toDomain(task.lastStatus);

				switch (status) {
					case "PROVISIONING":
						PROVISIONING++;

						break;
					case "RUNNING":
						RUNNING++;

						break;
					case "STOPPED":
						STOPPED++;

						break;
					case "FAILED":
						FAILED++;

						break;
				}
			}

			return {
				cluster: this.config.cluster,
				region: this.getRegionFromCluster(),
				PROVISIONING,
				RUNNING,
				STOPPED,
				FAILED,
				total: taskArns.length,
			};
		} catch (error) {
			// Log credential errors concisely without full stack trace
			const isCredentialError =
				error instanceof Error && error.name === "CredentialsProviderError";

			if (isCredentialError) {
				console.warn(
					"[AWSPlatform] AWS credentials not configured, skipping cluster metrics",
				);
			} else {
				console.error("[AWSPlatform] Failed to get cluster metrics:", error);
			}

			return {
				cluster: this.config.cluster,
				region: this.getRegionFromCluster(),
				PROVISIONING: 0,
				RUNNING: 0,
				STOPPED: 0,
				FAILED: 0,
				total: 0,
			};
		}
	}

	/**
	 * Extracts region from cluster ARN or returns 'unknown'
	 */
	private getRegionFromCluster(): string {
		// Cluster ARN format: arn:aws:ecs:REGION:ACCOUNT:cluster/NAME
		const arnMatch = this.config.cluster.match(/arn:aws:ecs:([^:]+):/);

		return arnMatch?.[1] ?? "unknown";
	}

	/**
	 * Gets the task definition for a meeting platform
	 */
	private getTaskDefinition(platform: string | undefined): string {
		switch (platform?.toLowerCase()) {
			case "zoom":
				return this.config.taskDefinitions.zoom;
			case "microsoft-teams":
				return this.config.taskDefinitions["microsoft-teams"];
			case "google-meet":
				return this.config.taskDefinitions["google-meet"];
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
			case "microsoft-teams":
				return "microsoft-teams-bot";
			case "google-meet":
				return "google-meet-bot";
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}
	}

	/**
	 * Builds environment variables for the bot container.
	 * ECS uses BOT_ID for direct bot config lookup via bots.getConfig endpoint.
	 */
	private buildEnvironmentVariables(
		botConfig: BotConfig,
	): Array<{ name: string; value: string }> {
		return [
			// Bot identifier for fetching config from Milo API (ECS uses direct bot ID)
			{ name: "BOT_ID", value: botConfig.id.toString() },

			// Milo API URL for tRPC calls
			{ name: "MILO_URL", value: this.botEnvConfig.miloUrl },

			// Authentication
			{ name: "MILO_AUTH_TOKEN", value: this.botEnvConfig.miloAuthToken },

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
}
