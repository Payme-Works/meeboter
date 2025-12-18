import { ECSClient } from "@aws-sdk/client-ecs";

import { env } from "@/env";
import { db } from "@/server/database/db";
import { BotPoolService } from "../bot-pool-service";
import { CoolifyService } from "../coolify-service";
import {
	type AWSBotEnvConfig,
	type AWSPlatformConfig,
	AWSPlatformService,
} from "./aws-platform-service";
import { CoolifyPlatformService } from "./coolify-platform-service";
import type { PlatformService } from "./platform-service";

/**
 * Platform type for deployment
 */
export type PlatformType = "coolify" | "aws" | "auto";

/**
 * Detects which platform to use based on available environment variables
 *
 * Priority:
 * 1. Coolify (if COOLIFY_API_URL is set and not a fake placeholder)
 * 2. AWS (if AWS_REGION and ECS_CLUSTER are set)
 * 3. Error if neither is configured
 */
function detectPlatform(): "coolify" | "aws" {
	// Check for Coolify configuration
	// Note: env.js provides fake defaults for development, so we check for real values
	const hasCoolify =
		process.env.COOLIFY_API_URL &&
		!process.env.COOLIFY_API_URL.includes("localhost:8000") &&
		process.env.COOLIFY_API_TOKEN &&
		!process.env.COOLIFY_API_TOKEN.includes("fake");

	if (hasCoolify) {
		return "coolify";
	}

	// Check for AWS configuration
	const hasAWS =
		process.env.AWS_REGION &&
		process.env.ECS_CLUSTER &&
		process.env.ECS_SUBNETS;

	if (hasAWS) {
		return "aws";
	}

	// In development, default to Coolify (even with fake values)
	if (env.NODE_ENV === "development") {
		console.log("[PlatformFactory] Development mode, defaulting to Coolify");

		return "coolify";
	}

	throw new Error(
		"Unable to detect deployment platform. " +
			"Set DEPLOYMENT_PLATFORM environment variable or provide platform-specific configuration. " +
			"For Coolify: COOLIFY_API_URL, COOLIFY_API_TOKEN. " +
			"For AWS: AWS_REGION, ECS_CLUSTER, ECS_SUBNETS.",
	);
}

/**
 * Creates a Coolify platform service instance
 */
function createCoolifyPlatformService(): CoolifyPlatformService {
	const coolifyService = new CoolifyService(
		{
			apiUrl: env.COOLIFY_API_URL,
			apiToken: env.COOLIFY_API_TOKEN,
			projectUuid: env.COOLIFY_PROJECT_UUID,
			serverUuid: env.COOLIFY_SERVER_UUID,
			environmentName: env.COOLIFY_ENVIRONMENT_NAME,
			destinationUuid: env.COOLIFY_DESTINATION_UUID,
		},
		{
			botAuthToken: env.BOT_AUTH_TOKEN ?? "",
			backendUrl: `${env.NEXT_PUBLIC_APP_ORIGIN_URL}/api/trpc`,
			minioEndpoint: env.MINIO_ENDPOINT,
			minioAccessKey: env.MINIO_ACCESS_KEY,
			minioSecretKey: env.MINIO_SECRET_KEY,
			minioBucketName: env.MINIO_BUCKET_NAME,
			minioRegion: env.MINIO_REGION,
		},
		{
			ghcrOrg: env.GHCR_ORG,
			botImageTag: env.BOT_IMAGE_TAG,
		},
	);

	const poolService = new BotPoolService(db, coolifyService);

	return new CoolifyPlatformService(poolService, coolifyService);
}

/**
 * Creates an AWS platform service instance
 */
function createAWSPlatformService(): AWSPlatformService {
	const region = process.env.AWS_REGION;

	if (!region) {
		throw new Error(
			"AWS_REGION environment variable is required for AWS platform",
		);
	}

	const ecsClient = new ECSClient({ region });

	const config: AWSPlatformConfig = {
		cluster: process.env.ECS_CLUSTER ?? "",
		subnets: (process.env.ECS_SUBNETS ?? "").split(",").filter(Boolean),
		securityGroups: (process.env.ECS_SECURITY_GROUPS ?? "")
			.split(",")
			.filter(Boolean),
		taskDefinitions: {
			zoom: process.env.ECS_TASK_DEF_ZOOM ?? "",
			teams: process.env.ECS_TASK_DEF_TEAMS ?? "",
			meet: process.env.ECS_TASK_DEF_MEET ?? "",
		},
		assignPublicIp: process.env.ECS_ASSIGN_PUBLIC_IP !== "false",
	};

	const botEnvConfig: AWSBotEnvConfig = {
		botAuthToken: env.BOT_AUTH_TOKEN ?? "",
		backendUrl: `${env.NEXT_PUBLIC_APP_ORIGIN_URL}/api/trpc`,
		minioEndpoint: env.MINIO_ENDPOINT,
		minioAccessKey: env.MINIO_ACCESS_KEY,
		minioSecretKey: env.MINIO_SECRET_KEY,
		minioBucketName: env.MINIO_BUCKET_NAME,
		minioRegion: env.MINIO_REGION,
	};

	return new AWSPlatformService(ecsClient, config, botEnvConfig);
}

/**
 * Creates a platform service based on configuration
 *
 * Uses DEPLOYMENT_PLATFORM environment variable if set,
 * otherwise auto-detects based on available configuration.
 *
 * @returns Configured platform service instance
 */
export function createPlatformService(): PlatformService {
	const configuredPlatform = (process.env.DEPLOYMENT_PLATFORM ??
		"auto") as PlatformType;

	const platform =
		configuredPlatform === "auto" ? detectPlatform() : configuredPlatform;

	console.log(`[PlatformFactory] Using ${platform} deployment platform`);

	if (platform === "coolify") {
		return createCoolifyPlatformService();
	}

	if (platform === "aws") {
		return createAWSPlatformService();
	}

	throw new Error(`Unknown deployment platform: ${platform}`);
}

/**
 * Gets the currently configured platform type
 *
 * Useful for conditional logic based on platform without creating the service.
 */
export function getPlatformType(): "coolify" | "aws" {
	const configuredPlatform = (process.env.DEPLOYMENT_PLATFORM ??
		"auto") as PlatformType;

	return configuredPlatform === "auto" ? detectPlatform() : configuredPlatform;
}
