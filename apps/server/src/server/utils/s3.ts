import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

/**
 * Singleton S3Client instance for AWS operations
 */
let s3ClientInstance: S3Client | null = null;

/**
 * AWS credentials configuration for S3 client
 * Credentials are only set if both access key ID and secret access key are provided
 */
const credentials =
	env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
		? {
				accessKeyId: env.AWS_ACCESS_KEY_ID,
				secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			}
		: undefined;

/**
 * Gets or creates a singleton S3Client instance
 * @returns The configured S3Client instance for AWS operations
 */
const getS3Client = (): S3Client => {
	s3ClientInstance ??= new S3Client({
		region: env.AWS_REGION,
		credentials: credentials,
	});

	return s3ClientInstance;
};

/**
 * Configured S3 client instance for AWS operations
 */
const s3Client = getS3Client();

/**
 * Generates a pre-signed URL for accessing an S3 object
 * @param key - The S3 object key to generate a signed URL for
 * @param expiresIn - The expiration time in seconds for the signed URL (default: 3600)
 * @returns Promise that resolves to the pre-signed URL string
 */
export const generateSignedUrl = async (
	key: string,
	expiresIn = 3600,
): Promise<string> => {
	const command = new GetObjectCommand({
		Bucket: env.AWS_BUCKET_NAME,
		Key: key,
	});

	return await getSignedUrl(s3Client, command, { expiresIn });
};
