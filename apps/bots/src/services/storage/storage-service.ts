/**
 * Abstract storage service for file upload operations.
 * Implementations can use different backends (S3, GCS, local filesystem, etc.)
 */
export abstract class StorageService {
	/**
	 * Uploads a file to storage
	 * @param key - The storage key/path for the file
	 * @param data - The file content as a Buffer
	 * @param contentType - The MIME type of the file
	 * @returns The storage key
	 */
	abstract upload(
		key: string,
		data: Buffer,
		contentType: string,
	): Promise<string>;
}
