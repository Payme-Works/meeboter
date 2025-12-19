import { randomUUID } from "node:crypto";
import { promises as fsPromises, readFileSync, unlinkSync } from "node:fs";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
	BucketNotConfiguredError,
	FileNotFoundError,
	RecordingUploadError,
} from "../errors/storage-errors";
import type { ScreenshotData } from "../logger";

/**
 * Configuration for S3/MinIO client
 */
export interface S3ServiceConfig {
	endpoint?: string;
	region: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	bucketName?: string;
}

/**
 * Service for handling S3/MinIO storage operations.
 * Supports both AWS S3 and MinIO (S3-compatible) storage.
 */
export class S3Service {
	private readonly client: S3Client;
	private readonly bucketName: string;

	constructor(config: S3ServiceConfig) {
		const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
			region: config.region,
		};

		// Add endpoint for MinIO (S3-compatible storage)
		if (config.endpoint) {
			clientConfig.endpoint = config.endpoint;
			clientConfig.forcePathStyle = true; // Required for MinIO
		}

		// Add credentials if provided (required for MinIO, optional for AWS with IAM roles)
		if (config.accessKeyId && config.secretAccessKey) {
			clientConfig.credentials = {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			};
		}

		this.client = new S3Client(clientConfig);
		this.bucketName = config.bucketName ?? "";
	}

	/**
	 * Gets the raw S3 client for direct access if needed
	 */
	getClient(): S3Client {
		return this.client;
	}

	/**
	 * Gets the configured bucket name
	 */
	getBucketName(): string {
		return this.bucketName;
	}

	/**
	 * Uploads a recording to S3/MinIO storage.
	 */
	async uploadRecording(
		filePath: string,
		platform: string,
		contentType: string,
	): Promise<string> {
		if (!this.bucketName) {
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
		const uuid = randomUUID();
		const extension = contentType.split("/")[1];
		const key = `recordings/${uuid}-${platform}-recording.${extension}`;

		try {
			const putCommand = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: fileContent,
				ContentType: contentType,
			});

			await this.client.send(putCommand);
			console.log(`Successfully uploaded recording to S3/MinIO: ${key}`);

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
	 * Uploads a screenshot to S3 and returns metadata
	 */
	async uploadScreenshot(
		localPath: string,
		botId: number,
		type: ScreenshotData["type"],
		state: string,
		trigger?: string,
	): Promise<ScreenshotData | null> {
		if (!this.bucketName) {
			console.error("Cannot upload screenshot: bucket not configured");

			return null;
		}

		try {
			const fileContent = readFileSync(localPath);
			const uuid = randomUUID();
			const timestamp = Date.now();
			const key = `screenshots/bot-${botId}/${uuid}-${type}-${timestamp}.png`;

			const putCommand = new PutObjectCommand({
				Bucket: this.bucketName,
				Key: key,
				Body: fileContent,
				ContentType: "image/png",
			});

			await this.client.send(putCommand);
			console.log(`Screenshot uploaded to S3: ${key}`);

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
				"Error uploading screenshot to S3:",
				error instanceof Error ? error.message : String(error),
			);

			return null;
		}
	}
}

/**
 * Creates an S3Service from environment variables
 */
export function createS3ServiceFromEnv(env: {
	S3_ENDPOINT?: string;
	S3_REGION: string;
	S3_ACCESS_KEY?: string;
	S3_SECRET_KEY?: string;
	S3_BUCKET_NAME?: string;
}): S3Service {
	return new S3Service({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
		bucketName: env.S3_BUCKET_NAME,
	});
}
