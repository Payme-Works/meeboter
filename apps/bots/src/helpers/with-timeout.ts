/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
	constructor(
		message: string,
		public readonly timeoutMs: number,
	) {
		super(message);
		this.name = "TimeoutError";
	}
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, it rejects with a TimeoutError.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The result of the promise if it resolves in time
 * @throws TimeoutError if the operation times out
 */
export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	operationName: string = "Operation",
): Promise<T> {
	let timeoutId: NodeJS.Timeout | undefined;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(
				new TimeoutError(
					`${operationName} timed out after ${timeoutMs}ms`,
					timeoutMs,
				),
			);
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);

		return result;
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Wraps a promise with a timeout, but returns a default value instead of
 * throwing if the operation times out.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param defaultValue - Value to return if operation times out
 * @param operationName - Name of the operation for logging
 * @returns The result of the promise, or defaultValue if it times out
 */
export async function withTimeoutOrDefault<T>(
	promise: Promise<T>,
	timeoutMs: number,
	defaultValue: T,
	operationName: string = "Operation",
): Promise<{ result: T; timedOut: boolean }> {
	try {
		const result = await withTimeout(promise, timeoutMs, operationName);

		return { result, timedOut: false };
	} catch (error) {
		if (error instanceof TimeoutError) {
			return { result: defaultValue, timedOut: true };
		}

		throw error;
	}
}
