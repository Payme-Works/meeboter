/**
 * Next.js Instrumentation Hook
 *
 * This file runs once when the Next.js server starts.
 * Use it for server-side initialization like:
 * - Background workers
 * - Database connection warmup
 * - Telemetry initialization
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
	// Only run on the server (Node.js runtime)
	if (process.env.NEXT_RUNTIME === "nodejs") {
		await startBackgroundWorkers();
	}
}

/**
 * Initializes and starts all background workers.
 *
 * Workers are only started in production to avoid interference during development.
 * Uses dynamic imports to avoid circular dependencies.
 */
async function startBackgroundWorkers(): Promise<void> {
	const { env } = await import("@/env");

	// Skip during build time (SKIP_ENV_VALIDATION is set during Docker builds)
	const isBuildTime = !!process.env.SKIP_ENV_VALIDATION;

	if (env.NODE_ENV !== "production" || isBuildTime) {
		console.log(
			"[Instrumentation] Skipping workers (not production or build time)",
		);

		return;
	}

	// Lazy import to ensure db and services are fully initialized
	const [{ db }, { services }, { startWorkers }] = await Promise.all([
		import("@/server/database/db"),
		import("@/server/api/services"),
		import("@/server/workers"),
	]);

	console.log("[Instrumentation] Starting background workers...");
	startWorkers(db, services);
}
