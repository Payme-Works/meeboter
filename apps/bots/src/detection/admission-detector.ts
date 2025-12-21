/**
 * Result of an admission check
 */
export type AdmissionResult = {
	admitted: boolean;
	method?: "definitive_indicator" | "structural_check" | "confirmation_text";
	stable: boolean;
};

/**
 * Interface for platform-specific admission detection.
 * Implementations determine if a bot has been admitted to a meeting.
 */
export interface AdmissionDetector {
	/**
	 * Check if the bot has been admitted to the call.
	 * @returns Result indicating admission status and detection method
	 */
	check(): Promise<AdmissionResult>;

	/**
	 * Check if the bot is currently in a waiting room.
	 * @returns true if in waiting room, false otherwise
	 */
	isInWaitingRoom(): Promise<boolean>;
}
