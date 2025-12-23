import { PLATFORM_DISPLAY_NAMES } from "@/constants/platform";

/**
 * Formats a platform slug to its display name.
 *
 * @param platform - Platform slug (e.g., "google-meet", "microsoft-teams", "zoom")
 * @returns Human-readable platform name (e.g., "Google Meet")
 */
export function formatPlatformName(platform: string | null | undefined): string {
	if (!platform) return "Unknown";
	return PLATFORM_DISPLAY_NAMES[platform] ?? "Unknown";
}
