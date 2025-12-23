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

		// S3-Compatible Storage (MinIO or AWS S3)
		S3_ENDPOINT: z.url(),
		S3_ACCESS_KEY: z.string(),
		S3_SECRET_KEY: z.string(),
		S3_BUCKET_NAME: z.string(),
		S3_REGION: z.string().default("us-east-1"),

		MILO_AUTH_TOKEN: z.string(),

		// Deployment Queue Configuration
		DEPLOYMENT_QUEUE_MAX_CONCURRENT: z.coerce.number().int().min(1).default(4),

		// AWS ECS Configuration (required when DEPLOYMENT_PLATFORM=aws)
		AWS_REGION: z.string().optional(),
		ECS_CLUSTER: z.string().optional(),
		ECS_SUBNETS: z.string().optional(),
		ECS_SECURITY_GROUPS: z.string().optional(),
		ECS_TASK_DEF_ZOOM: z.string().optional(),
		ECS_TASK_DEF_MICROSOFT_TEAMS: z.string().optional(),
		ECS_TASK_DEF_GOOGLE_MEET: z.string().optional(),
		ECS_ASSIGN_PUBLIC_IP: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),

		// Kubernetes Configuration (required when DEPLOYMENT_PLATFORM=k8s)
		K8S_NAMESPACE: z.string().default("meeboter"),
		K8S_IMAGE_REGISTRY: z.string().optional(),
		K8S_IMAGE_TAG: z.string().default("latest"),
		K8S_KUBECONFIG: z.string().optional(),
		K8S_BOT_CPU_REQUEST: z.string().default("250m"),
		K8S_BOT_CPU_LIMIT: z.string().default("500m"),
		K8S_BOT_MEMORY_REQUEST: z.string().default("768Mi"),
		K8S_BOT_MEMORY_LIMIT: z.string().default("1Gi"),
	},

	/**
	 * Client-side environment variables schema.
	 * Prefix with `NEXT_PUBLIC_` to expose to the client.
	 */
	client: {
		NEXT_PUBLIC_APP_ORIGIN_URL: z.url(),
		// Note: Must be set at BUILD TIME since NEXT_PUBLIC_ vars are inlined into client bundle
		NEXT_PUBLIC_DEPLOYMENT_PLATFORM: z
			.enum(["coolify", "aws", "k8s", "local"])
			.default("local"),
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

		// S3-Compatible Storage
		S3_ENDPOINT: process.env.S3_ENDPOINT,
		S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
		S3_SECRET_KEY: process.env.S3_SECRET_KEY,
		S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
		S3_REGION: process.env.S3_REGION,

		MILO_AUTH_TOKEN: process.env.MILO_AUTH_TOKEN,

		NEXT_PUBLIC_APP_ORIGIN_URL: process.env.NEXT_PUBLIC_APP_ORIGIN_URL,
		NEXT_PUBLIC_DEPLOYMENT_PLATFORM:
			process.env.NEXT_PUBLIC_DEPLOYMENT_PLATFORM,

		// Deployment Queue
		DEPLOYMENT_QUEUE_MAX_CONCURRENT:
			process.env.DEPLOYMENT_QUEUE_MAX_CONCURRENT,

		// AWS ECS
		AWS_REGION: process.env.AWS_REGION,
		ECS_CLUSTER: process.env.ECS_CLUSTER,
		ECS_SUBNETS: process.env.ECS_SUBNETS,
		ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS,
		ECS_TASK_DEF_ZOOM: process.env.ECS_TASK_DEF_ZOOM,
		ECS_TASK_DEF_MICROSOFT_TEAMS: process.env.ECS_TASK_DEF_MICROSOFT_TEAMS,
		ECS_TASK_DEF_GOOGLE_MEET: process.env.ECS_TASK_DEF_GOOGLE_MEET,
		ECS_ASSIGN_PUBLIC_IP: process.env.ECS_ASSIGN_PUBLIC_IP,

		// Kubernetes
		K8S_NAMESPACE: process.env.K8S_NAMESPACE,
		K8S_IMAGE_REGISTRY: process.env.K8S_IMAGE_REGISTRY,
		K8S_IMAGE_TAG: process.env.K8S_IMAGE_TAG,
		K8S_KUBECONFIG: process.env.K8S_KUBECONFIG,
		K8S_BOT_CPU_REQUEST: process.env.K8S_BOT_CPU_REQUEST,
		K8S_BOT_CPU_LIMIT: process.env.K8S_BOT_CPU_LIMIT,
		K8S_BOT_MEMORY_REQUEST: process.env.K8S_BOT_MEMORY_REQUEST,
		K8S_BOT_MEMORY_LIMIT: process.env.K8S_BOT_MEMORY_LIMIT,
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
