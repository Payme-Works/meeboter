import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";

import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";

import { env } from "../env";
import type { ScreenshotData } from "./index";

/**
 * Uploads a screenshot to S3 and returns the full URL
 */
export async function uploadScreenshotToS3(
	s3Client: S3Client,
	localPath: string,
	botId: number,
	type: ScreenshotData["type"],
	state: string,
	trigger?: string,
): Promise<ScreenshotData | null> {
	try {
		const fileContent = readFileSync(localPath);
		const uuid = randomUUID();
		const timestamp = Date.now();
		const key = `screenshots/bot-${botId}/${uuid}-${type}-${timestamp}.png`;

		const bucketName = env.S3_BUCKET_NAME;

		if (!bucketName) {
			console.error("Cannot upload screenshot: S3_BUCKET_NAME not configured");

			return null;
		}

		const putCommand = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			Body: fileContent,
			ContentType: "image/png",
		});

		await s3Client.send(putCommand);

		// Build the URL based on whether we're using a custom endpoint (MinIO) or AWS S3
		let url: string;

		if (env.S3_ENDPOINT) {
			// MinIO or custom S3-compatible storage
			url = `${env.S3_ENDPOINT}/${bucketName}/${key}`;
		} else {
			// AWS S3
			url = `https://${bucketName}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
		}

		console.log(`Screenshot uploaded to S3: ${key}`);

		// Clean up local file
		try {
			unlinkSync(localPath);
		} catch {
			// Ignore cleanup errors
		}

		return {
			url,
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

/**
 * Creates screenshot metadata without uploading (for local storage only)
 */
export function createScreenshotMetadata(
	localPath: string,
	type: ScreenshotData["type"],
	state: string,
	trigger?: string,
): ScreenshotData {
	return {
		url: localPath,
		capturedAt: new Date(),
		type,
		state,
		trigger,
	};
}
