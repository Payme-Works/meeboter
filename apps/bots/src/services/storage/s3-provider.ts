import { S3Client } from "bun";

import { StorageService } from "./storage-service";

/**
 * Configuration for S3/S3-compatible storage.
 * All fields are required for a valid configuration.
 */
interface S3Config {
	endpoint: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucketName: string;
}

/**
 * S3/MinIO storage provider using Bun's built-in S3Client.
 * Supports both AWS S3 and S3-compatible storage (MinIO, Cloudflare R2, etc.)
 */
export class S3StorageProvider extends StorageService {
	private readonly client: S3Client;

	constructor(config: S3Config) {
		super();

		this.client = new S3Client({
			endpoint: config.endpoint,
			region: config.region,
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			bucket: config.bucketName,
		});
	}

	/**
	 * Uploads a file to S3
	 * @returns The storage key
	 */
	async upload(
		key: string,
		data: Buffer,
		contentType: string,
	): Promise<string> {
		await this.client.write(key, data, {
			type: contentType,
		});

		return key;
	}
}
