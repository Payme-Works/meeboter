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
 * Detects which platform to use based on available environment variables
 *
 * Priority:
 * 1. Local (in development mode, to avoid accidentally using production services)
 * 2. Coolify (if COOLIFY_API_URL is set and not a fake placeholder)
 * 3. AWS (if AWS_REGION and ECS_CLUSTER are set)
 * 4. Kubernetes (if K8S_NAMESPACE is set or running in-cluster)
 * 5. Error if none is configured
 *
 * To use Coolify, AWS, or K8s in development, explicitly set DEPLOYMENT_PLATFORM.
 */
function detectPlatform(): "coolify" | "aws" | "k8s" | "local" {
	// In development, default to local to avoid accidentally using production services
	// Use DEPLOYMENT_PLATFORM=coolify, DEPLOYMENT_PLATFORM=aws, or DEPLOYMENT_PLATFORM=k8s to override
	if (env.NODE_ENV === "development") {
		console.log(
			"[PlatformFactory] Development mode, defaulting to local platform. " +
				"Set DEPLOYMENT_PLATFORM=coolify, DEPLOYMENT_PLATFORM=aws, or DEPLOYMENT_PLATFORM=k8s to override.",
		);

		return "local";
	}

	// Check for Coolify configuration
	// Note: env.js provides fake defaults for development, so we check for real values
	const hasCoolify =
		env.COOLIFY_API_URL &&
		!env.COOLIFY_API_URL.includes("localhost:8000") &&
		env.COOLIFY_API_TOKEN &&
		!env.COOLIFY_API_TOKEN.includes("fake");

	if (hasCoolify) {
		return "coolify";
	}

	// Check for AWS configuration
	const hasAWS = env.AWS_REGION && env.ECS_CLUSTER && env.ECS_SUBNETS;

	if (hasAWS) {
		return "aws";
	}

	// Check for Kubernetes configuration
	// Either running in-cluster or K8S_KUBECONFIG is set
	const hasK8s = process.env.KUBERNETES_SERVICE_HOST || env.K8S_KUBECONFIG;

	if (hasK8s) {
		return "k8s";
	}

	throw new Error(
		"Unable to detect deployment platform. " +
			"Set DEPLOYMENT_PLATFORM environment variable or provide platform-specific configuration. " +
			"For Coolify: COOLIFY_API_URL, COOLIFY_API_TOKEN. " +
			"For AWS: AWS_REGION, ECS_CLUSTER, ECS_SUBNETS. " +
			"For Kubernetes: K8S_KUBECONFIG or run in-cluster. " +
			"For Local: Set DEPLOYMENT_PLATFORM=local.",
	);
}

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
function createAWSPlatformService(): AWSPlatformService {
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
 * otherwise auto-detects based on available configuration.
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

	const platform =
		configuredPlatform === "auto" ? detectPlatform() : configuredPlatform;

	console.log(`[PlatformFactory] Using ${platform} deployment platform`);

	if (platform === "coolify") {
		return createCoolifyPlatformService();
	}

	if (platform === "aws") {
		return createAWSPlatformService();
	}

	if (platform === "k8s") {
		return createKubernetesPlatformService();
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

	return configuredPlatform === "auto" ? detectPlatform() : configuredPlatform;
}
