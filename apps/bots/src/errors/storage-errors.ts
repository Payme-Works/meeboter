/**
 * Base error class for storage-related errors.
 * All storage errors should extend this class.
 */
class StorageError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "StorageError";
	}
}

/**
 * Error thrown when recording upload fails.
 */
export class RecordingUploadError extends StorageError {
	constructor(filePath: string, cause?: Error) {
		super(
			`Failed to upload recording: ${filePath}`,
			"RECORDING_UPLOAD_FAILED",
			{ filePath },
		);

		this.name = "RecordingUploadError";
		this.cause = cause;
	}
}

/**
 * Error thrown when bucket is not configured.
 */
export class BucketNotConfiguredError extends StorageError {
	constructor() {
		super("Bucket name not configured", "BUCKET_NOT_CONFIGURED");
		this.name = "BucketNotConfiguredError";
	}
}

/**
 * Error thrown when file is not found.
 */
export class FileNotFoundError extends StorageError {
	constructor(filePath: string) {
		super(`File not found: ${filePath}`, "FILE_NOT_FOUND", { filePath });
		this.name = "FileNotFoundError";
	}
}
