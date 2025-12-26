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
		// ─── Core ────────────────────────────────────────────────────────────
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),

		// ─── Authentication ──────────────────────────────────────────────────
		AUTH_SECRET: z.string(),
		AUTH_GITHUB_ID: z.string(),
		AUTH_GITHUB_SECRET: z.string(),

		// ─── Database ────────────────────────────────────────────────────────
		DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, {
			message: "DATABASE_URL must start with postgresql:// or postgres://",
		}),
		DATABASE_SSL: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),

		// ─── Application ─────────────────────────────────────────────────────
		MILO_AUTH_TOKEN: z.string(),
		GHCR_ORG: z.string(),

		// ─── Storage (S3-Compatible) ─────────────────────────────────────────
		S3_ENDPOINT: z.url(),
		S3_ACCESS_KEY: z.string(),
		S3_SECRET_KEY: z.string(),
		S3_BUCKET_NAME: z.string(),
		S3_REGION: z.string().default("us-east-1"),

		// ─── Platform Selection ──────────────────────────────────────────────
		PLATFORM_PRIORITY: z
			.string()
			.min(1, "PLATFORM_PRIORITY is required")
			.default("local")
			.transform((s) =>
				s
					.split(",")
					.map((p) => p.trim() as "k8s" | "aws" | "coolify" | "local"),
			),
		GLOBAL_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),
		DEPLOYMENT_QUEUE_MAX_CONCURRENT: z.coerce.number().int().min(1).default(4),

		// ─── Coolify Platform ────────────────────────────────────────────────
		COOLIFY_API_URL: z.url(),
		COOLIFY_API_TOKEN: z.string(),
		COOLIFY_PROJECT_UUID: z.string(),
		COOLIFY_SERVER_UUID: z.string(),
		COOLIFY_ENVIRONMENT_NAME: z.string().default("production"),
		COOLIFY_DESTINATION_UUID: z.string(),
		COOLIFY_BOT_LIMIT: z.coerce.number().int().positive().optional(),
		COOLIFY_QUEUE_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(300000),

		// ─── AWS ECS Platform ────────────────────────────────────────────────
		AWS_REGION: z.string().optional(),
		AWS_ECS_CLUSTER: z.string().optional(),
		AWS_ECS_SUBNETS: z.string().optional(),
		AWS_ECS_SECURITY_GROUPS: z.string().optional(),
		AWS_ECS_TASK_DEF_GOOGLE_MEET: z.string().optional(),
		AWS_ECS_TASK_DEF_MICROSOFT_TEAMS: z.string().optional(),
		AWS_ECS_TASK_DEF_ZOOM: z.string().optional(),
		AWS_ECS_ASSIGN_PUBLIC_IP: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),
		AWS_BOT_LIMIT: z.coerce.number().int().positive().optional(),
		AWS_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

		// ─── Kubernetes Platform ─────────────────────────────────────────────
		K8S_NAMESPACE: z.string().default("meeboter"),
		K8S_KUBECONFIG: z.string().optional(),
		K8S_IMAGE_REGISTRY: z.string().optional(),
		K8S_IMAGE_TAG: z.string().default("latest"),
		K8S_BOT_CPU_REQUEST: z.string().default("500m"),
		K8S_BOT_CPU_LIMIT: z.string().default("1000m"),
		K8S_BOT_MEMORY_REQUEST: z.string().default("1Gi"),
		K8S_BOT_MEMORY_LIMIT: z.string().default("2Gi"),
		K8S_IMAGE_PULL_LOCK_ENABLED: z
			.enum(["true", "false"])
			.default("true")
			.transform((val) => val === "true"),
		K8S_BOT_LIMIT: z.coerce.number().int().positive().optional(),
		K8S_QUEUE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
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
		// ─── Core ────────────────────────────────────────────────────────────
		NODE_ENV: process.env.NODE_ENV,

		// ─── Authentication ──────────────────────────────────────────────────
		AUTH_SECRET: process.env.AUTH_SECRET,
		AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
		AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,

		// ─── Database ────────────────────────────────────────────────────────
		DATABASE_URL: process.env.DATABASE_URL,
		DATABASE_SSL: process.env.DATABASE_SSL,

		// ─── Application ─────────────────────────────────────────────────────
		NEXT_PUBLIC_APP_ORIGIN_URL: process.env.NEXT_PUBLIC_APP_ORIGIN_URL,
		MILO_AUTH_TOKEN: process.env.MILO_AUTH_TOKEN,
		GHCR_ORG: process.env.GHCR_ORG,

		// ─── Storage (S3-Compatible) ─────────────────────────────────────────
		S3_ENDPOINT: process.env.S3_ENDPOINT,
		S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
		S3_SECRET_KEY: process.env.S3_SECRET_KEY,
		S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
		S3_REGION: process.env.S3_REGION,

		// ─── Platform Selection ──────────────────────────────────────────────
		PLATFORM_PRIORITY: process.env.PLATFORM_PRIORITY,
		GLOBAL_QUEUE_TIMEOUT_MS: process.env.GLOBAL_QUEUE_TIMEOUT_MS,
		DEPLOYMENT_QUEUE_MAX_CONCURRENT:
			process.env.DEPLOYMENT_QUEUE_MAX_CONCURRENT,

		// ─── Coolify Platform ────────────────────────────────────────────────
		COOLIFY_API_URL: process.env.COOLIFY_API_URL,
		COOLIFY_API_TOKEN: process.env.COOLIFY_API_TOKEN,
		COOLIFY_PROJECT_UUID: process.env.COOLIFY_PROJECT_UUID,
		COOLIFY_SERVER_UUID: process.env.COOLIFY_SERVER_UUID,
		COOLIFY_ENVIRONMENT_NAME: process.env.COOLIFY_ENVIRONMENT_NAME,
		COOLIFY_DESTINATION_UUID: process.env.COOLIFY_DESTINATION_UUID,
		COOLIFY_BOT_LIMIT: process.env.COOLIFY_BOT_LIMIT,
		COOLIFY_QUEUE_TIMEOUT_MS: process.env.COOLIFY_QUEUE_TIMEOUT_MS,

		// ─── AWS ECS Platform ────────────────────────────────────────────────
		AWS_REGION: process.env.AWS_REGION,
		AWS_ECS_CLUSTER: process.env.AWS_ECS_CLUSTER,
		AWS_ECS_SUBNETS: process.env.AWS_ECS_SUBNETS,
		AWS_ECS_SECURITY_GROUPS: process.env.AWS_ECS_SECURITY_GROUPS,
		AWS_ECS_TASK_DEF_GOOGLE_MEET: process.env.AWS_ECS_TASK_DEF_GOOGLE_MEET,
		AWS_ECS_TASK_DEF_MICROSOFT_TEAMS:
			process.env.AWS_ECS_TASK_DEF_MICROSOFT_TEAMS,
		AWS_ECS_TASK_DEF_ZOOM: process.env.AWS_ECS_TASK_DEF_ZOOM,
		AWS_ECS_ASSIGN_PUBLIC_IP: process.env.AWS_ECS_ASSIGN_PUBLIC_IP,
		AWS_BOT_LIMIT: process.env.AWS_BOT_LIMIT,
		AWS_QUEUE_TIMEOUT_MS: process.env.AWS_QUEUE_TIMEOUT_MS,

		// ─── Kubernetes Platform ─────────────────────────────────────────────
		K8S_NAMESPACE: process.env.K8S_NAMESPACE,
		K8S_KUBECONFIG: process.env.K8S_KUBECONFIG,
		K8S_IMAGE_REGISTRY: process.env.K8S_IMAGE_REGISTRY,
		K8S_IMAGE_TAG: process.env.K8S_IMAGE_TAG,
		K8S_BOT_CPU_REQUEST: process.env.K8S_BOT_CPU_REQUEST,
		K8S_BOT_CPU_LIMIT: process.env.K8S_BOT_CPU_LIMIT,
		K8S_BOT_MEMORY_REQUEST: process.env.K8S_BOT_MEMORY_REQUEST,
		K8S_BOT_MEMORY_LIMIT: process.env.K8S_BOT_MEMORY_LIMIT,
		K8S_IMAGE_PULL_LOCK_ENABLED: process.env.K8S_IMAGE_PULL_LOCK_ENABLED,
		K8S_BOT_LIMIT: process.env.K8S_BOT_LIMIT,
		K8S_QUEUE_TIMEOUT_MS: process.env.K8S_QUEUE_TIMEOUT_MS,
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
