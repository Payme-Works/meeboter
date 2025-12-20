/**
 * Error thrown when an operation times out
 */
class TimeoutError extends Error {
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
