import { StorageError } from "./storage-error";

/**
 * Error thrown when bucket is not configured.
 */
export class BucketNotConfiguredError extends StorageError {
	constructor() {
		super("Bucket name not configured", "BUCKET_NOT_CONFIGURED");
		this.name = "BucketNotConfiguredError";
	}
}
