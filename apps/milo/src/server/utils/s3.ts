import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

/**
 * Singleton S3Client instance for S3-compatible storage operations
 * Works with both MinIO (self-hosted) and AWS S3
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Gets or creates a singleton S3Client instance configured for S3-compatible storage
 * @returns The configured S3Client instance for storage operations
 */
function getS3Client(): S3Client {
	s3ClientInstance ??= new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY,
		},
		forcePathStyle: true, // Required for MinIO, uses path-style URLs instead of virtual-hosted
	});

	return s3ClientInstance;
}

/**
 * Configured S3 client instance for storage operations
 */
const s3Client = getS3Client();

/**
 * Generates a pre-signed URL for accessing an object in S3-compatible storage
 * @param key - The object key to generate a signed URL for
 * @param expiresIn - The expiration time in seconds for the signed URL (default: 3600)
 * @returns Promise that resolves to the pre-signed URL string
 */
export async function generateSignedUrl(
	key: string,
	expiresIn = 3600,
): Promise<string> {
	const command = new GetObjectCommand({
		Bucket: env.S3_BUCKET_NAME,
		Key: key,
	});

	return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Gets the S3 client instance for direct operations
 * @returns The S3Client instance
 */
export function getS3ClientInstance(): S3Client {
	return getS3Client();
}

/**
 * Gets the bucket name from environment
 * @returns The S3 bucket name
 */
export function getBucketName(): string {
	return env.S3_BUCKET_NAME;
}
