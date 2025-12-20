import { StorageError } from "./storage-error";

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
