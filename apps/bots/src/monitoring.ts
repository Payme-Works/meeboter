import { setTimeout } from "node:timers/promises";
import dotenv from "dotenv";
import { trpc } from "./trpc";
import { EventCode, Status } from "./types";

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

// Load the .env.test file (overrides variables from .env if they overlap)
dotenv.config({ path: ".env.test" });

// Start heartbeat loop in the background
export const startHeartbeat = async (
	botId: number,
	abortSignal: AbortSignal,
	intervalMs: number = 10000,
) => {
	while (!abortSignal.aborted) {
		const result = await retryOperation(async () => {
			return await trpc.bots.heartbeat.mutate({ id: String(botId) });
		}, "Heartbeat");

		if (result !== null) {
			console.log(`[${new Date().toISOString()}] Heartbeat sent`);
		} else {
			// Do not log the entire heartbeat error if, in local, the user has set HEARTBEAT_DEBUG to false.
			if ((process.env?.HEARTBEAT_DEBUG ?? "true") !== "false") {
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
	if (process.env.NODE_ENV === "development") {
		return;
	}

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
