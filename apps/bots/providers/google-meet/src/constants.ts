/**
 * Google Meet specific configuration
 */
export const GOOGLE_MEET_CONFIG = {
	/** Expected domain for Google Meet */
	DOMAIN: "meet.google.com",

	/** Threshold for sustained indicator absence before confirming removal (30 seconds) */
	SUSTAINED_ABSENCE_THRESHOLD_MS: 30_000,

	/** Extended grace period when reconnection is detected (5 minutes) */
	RECONNECTION_GRACE_PERIOD_MS: 300_000,

	/** Timeout per name fill attempt (5 seconds, faster failure detection) */
	NAME_FILL_TIMEOUT_MS: 5_000,

	/** Maximum retries for name fill operation */
	NAME_FILL_MAX_RETRIES: 8,

	/** Base delay for adaptive stabilization (200ms, doubles each retry up to max) */
	NAME_FILL_STABILIZATION_BASE_MS: 200,

	/** Maximum stabilization delay (1 second cap) */
	NAME_FILL_STABILIZATION_MAX_MS: 1_000,
} as const;
