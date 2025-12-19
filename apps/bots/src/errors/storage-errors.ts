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

/**
 * Error thrown when screenshot upload fails.
 */
export class ScreenshotUploadError extends StorageError {
	constructor(key: string, cause?: Error) {
		super(`Failed to upload screenshot: ${key}`, "SCREENSHOT_UPLOAD_FAILED", {
			key,
		});

		this.name = "ScreenshotUploadError";
		this.cause = cause;
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
 * Error thrown when S3 client creation fails.
 */
export class S3ClientError extends StorageError {
	constructor(message: string, cause?: Error) {
		super(message, "S3_CLIENT_ERROR");
		this.name = "S3ClientError";
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
