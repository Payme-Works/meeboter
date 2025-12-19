import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Environment variable validation for the bots application.
 * Uses @t3-oss/env-core for type-safe environment variable access.
 *
 * Required variables:
 * - NODE_ENV: The runtime environment (development, production, test)
 * - POOL_SLOT_UUID: Identifies which pool slot this bot instance represents
 * - MILO_URL: Backend API URL
 * - MILO_AUTH_TOKEN: Authentication token for API calls
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
		// Coolify uses its own ID format (e.g., "wcw0o088ogsk0c8cgsg0ko0w"), not standard UUIDs
		POOL_SLOT_UUID: z.string().min(1),

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
