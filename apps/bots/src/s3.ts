import { randomUUID } from "node:crypto";
import { promises as fsPromises, readFileSync } from "node:fs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Bot } from "./bot";
import { env } from "./env";

/**
 * Configuration for S3/MinIO client
 */
interface S3Config {
	endpoint?: string;
	region: string;
	accessKeyId?: string;
	secretAccessKey?: string;
}

/**
 * Creates an S3/MinIO Connection.
 * Supports both AWS S3 and MinIO (S3-compatible) storage.
 *
 * @param config - S3/MinIO configuration
 * @returns S3Client or null if configuration is invalid
 */
export function createS3Client(config: S3Config): S3Client | null {
	try {
		if (!config.region) throw new Error("Region is required");

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

		return new S3Client(clientConfig);
	} catch (_error) {
		return null;
	}
}

/**
 * Creates an S3/MinIO client from environment variables.
 * Uses S3_ prefixed variables for storage configuration.
 *
 * @returns S3Client or null if configuration is invalid
 */
export function createS3ClientFromEnv(): S3Client | null {
	return createS3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
	});
}

/**
 * Gets the bucket name from environment variables.
 *
 * @returns The bucket name
 */
export function getBucketName(): string {
	return env.S3_BUCKET_NAME ?? "";
}

/**
 * Uploads a recording to S3/MinIO storage.
 *
 * @param s3Client - The S3 client instance
 * @param bot - The bot instance with recording data
 * @returns The storage key of the uploaded recording
 */
export async function uploadRecordingToS3(
	s3Client: S3Client,
	bot: Bot,
): Promise<string> {
	// Attempt to read the file path. Allow for time for the file to become available.
	const filePath = bot.getRecordingPath();
	let fileContent: Buffer;
	let i = 10;

	while (true) {
		try {
			fileContent = readFileSync(filePath);
			console.log("Successfully read recording file");

			break; // Exit loop if readFileSync is successful
		} catch (error) {
			const err = error as NodeJS.ErrnoException;

			// Could not read file.

			// Busy File
			if (err.code === "EBUSY") {
				console.log("File is busy, retrying...");
				await new Promise((r) => setTimeout(r, 1000)); // Wait for 1 second before retrying

				// File DNE
			} else if (err.code === "ENOENT") {
				// Throw an Error
				if (i < 0) throw new Error("File not found after multiple retries");

				console.log("File not found, retrying ", i--, " more times");
				await new Promise((r) => setTimeout(r, 1000)); // Wait for 1 second before retrying

				// Other Error
			} else {
				throw error; // Rethrow if it's a different error
			}
		}
	}

	// Create UUID and initialize key
	const uuid = randomUUID();
	const contentType = bot.getContentType();

	const key = `recordings/${uuid}-${
		bot.settings.meetingInfo.platform
	}-recording.${contentType.split("/")[1]}`;

	try {
		const bucketName = getBucketName();

		if (!bucketName) {
			throw new Error("Bucket name not configured");
		}

		const commandObjects = {
			Bucket: bucketName,
			Key: key,
			Body: fileContent,
			ContentType: contentType,
		};

		const putCommand = new PutObjectCommand(commandObjects);
		await s3Client.send(putCommand);
		console.log(`Successfully uploaded recording to S3/MinIO: ${key}`);

		// Clean up local file
		await fsPromises.unlink(filePath);

		// Return the Upload Key
		return key;
	} catch (error) {
		console.error("Error uploading to S3/MinIO:", error);
	}

	// No Upload
	return "";
}
