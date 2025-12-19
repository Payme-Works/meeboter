import { env } from "@/env";
import { db } from "@/server/database/db";
import { BotDeploymentService } from "./bot-deployment-service";
import { BotPoolService } from "./bot-pool-service";
import { CoolifyService } from "./coolify-service";
import { ImagePullLockService } from "./image-pull-lock-service";
import {
	createPlatformService,
	getPlatformType,
	type PlatformService,
} from "./platform";

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
}

/**
 * Creates all services with their dependencies wired up
 *
 * Uses the platform factory to create the appropriate platform service
 * based on the DEPLOYMENT_PLATFORM environment variable or auto-detection.
 */
function createServices(): Services {
	const platform = createPlatformService();
	const deployment = new BotDeploymentService(db, platform);

	const services: Services = { platform, deployment };

	// For Coolify platform, also expose the underlying services
	// for admin/monitoring operations (pool stats, slot recovery)
	if (getPlatformType() === "coolify") {
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
				botImageTag: env.BOT_IMAGE_TAG,
			},
		);

		const imagePullLock = new ImagePullLockService();
		const pool = new BotPoolService(db, coolify, imagePullLock);

		services.coolify = coolify;
		services.pool = pool;
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
export type { DeployBotResult } from "./bot-deployment-service";
export {
	BotDeploymentError,
	BotDeploymentService,
} from "./bot-deployment-service";
// Bot pool service exports (used by Coolify platform)
export type {
	DeployResult,
	PoolSlot,
	PoolStats,
	QueueEntry,
	QueueStats,
} from "./bot-pool-service";
export { BotPoolService } from "./bot-pool-service";
// Coolify service exports (used by Coolify platform)
export type {
	BotEnvConfig,
	BotImage,
	CoolifyConfig,
	DeploymentStatusResult,
	ImageConfig,
} from "./coolify-service";
export { CoolifyDeploymentError, CoolifyService } from "./coolify-service";
// Platform abstraction exports
export type {
	PlatformBotStatus,
	PlatformDeployResult,
	PlatformDeployWithQueueResult,
	PlatformService,
	PlatformType,
} from "./platform";
export { createPlatformService, getPlatformType } from "./platform";
