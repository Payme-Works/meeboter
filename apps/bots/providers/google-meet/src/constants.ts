/**
 * Google Meet specific configuration
 */
export const GOOGLE_MEET_CONFIG = {
	/** Expected domain for Google Meet */
	DOMAIN: "meet.google.com",

	/** Threshold for sustained indicator absence before confirming removal (30 seconds) */
	SUSTAINED_ABSENCE_THRESHOLD_MS: 30000,
} as const;
