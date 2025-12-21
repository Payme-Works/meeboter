import type { ScreenshotData } from "../../logger";

/**
 * Configuration for storage providers
 */
export interface StorageConfig {
	endpoint?: string;
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	bucketName?: string;
}

/**
 * Storage provider interface for file upload operations.
 * Implementations can use different backends (S3, GCS, local filesystem, etc.)
 */
export interface StorageProvider {
	/**
	 * Uploads a file to storage
	 */
	upload(key: string, data: Buffer, contentType: string): Promise<void>;

	/**
	 * Checks if storage is properly configured
	 */
	isConfigured(): boolean;
}

/**
 * Service for handling storage operations.
 * Uses a storage provider for the actual upload operations.
 */
export class StorageService {
	constructor(private readonly provider: StorageProvider) {}

	/**
	 * Uploads a recording to storage with retry logic.
	 */
	async uploadRecording(
		filePath: string,
		botId: number,
		platform: string,
		contentType: string,
	): Promise<string> {
		const { readFileSync } = await import("node:fs");
		const { promises: fsPromises } = await import("node:fs");

		const {
			BucketNotConfiguredError,
			FileNotFoundError,
			RecordingUploadError,
		} = await import("../../errors/storage");

		if (!this.provider.isConfigured()) {
			throw new BucketNotConfiguredError();
		}

		// Attempt to read the file path. Allow for time for the file to become available.
		let fileContent: Buffer;
		let retries = 10;

		while (true) {
			try {
				fileContent = readFileSync(filePath);
				console.log("Successfully read recording file");

				break;
			} catch (error) {
				const err = error as NodeJS.ErrnoException;

				if (err.code === "EBUSY") {
					console.log("File is busy, retrying...");
					await new Promise((r) => setTimeout(r, 1000));
				} else if (err.code === "ENOENT") {
					if (retries < 0) {
						throw new FileNotFoundError(filePath);
					}

					console.log("File not found, retrying", retries--, "more times");
					await new Promise((r) => setTimeout(r, 1000));
				} else {
					throw new RecordingUploadError(filePath, err as Error);
				}
			}
		}

		// Create UUID and initialize key
		const uuid = crypto.randomUUID();
		const extension = contentType.split("/")[1];
		const key = `bots/${botId}/recordings/${uuid}-${platform}.${extension}`;

		try {
			await this.provider.upload(key, fileContent, contentType);
			console.log(`Successfully uploaded recording: ${key}`);

			// Clean up local file
			await fsPromises.unlink(filePath);

			return key;
		} catch (error) {
			throw new RecordingUploadError(
				filePath,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Uploads a screenshot to storage and returns metadata
	 */
	async uploadScreenshot(
		localPath: string,
		botId: number,
		type: ScreenshotData["type"],
		state: string,
		trigger?: string,
	): Promise<ScreenshotData | null> {
		const { readFileSync, unlinkSync } = await import("node:fs");

		if (!this.provider.isConfigured()) {
			console.error("Cannot upload screenshot: storage not configured");

			return null;
		}

		try {
			const fileContent = readFileSync(localPath);
			const uuid = crypto.randomUUID();
			const timestamp = Date.now();
			const key = `bots/${botId}/screenshots/${uuid}-${type}-${timestamp}.png`;

			await this.provider.upload(key, fileContent, "image/png");
			console.log(`Screenshot uploaded: ${key}`);

			// Clean up local file
			try {
				unlinkSync(localPath);
			} catch {
				// Ignore cleanup errors
			}

			return {
				key,
				capturedAt: new Date(),
				type,
				state,
				trigger,
			};
		} catch (error) {
			console.error(
				"Error uploading screenshot:",
				error instanceof Error ? error.message : String(error),
			);

			return null;
		}
	}
}
