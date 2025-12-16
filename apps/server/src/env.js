import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Check if we're in a real production deployment (not just a build)
// During builds, NODE_ENV is "production" but we still want development defaults
const isProductionDeployment =
	process.env.VERCEL_ENV === "production" ||
	(process.env.NODE_ENV === "production" &&
		!process.env.SKIP_ENV_VALIDATION &&
		process.env.COOLIFY_API_URL !== undefined);

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
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
		COOLIFY_API_URL: !isProductionDeployment
			? z.preprocess(() => "http://localhost:8000/api/v1", z.string().url())
			: z.string().url(),
		COOLIFY_API_TOKEN: !isProductionDeployment
			? z.preprocess(() => "fake_coolify_token", z.string())
			: z.string(),
		COOLIFY_PROJECT_UUID: !isProductionDeployment
			? z.preprocess(() => "fake_project_uuid", z.string())
			: z.string(),
		COOLIFY_SERVER_UUID: !isProductionDeployment
			? z.preprocess(() => "fake_server_uuid", z.string())
			: z.string(),
		COOLIFY_ENVIRONMENT_NAME: z.string().default("production"),
		COOLIFY_DESTINATION_UUID: !isProductionDeployment
			? z.preprocess(() => "fake_destination_uuid", z.string())
			: z.string(),

		// GitHub Container Registry
		GHCR_ORG: !isProductionDeployment
			? z.preprocess(() => "fake_ghcr_org", z.string())
			: z.string(),
		BOT_IMAGE_TAG: z.string().default("latest"),

		// MinIO Configuration (S3-compatible)
		MINIO_ENDPOINT: !isProductionDeployment
			? z.preprocess(() => "http://localhost:9000", z.string().url())
			: z.string().url(),
		MINIO_ACCESS_KEY: !isProductionDeployment
			? z.preprocess(() => "fake_minio_access_key", z.string())
			: z.string(),
		MINIO_SECRET_KEY: !isProductionDeployment
			? z.preprocess(() => "fake_minio_secret_key", z.string())
			: z.string(),
		MINIO_BUCKET_NAME: !isProductionDeployment
			? z.preprocess(() => "meeboter-recordings", z.string())
			: z.string(),
		MINIO_REGION: z.string().default("us-east-1"),

		BOT_AUTH_TOKEN: z.string().optional(),

		NEXT_PUBLIC_APP_ORIGIN_URL: z.string().url(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
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

		// MinIO
		MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
		MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
		MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,
		MINIO_BUCKET_NAME: process.env.MINIO_BUCKET_NAME,
		MINIO_REGION: process.env.MINIO_REGION,

		BOT_AUTH_TOKEN: process.env.BOT_AUTH_TOKEN,
		NEXT_PUBLIC_APP_ORIGIN_URL: process.env.NEXT_PUBLIC_APP_ORIGIN_URL,
	},

	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,

	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
