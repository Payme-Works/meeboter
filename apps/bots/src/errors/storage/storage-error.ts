/**
 * Base error class for storage-related errors.
 * All storage errors should extend this class.
 */
export class StorageError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "StorageError";
	}
}
