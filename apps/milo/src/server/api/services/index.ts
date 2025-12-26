import { ECSClient } from "@aws-sdk/client-ecs";

import { env } from "@/env";
import { db } from "@/server/database/db";
import { parsePlatformPriority } from "@/utils/platform";
import { BotDeploymentService } from "./bot-deployment-service";
import { BotPoolService } from "./bot-pool-service";
import { CoolifyService } from "./coolify-service";
import { DeploymentQueueService } from "./deployment-queue-service";
import { ImagePullLockService } from "./image-pull-lock-service";
import {
	type AWSBotEnvConfig,
	type AWSPlatformConfig,
	AWSPlatformService,
} from "./platform/aws-platform-service";
import { CoolifyPlatformService } from "./platform/coolify-platform-service";
import {
	type DeploymentPlatform,
	HybridPlatformService,
} from "./platform/hybrid-platform-service";
import {
	createKubernetesPlatformService,
	type KubernetesPlatformService,
} from "./platform/kubernetes-platform-service";
import type { PlatformService } from "./platform/platform-service";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Service container for dependency injection
 */
export interface Services {
	hybrid: HybridPlatformService;
	deployment: BotDeploymentService;

	/**
	 * Coolify-specific services for admin operations
	 * Only available when coolify is in PLATFORM_PRIORITY
	 */
	coolify?: CoolifyService;
	pool?: BotPoolService;

	/**
	 * Deployment queue for limiting concurrent Coolify deployments
	 * Only available when coolify is in PLATFORM_PRIORITY
	 */
	deploymentQueue?: DeploymentQueueService;

	/**
	 * Kubernetes-specific service for admin operations
	 * Only available when k8s is in PLATFORM_PRIORITY
	 */
	k8s?: KubernetesPlatformService;

	/**
	 * AWS-specific service for admin operations
	 * Only available when aws is in PLATFORM_PRIORITY
	 */
	aws?: AWSPlatformService;
}

// ─── Platform Service Factories ─────────────────────────────────────────────

function createCoolifyPlatformService(): {
	service: CoolifyPlatformService;
	coolify: CoolifyService;
	pool: BotPoolService;
	deploymentQueue: DeploymentQueueService;
} {
	const imagePullLock = new ImagePullLockService();
	const deploymentQueue = new DeploymentQueueService();

	const coolify = new CoolifyService(
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
			miloAuthToken: env.MILO_AUTH_TOKEN,
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

	const pool = new BotPoolService(db, coolify, deploymentQueue);
	const service = new CoolifyPlatformService(pool, coolify);

	return { service, coolify, pool, deploymentQueue };
}

function createAWSPlatformService(): AWSPlatformService | undefined {
	if (!env.AWS_REGION || !env.AWS_BOT_LIMIT) {
		return undefined;
	}

	const ecsClient = new ECSClient({ region: env.AWS_REGION });

	const config: AWSPlatformConfig = {
		cluster: env.AWS_ECS_CLUSTER ?? "",
		subnets: (env.AWS_ECS_SUBNETS ?? "").split(",").filter(Boolean),
		securityGroups: (env.AWS_ECS_SECURITY_GROUPS ?? "")
			.split(",")
			.filter(Boolean),
		taskDefinitions: {
			zoom: env.AWS_ECS_TASK_DEF_ZOOM ?? "",
			"microsoft-teams": env.AWS_ECS_TASK_DEF_MICROSOFT_TEAMS ?? "",
			"google-meet": env.AWS_ECS_TASK_DEF_GOOGLE_MEET ?? "",
		},
		assignPublicIp: env.AWS_ECS_ASSIGN_PUBLIC_IP,
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

function createK8sPlatformService(): KubernetesPlatformService | undefined {
	if (!env.K8S_BOT_LIMIT) {
		return undefined;
	}

	const imagePullLock = new ImagePullLockService();

	return createKubernetesPlatformService(imagePullLock);
}

// ─── Service Creation ───────────────────────────────────────────────────────

/**
 * Creates all services with their dependencies wired up
 *
 * Uses HybridPlatformService to coordinate across multiple platforms
 * based on PLATFORM_PRIORITY environment variable.
 */
function createServices(): Services {
	const platformServices: {
		k8s?: PlatformService;
		aws?: PlatformService;
		coolify?: PlatformService;
	} = {};

	const services: Partial<Services> = {};

	// Get enabled platforms from priority list
	// During build phase, env vars are skipped and not transformed,
	// so PLATFORM_PRIORITY might be a raw string or undefined
	const platformPriority = parsePlatformPriority(env.PLATFORM_PRIORITY);

	const enabledPlatforms = platformPriority.filter(
		(p): p is DeploymentPlatform => p !== "local",
	);

	// Create platform services based on priority
	for (const platform of enabledPlatforms) {
		if (platform === "k8s") {
			const k8sService = createK8sPlatformService();

			if (k8sService) {
				platformServices.k8s = k8sService;
				services.k8s = k8sService;
			}
		}

		if (platform === "aws") {
			const awsService = createAWSPlatformService();

			if (awsService) {
				platformServices.aws = awsService;
				services.aws = awsService;
			}
		}

		if (platform === "coolify") {
			const coolifyResult = createCoolifyPlatformService();
			platformServices.coolify = coolifyResult.service;
			services.coolify = coolifyResult.coolify;
			services.pool = coolifyResult.pool;
			services.deploymentQueue = coolifyResult.deploymentQueue;
		}
	}

	// Create hybrid platform service
	const hybrid = new HybridPlatformService(db, platformServices);
	const deployment = new BotDeploymentService(db, hybrid);

	return {
		hybrid,
		deployment,
		...services,
	} as Services;
}

// ─── Singleton Export ───────────────────────────────────────────────────────

/**
 * Singleton service container
 *
 * All services are initialized once at startup and shared
 * across the application.
 */
export const services = createServices();
