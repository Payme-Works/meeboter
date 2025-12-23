import { ECSClient } from "@aws-sdk/client-ecs";

import { env } from "@/env";
import { db } from "@/server/database/db";
import { BotPoolService } from "../bot-pool-service";
import { CoolifyService } from "../coolify-service";
import { DeploymentQueueService } from "../deployment-queue-service";
import { ImagePullLockService } from "../image-pull-lock-service";
import {
	type AWSBotEnvConfig,
	type AWSPlatformConfig,
	AWSPlatformService,
} from "./aws-platform-service";
import { CoolifyPlatformService } from "./coolify-platform-service";
import { createKubernetesPlatformService } from "./kubernetes-platform-service";
import { LocalPlatformService } from "./local-platform-service";
import type { PlatformService } from "./platform-service";

/**
 * Creates a Coolify platform service instance
 */
function createCoolifyPlatformService(): CoolifyPlatformService {
	const imagePullLock = new ImagePullLockService();
	const deploymentQueue = new DeploymentQueueService();

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
			miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
			miloAuthToken: env.MILO_AUTH_TOKEN ?? "",
			s3Endpoint: env.S3_ENDPOINT,
			s3AccessKey: env.S3_ACCESS_KEY,
			s3SecretKey: env.S3_SECRET_KEY,
			s3BucketName: env.S3_BUCKET_NAME,
			s3Region: env.S3_REGION,
		},
		{
			ghcrOrg: env.GHCR_ORG,
		},
		imagePullLock,
	);

	const poolService = new BotPoolService(db, coolifyService, deploymentQueue);

	return new CoolifyPlatformService(poolService, coolifyService);
}

/**
 * Creates an AWS platform service instance
 */
export function createAWSPlatformService(): AWSPlatformService {
	if (!env.AWS_REGION) {
		throw new Error(
			"AWS_REGION environment variable is required for AWS platform",
		);
	}

	const ecsClient = new ECSClient({ region: env.AWS_REGION });

	const config: AWSPlatformConfig = {
		cluster: env.ECS_CLUSTER ?? "",
		subnets: (env.ECS_SUBNETS ?? "").split(",").filter(Boolean),
		securityGroups: (env.ECS_SECURITY_GROUPS ?? "").split(",").filter(Boolean),
		taskDefinitions: {
			zoom: env.ECS_TASK_DEF_ZOOM ?? "",
			"microsoft-teams": env.ECS_TASK_DEF_MICROSOFT_TEAMS ?? "",
			"google-meet": env.ECS_TASK_DEF_GOOGLE_MEET ?? "",
		},
		assignPublicIp: env.ECS_ASSIGN_PUBLIC_IP,
	};

	const botEnvConfig: AWSBotEnvConfig = {
		miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
		miloAuthToken: env.MILO_AUTH_TOKEN ?? "",
		s3Endpoint: env.S3_ENDPOINT,
		s3AccessKey: env.S3_ACCESS_KEY,
		s3SecretKey: env.S3_SECRET_KEY,
		s3BucketName: env.S3_BUCKET_NAME,
		s3Region: env.S3_REGION,
	};

	return new AWSPlatformService(ecsClient, config, botEnvConfig);
}

/**
 * Creates a local platform service instance for development
 */
function createLocalPlatformService(): LocalPlatformService {
	return new LocalPlatformService({
		miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
		miloAuthToken: env.MILO_AUTH_TOKEN ?? "",
		s3Endpoint: env.S3_ENDPOINT,
		s3AccessKey: env.S3_ACCESS_KEY,
		s3SecretKey: env.S3_SECRET_KEY,
		s3BucketName: env.S3_BUCKET_NAME,
		s3Region: env.S3_REGION,
	});
}

/**
 * Creates a platform service based on configuration
 *
 * Uses DEPLOYMENT_PLATFORM environment variable if set,
 * otherwise defaults to local platform.
 *
 * In development mode, ALWAYS defaults to local platform to prevent
 * accidentally using production services. Set DEPLOYMENT_PLATFORM=coolify
 * or DEPLOYMENT_PLATFORM=aws AND FORCE_REMOTE_PLATFORM=true to override.
 *
 * @returns Configured platform service instance
 */
export function createPlatformService(): PlatformService {
	const configuredPlatform = env.DEPLOYMENT_PLATFORM;

	// During build phase, env vars may be undefined (default to local)
	if (!configuredPlatform) {
		console.log(
			"[PlatformFactory] No platform configured (build phase?), using local",
		);

		return createLocalPlatformService();
	}

	// In development mode, ALWAYS use local unless explicitly forced
	if (env.NODE_ENV === "development" && configuredPlatform !== "local") {
		const forceRemote = process.env.FORCE_REMOTE_PLATFORM === "true";

		if (!forceRemote) {
			console.log(
				"[PlatformFactory] Development mode, using local platform. " +
					`To use ${configuredPlatform}, set FORCE_REMOTE_PLATFORM=true`,
			);

			return createLocalPlatformService();
		}

		console.log(
			`[PlatformFactory] Development mode, FORCE_REMOTE_PLATFORM=true, using ${configuredPlatform}`,
		);
	}

	const platform = configuredPlatform;

	console.log(`[PlatformFactory] Using ${platform} deployment platform`);

	if (platform === "coolify") {
		return createCoolifyPlatformService();
	}

	if (platform === "aws") {
		return createAWSPlatformService();
	}

	if (platform === "k8s") {
		const imagePullLock = new ImagePullLockService();

		return createKubernetesPlatformService(imagePullLock);
	}

	if (platform === "local") {
		return createLocalPlatformService();
	}

	throw new Error(`Unknown deployment platform: ${platform}`);
}

/**
 * Gets the currently configured platform type
 *
 * Useful for conditional logic based on platform without creating the service.
 * Returns "local" in development mode unless FORCE_REMOTE_PLATFORM=true.
 */
export function getPlatformType(): "coolify" | "aws" | "k8s" | "local" {
	const configuredPlatform = env.DEPLOYMENT_PLATFORM;

	// During build phase, env vars may be undefined (default to local)
	if (!configuredPlatform) {
		return "local";
	}

	// In development mode, ALWAYS return local unless explicitly forced
	if (env.NODE_ENV === "development" && configuredPlatform !== "local") {
		const forceRemote = process.env.FORCE_REMOTE_PLATFORM === "true";

		if (!forceRemote) {
			return "local";
		}
	}

	return configuredPlatform;
}
