import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Skip validation during build phase
// Detects: Next.js build, CI environments, Docker builds (no runtime secrets)
const isBuildPhase =
	process.env.NEXT_PHASE === "phase-production-build" ||
	process.env.CI === "true" ||
	!process.env.DATABASE_URL;

export const env = createEnv({
	/**
	 * Server-side environment variables schema.
	 * Validated at runtime when the app starts.
	 */
	server: {
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		AUTH_SECRET: z.string(),
		AUTH_GITHUB_ID: z.string(),
		AUTH_GITHUB_SECRET: z.string(),

		DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, {
			message: "DATABASE_URL must start with postgresql:// or postgres://",
		}),
		DATABASE_SSL: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),

		// Coolify API Configuration
		COOLIFY_API_URL: z.url(),
		COOLIFY_API_TOKEN: z.string(),
		COOLIFY_PROJECT_UUID: z.string(),
		COOLIFY_SERVER_UUID: z.string(),
		COOLIFY_ENVIRONMENT_NAME: z.string().default("production"),
		COOLIFY_DESTINATION_UUID: z.string(),

		// GitHub Container Registry
		GHCR_ORG: z.string(),
		BOT_IMAGE_TAG: z.string().default("latest"),

		// S3-Compatible Storage (MinIO or AWS S3)
		S3_ENDPOINT: z.url(),
		S3_ACCESS_KEY: z.string(),
		S3_SECRET_KEY: z.string(),
		S3_BUCKET_NAME: z.string(),
		S3_REGION: z.string().default("us-east-1"),

		MILO_AUTH_TOKEN: z.string(),

		// Platform Selection
		DEPLOYMENT_PLATFORM: z
			.enum(["coolify", "aws", "local", "auto"])
			.default("auto"),

		// AWS ECS Configuration (required when DEPLOYMENT_PLATFORM=aws)
		AWS_REGION: z.string().optional(),
		ECS_CLUSTER: z.string().optional(),
		ECS_SUBNETS: z.string().optional(),
		ECS_SECURITY_GROUPS: z.string().optional(),
		ECS_TASK_DEF_ZOOM: z.string().optional(),
		ECS_TASK_DEF_TEAMS: z.string().optional(),
		ECS_TASK_DEF_MEET: z.string().optional(),
		ECS_ASSIGN_PUBLIC_IP: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),
	},

	/**
	 * Client-side environment variables schema.
	 * Prefix with `NEXT_PUBLIC_` to expose to the client.
	 */
	client: {
		NEXT_PUBLIC_APP_ORIGIN_URL: z.url(),
	},

	/**
	 * Manual destructuring required for Next.js edge runtimes and client-side.
	 */
	runtimeEnv: {
		AUTH_SECRET: process.env.AUTH_SECRET,
		AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
		AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,

		DATABASE_URL: process.env.DATABASE_URL,
		DATABASE_SSL: process.env.DATABASE_SSL,
		NODE_ENV: process.env.NODE_ENV,

		// Coolify
		COOLIFY_API_URL: process.env.COOLIFY_API_URL,
		COOLIFY_API_TOKEN: process.env.COOLIFY_API_TOKEN,
		COOLIFY_PROJECT_UUID: process.env.COOLIFY_PROJECT_UUID,
		COOLIFY_SERVER_UUID: process.env.COOLIFY_SERVER_UUID,
		COOLIFY_ENVIRONMENT_NAME: process.env.COOLIFY_ENVIRONMENT_NAME,
		COOLIFY_DESTINATION_UUID: process.env.COOLIFY_DESTINATION_UUID,

		// GHCR
		GHCR_ORG: process.env.GHCR_ORG,
		BOT_IMAGE_TAG: process.env.BOT_IMAGE_TAG,

		// S3-Compatible Storage
		S3_ENDPOINT: process.env.S3_ENDPOINT,
		S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
		S3_SECRET_KEY: process.env.S3_SECRET_KEY,
		S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
		S3_REGION: process.env.S3_REGION,

		MILO_AUTH_TOKEN: process.env.MILO_AUTH_TOKEN,

		NEXT_PUBLIC_APP_ORIGIN_URL: process.env.NEXT_PUBLIC_APP_ORIGIN_URL,

		// Platform Selection
		DEPLOYMENT_PLATFORM: process.env.DEPLOYMENT_PLATFORM,

		// AWS ECS
		AWS_REGION: process.env.AWS_REGION,
		ECS_CLUSTER: process.env.ECS_CLUSTER,
		ECS_SUBNETS: process.env.ECS_SUBNETS,
		ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS,
		ECS_TASK_DEF_ZOOM: process.env.ECS_TASK_DEF_ZOOM,
		ECS_TASK_DEF_TEAMS: process.env.ECS_TASK_DEF_TEAMS,
		ECS_TASK_DEF_MEET: process.env.ECS_TASK_DEF_MEET,
		ECS_ASSIGN_PUBLIC_IP: process.env.ECS_ASSIGN_PUBLIC_IP,
	},

	/**
	 * Skip validation during Next.js build phase.
	 * Env vars are validated at runtime when the app starts.
	 */
	skipValidation: isBuildPhase,

	/**
	 * Treat empty strings as undefined.
	 */
	emptyStringAsUndefined: true,
});
