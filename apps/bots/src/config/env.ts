import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variable validation for the bots application.
 * Uses @t3-oss/env-core for type-safe environment variable access.
 *
 * Required variables:
 * - NODE_ENV: The runtime environment (development, production, test)
 * - MILO_URL: Backend API URL
 * - MILO_AUTH_TOKEN: Authentication token for API calls
 *
 * Bot identification (one required):
 * - BOT_ID: Direct bot ID for K8s/ECS ephemeral deployments
 * - POOL_SLOT_UUID: Pool slot UUID for Coolify pool-based deployments
 *
 * Optional variables:
 * - DOCKER_MEETING_PLATFORM: Platform name when running in Docker
 * - HEARTBEAT_DEBUG: Enable/disable heartbeat debug logging
 *
 * S3 Storage:
 * - S3_ENDPOINT: S3-compatible endpoint URL (optional for AWS S3)
 * - S3_REGION: Storage region
 * - S3_ACCESS_KEY: Access key for authentication
 * - S3_SECRET_KEY: Secret key for authentication
 * - S3_BUCKET_NAME: Bucket name for recordings
 */
export const env = createEnv({
	server: {
		// Required
		NODE_ENV: z.enum(["development", "production", "test"]),

		// Bot identification (one of these is required)
		// BOT_ID: Direct bot ID for K8s/ECS ephemeral deployments
		BOT_ID: z.string().min(1).optional(),
		// POOL_SLOT_UUID: Pool slot UUID for Coolify pool-based deployments
		POOL_SLOT_UUID: z.string().min(1).optional(),

		// Backend API
		MILO_URL: z.url(),
		MILO_AUTH_TOKEN: z.string(),

		// Docker platform validation
		DOCKER_MEETING_PLATFORM: z.string().optional(),

		// Debug options
		HEARTBEAT_DEBUG: z
			.enum(["true", "false"])
			.default("true")
			.transform((v) => v === "true"),

		// S3 storage (supports both AWS S3 and S3-compatible like MinIO)
		S3_ENDPOINT: z.url().optional(),
		S3_REGION: z.string().default("us-east-1"),
		S3_ACCESS_KEY: z.string().optional(),
		S3_SECRET_KEY: z.string().optional(),
		S3_BUCKET_NAME: z.string().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
