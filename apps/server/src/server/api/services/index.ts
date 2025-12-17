import { env } from "@/env";
import { db } from "@/server/database/db";
import { BotDeploymentService } from "./bot-deployment-service";
import { BotPoolService } from "./bot-pool-service";
import { CoolifyService } from "./coolify-service";

/**
 * Service container for dependency injection
 */
export interface Services {
	coolify: CoolifyService;
	pool: BotPoolService;
	deployment: BotDeploymentService;
}

/**
 * Creates all services with their dependencies wired up
 */
function createServices(): Services {
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

	const pool = new BotPoolService(db, coolify);
	const deployment = new BotDeploymentService(db, pool);

	return { coolify, pool, deployment };
}

/**
 * Singleton service container
 *
 * All services are initialized once at startup and shared
 * across the application.
 */
export const services = createServices();

export type { DeployBotResult } from "./bot-deployment-service";
export {
	BotDeploymentError,
	BotDeploymentService,
} from "./bot-deployment-service";
export type {
	DeployResult,
	PoolSlot,
	PoolStats,
	QueueEntry,
	QueueStats,
} from "./bot-pool-service";
export { BotPoolService } from "./bot-pool-service";
export type {
	BotEnvConfig,
	BotImage,
	CoolifyConfig,
	DeploymentStatusResult,
	ImageConfig,
} from "./coolify-service";
// Re-export service classes and types for convenience
export { CoolifyDeploymentError, CoolifyService } from "./coolify-service";
