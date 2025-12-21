/**
 * Result of a removal check
 */
export type RemovalResult = {
	removed: boolean;
	reason?:
		| "kick_dialog"
		| "domain_changed"
		| "path_changed"
		| "sustained_absence"
		| "page_null"
		| "iframe_missing"
		| "leave_button_missing";
	/** true = immediate removal (no grace period), false = requires sustained absence */
	immediate: boolean;
};

/**
 * Interface for platform-specific removal detection.
 * Implementations determine if a bot has been removed/kicked from a meeting.
 */
export interface RemovalDetector {
	/**
	 * Check if the bot has been removed from the call.
	 * @returns Result indicating removal status and reason
	 */
	check(): Promise<RemovalResult>;

	/**
	 * Reset the absence timer when indicators are found.
	 * Used by implementations that track sustained absence.
	 */
	resetAbsenceTimer(): void;
}
