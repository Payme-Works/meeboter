import { env } from "@/env";
import { db } from "@/server/database/db";
import { BotDeploymentService } from "./bot-deployment-service";
import { BotPoolService } from "./bot-pool-service";
import { CoolifyService } from "./coolify-service";
import { DeploymentQueueService } from "./deployment-queue-service";
import { ImagePullLockService } from "./image-pull-lock-service";
import { createPlatformService, getPlatformType } from "./platform";
import type { AWSPlatformService } from "./platform/aws-platform-service";
import {
	createKubernetesPlatformService,
	type KubernetesPlatformService,
} from "./platform/kubernetes-platform-service";
import { createAWSPlatformService } from "./platform/platform-factory";
import type { PlatformService } from "./platform/platform-service";

/**
 * Service container for dependency injection
 */
export interface Services {
	platform: PlatformService;
	deployment: BotDeploymentService;

	/**
	 * Coolify-specific services for admin operations
	 * Only available when platform is 'coolify'
	 */
	coolify?: CoolifyService;
	pool?: BotPoolService;

	/**
	 * Deployment queue for limiting concurrent Coolify deployments
	 * Only available when platform is 'coolify'
	 */
	deploymentQueue?: DeploymentQueueService;

	/**
	 * Kubernetes-specific service for admin operations
	 * Only available when platform is 'k8s'
	 */
	k8s?: KubernetesPlatformService;

	/**
	 * AWS-specific service for admin operations
	 * Only available when platform is 'aws'
	 */
	aws?: AWSPlatformService;
}

/**
 * Creates all services with their dependencies wired up
 *
 * Uses the platform factory to create the appropriate platform service
 * based on the DEPLOYMENT_PLATFORM environment variable.
 */
function createServices(): Services {
	const platform = createPlatformService();
	const deployment = new BotDeploymentService(db, platform);

	const services: Services = { platform, deployment };

	// For Coolify platform, also expose the underlying services
	// for admin/monitoring operations (pool stats, slot recovery)
	if (getPlatformType() === "coolify") {
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

		services.coolify = coolify;
		services.pool = pool;
		services.deploymentQueue = deploymentQueue;
	}

	// For Kubernetes platform, expose the underlying service
	// for admin/monitoring operations (job details, events, metrics)
	if (getPlatformType() === "k8s") {
		services.k8s = createKubernetesPlatformService();
	}

	// For AWS platform, expose the underlying service
	// for admin/monitoring operations (task counts, metrics)
	if (getPlatformType() === "aws") {
		services.aws = createAWSPlatformService();
	}

	return services;
}

/**
 * Singleton service container
 *
 * All services are initialized once at startup and shared
 * across the application.
 */
export const services = createServices();
// Bot deployment service exports
// Bot pool service exports (used by Coolify platform)
// Coolify service exports (used by Coolify platform)
// Deployment queue service exports (limits concurrent Coolify deployments)
// Platform abstraction exports
