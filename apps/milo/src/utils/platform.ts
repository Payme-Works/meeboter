import { PLATFORM_DISPLAY_NAMES } from "@/constants/platform";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeploymentPlatformPriority = "k8s" | "aws" | "coolify" | "local";

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Formats a platform slug to its display name.
 *
 * @param platform - Platform slug (e.g., "google-meet", "microsoft-teams", "zoom")
 * @returns Human-readable platform name (e.g., "Google Meet")
 */
export function formatPlatformName(
	platform: string | null | undefined,
): string {
	if (!platform) return "Unknown";

	return PLATFORM_DISPLAY_NAMES[platform] ?? "Unknown";
}

/**
 * Parses PLATFORM_PRIORITY which may be an array (runtime) or string (build time)
 *
 * During Next.js build phase, env validation is skipped so the value is not
 * transformed by zod. This function handles both cases safely.
 *
 * @param value - The PLATFORM_PRIORITY env value (array at runtime, string at build)
 * @returns Parsed array of platform priorities
 */
export function parsePlatformPriority(
	value: unknown,
): DeploymentPlatformPriority[] {
	if (Array.isArray(value)) {
		return value;
	}

	if (typeof value === "string" && value.length > 0) {
		return value.split(",").map((p) => p.trim() as DeploymentPlatformPriority);
	}

	return [];
}
