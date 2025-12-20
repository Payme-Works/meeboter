import { S3Client } from "bun";

import type { StorageConfig, StorageProvider } from "./storage-service";

/**
 * S3/MinIO storage provider using Bun's built-in S3Client.
 * Supports both AWS S3 and S3-compatible storage (MinIO, Cloudflare R2, etc.)
 */
export class S3StorageProvider implements StorageProvider {
	private readonly client: S3Client;
	private readonly bucketName: string;

	constructor(config: StorageConfig) {
		this.client = new S3Client({
			endpoint: config.endpoint,
			region: config.region,
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			bucket: config.bucketName,
		});

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
	 * Checks if the provider is properly configured
	 */
	isConfigured(): boolean {
		return Boolean(this.bucketName);
	}

	/**
	 * Uploads a file to S3
	 */
	async upload(key: string, data: Buffer, contentType: string): Promise<void> {
		await this.client.write(key, data, {
			type: contentType,
		});
	}
}

/**
 * Creates an S3StorageProvider from environment variables
 */
export function createS3ProviderFromEnv(env: {
	S3_ENDPOINT?: string;
	S3_REGION?: string;
	S3_ACCESS_KEY?: string;
	S3_SECRET_KEY?: string;
	S3_BUCKET_NAME?: string;
}): S3StorageProvider {
	return new S3StorageProvider({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
		bucketName: env.S3_BUCKET_NAME,
	});
}
