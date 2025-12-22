/**
 * Timeouts for cleanup operations (in milliseconds)
 */
export const CLEANUP_TIMEOUTS = {
	/** Timeout for recording/stream to stop gracefully */
	STOP_RECORDING: 10000,
	/** Timeout for browser to close */
	BROWSER_CLOSE: 15000,
	/** Timeout for WebSocket server to close */
	WSS_CLOSE: 5000,
} as const;

/**
 * Timeouts for detection operations (in milliseconds)
 */
export const DETECTION_TIMEOUTS = {
	/** Standard timeout for element existence checks */
	ELEMENT_CHECK: 500,
	/** Fast timeout for quick element checks */
	ELEMENT_CHECK_FAST: 200,
	/** Delay to verify state stability after initial detection */
	STABILIZATION_DELAY: 500,
	/** Interval between admission checks */
	CHECK_INTERVAL: 1000,
	/** Interval between monitoring loop iterations */
	MONITOR_INTERVAL: 5000,
} as const;

/**
 * Monitoring loop configuration
 */
export const MONITORING_CONFIG = {
	/** Number of iterations between health check logs (~1 minute at 5s interval) */
	HEALTH_CHECK_INTERVAL: 12,
} as const;
