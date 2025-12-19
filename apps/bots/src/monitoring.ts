import { setTimeout } from "node:timers/promises";
import { env } from "./env";
import { trpc } from "./trpc";
import { EventCode, Status } from "./types";

/**
 * Maximum allowed bot duration in milliseconds (1 hour)
 */
const MAX_BOT_DURATION_MS = 1 * 60 * 60 * 1000; // 1 hour

/**
 * Retry configuration for backend communication
 */
const RETRY_CONFIG = {
	maxRetries: 3,
	initialDelayMs: 1000,
	multiplier: 2,
	maxDelayMs: 10000,
} as const;

/**
 * Implements exponential backoff with jitter for retrying failed operations
 * @param attempt - Current attempt number (0-based)
 * @returns Delay in milliseconds
 */
function getRetryDelay(attempt: number): number {
	const baseDelay =
		RETRY_CONFIG.initialDelayMs * RETRY_CONFIG.multiplier ** attempt;

	const cappedDelay = Math.min(baseDelay, RETRY_CONFIG.maxDelayMs);
	// Add jitter: ±25% of the delay
	const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

	return Math.max(100, cappedDelay + jitter);
}

/**
 * Retries an async operation with exponential backoff
 * @param operation - The async operation to retry
 * @param operationName - Name for logging purposes
 * @returns Promise that resolves to the operation result or null if all retries failed
 */
async function retryOperation<T>(
	operation: () => Promise<T>,
	operationName: string,
): Promise<T | null> {
	for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt === RETRY_CONFIG.maxRetries) {
				console.error(
					`${operationName} failed after ${RETRY_CONFIG.maxRetries + 1} attempts:`,
					error,
				);

				return null;
			}

			const delay = getRetryDelay(attempt);

			console.warn(
				`${operationName} failed (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}), retrying in ${delay}ms:`,
				error instanceof Error ? error.message : String(error),
			);

			await setTimeout(delay);
		}
	}

	return null;
}

/**
 * Heartbeat callbacks for various events
 */
export interface HeartbeatCallbacks {
	/** Called when user requests bot to leave */
	onLeaveRequested?: () => void;
	/** Called when log level changes */
	onLogLevelChange?: (logLevel: string) => void;
}

// Start heartbeat loop in the background
export const startHeartbeat = async (
	botId: number,
	abortSignal: AbortSignal,
	intervalMs: number = 10000,
	callbacks?: HeartbeatCallbacks,
) => {
	let lastLogLevel: string | null = null;

	while (!abortSignal.aborted) {
		const result = await retryOperation(async () => {
			return await trpc.bots.heartbeat.mutate({ id: String(botId) });
		}, "Heartbeat");

		if (result !== null) {
			console.log(`[${new Date().toISOString()}] Heartbeat sent`);

			// Check if user requested bot to leave (LEAVING status in backend)
			if (result.shouldLeave) {
				console.log(
					`[${new Date().toISOString()}] Received leave request from backend, signaling bot to leave`,
				);

				if (callbacks?.onLeaveRequested) {
					callbacks.onLeaveRequested();
				}

				// Stop heartbeat loop - bot is leaving
				return;
			}

			// Check if log level changed
			if (result.logLevel && result.logLevel !== lastLogLevel) {
				console.log(
					`[${new Date().toISOString()}] Log level changed: ${lastLogLevel} -> ${result.logLevel}`,
				);

				lastLogLevel = result.logLevel;

				if (callbacks?.onLogLevelChange) {
					callbacks.onLogLevelChange(result.logLevel);
				}
			}
		} else {
			// Do not log the entire heartbeat error if the user has set HEARTBEAT_DEBUG to false
			if (env.HEARTBEAT_DEBUG) {
				console.error(
					`[${new Date().toISOString()}] Heartbeat failed after all retries, continuing bot operation`,
				);
			}
		}

		await setTimeout(intervalMs);
	}
};

/**
 * Reports events with safer error handling that won't crash the bot
 * Critical events (FATAL, DONE) will attempt to report but won't fail if backend is unavailable
 */
export const reportEvent = async (
	botId: number,
	eventType: EventCode,
	eventData: {
		message?: string;
		description?: string;
		sub_code?: string;
		recording?: string;
		speakerTimeframes?: {
			speakerName: string;
			start: number;
			end: number;
		}[];
	} | null = null,
) => {
	// do not report events in development
	console.log("Reporting event:", {
		botId,
		eventType,
		eventData,
	});

	// Report event with retry logic
	const reportResult = await retryOperation(async () => {
		await trpc.bots.reportEvent.mutate({
			id: String(botId),
			event: {
				eventType,
				eventTime: new Date(),
				data: eventData
					? {
							description: eventData.message || eventData.description,
							sub_code: eventData.sub_code,
						}
					: null,
			},
		});

		return true; // Return success indicator
	}, `Report event (${eventType})`);

	// Update bot status if this event type is a valid status
	if (eventType in Status) {
		const statusUpdateResult = await retryOperation(async () => {
			// If the event is DONE, we need to include the recording parameter
			if (eventType === EventCode.DONE && eventData?.recording) {
				await trpc.bots.updateBotStatus.mutate({
					id: String(botId),
					status: eventType as unknown as Status,
					recording: eventData.recording,
					speakerTimeframes: eventData.speakerTimeframes,
				});
			} else {
				await trpc.bots.updateBotStatus.mutate({
					id: String(botId),
					status: eventType as unknown as Status,
				});
			}

			return true; // Return success indicator
		}, `Update bot status (${eventType})`);

		if (statusUpdateResult) {
			console.log(
				`[${new Date().toISOString()}] Bot status updated: ${eventType}`,
			);
		}
	}

	if (reportResult) {
		console.log(`[${new Date().toISOString()}] Event reported: ${eventType}`);
	} else {
		console.warn(
			`[${new Date().toISOString()}] Event reporting failed after all retries: ${eventType} - Bot will continue operation`,
		);
	}
};

/**
 * Monitors bot duration and terminates if it exceeds the maximum allowed time
 * @param botId - ID of the bot to monitor
 * @param startTime - When the bot started
 * @param abortSignal - Signal to stop monitoring
 */
export const startDurationMonitor = async (
	botId: number,
	startTime: Date,
	abortSignal: AbortSignal,
) => {
	// Check duration every minute
	const checkInterval = 60000; // 1 minute

	while (!abortSignal.aborted) {
		const elapsedTime = Date.now() - startTime.getTime();

		if (elapsedTime >= MAX_BOT_DURATION_MS) {
			console.error(
				`[${new Date().toISOString()}] Bot ${botId} exceeded maximum duration of 1 hour, terminating...`,
			);

			// Report FATAL event and exit
			await safeReportEvent(botId, EventCode.FATAL, {
				message: "Bot terminated: Exceeded maximum duration of 1 hour",
				description:
					"Bot automatically terminated due to 1-hour duration limit",
				sub_code: "DURATION_LIMIT_EXCEEDED",
			});

			// Exit the process to terminate the bot
			process.exit(1);
		}

		const remainingTime = MAX_BOT_DURATION_MS - elapsedTime;
		const remainingMinutes = Math.floor(remainingTime / 1000 / 60);

		// Log warning when 15 minutes remaining
		if (remainingMinutes === 15) {
			console.warn(
				`[${new Date().toISOString()}] Bot ${botId} has 15 minutes remaining before automatic termination`,
			);
		}

		// Log warning when 5 minutes remaining
		if (remainingMinutes === 5) {
			console.warn(
				`[${new Date().toISOString()}] Bot ${botId} has 5 minutes remaining before automatic termination`,
			);
		}

		await setTimeout(checkInterval);
	}
};

/**
 * Safe version of reportEvent that will never throw errors
 * Used for critical error reporting to prevent cascading failures
 */
export const safeReportEvent = async (
	botId: number,
	eventType: EventCode,
	eventData?: {
		message?: string;
		description?: string;
		sub_code?: string;
		recording?: string;
		speakerTimeframes?: {
			speakerName: string;
			start: number;
			end: number;
		}[];
	},
): Promise<void> => {
	try {
		await reportEvent(botId, eventType, eventData ?? null);
	} catch (error) {
		// Swallow all errors to prevent bot crashes
		console.warn(
			`[${new Date().toISOString()}] Safe report event failed for ${eventType}, but bot will continue:`,
			error instanceof Error ? error.message : String(error),
		);
	}
};
