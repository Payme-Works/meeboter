import type { StorageService } from "../services/storage/storage-service";

interface UploadRecordingInput {
	botId: number;
	data: Buffer;
	platform: string;
	contentType: string;
}

/**
 * Use case for uploading bot recordings to storage.
 * Handles path generation and delegates upload to the storage service.
 */
export class UploadRecordingUseCase {
	constructor(private readonly storage: StorageService) {}

	async execute(input: UploadRecordingInput): Promise<string> {
		const uuid = crypto.randomUUID();
		const extension = input.contentType.split("/")[1];
		const key = `bots/${input.botId}/recordings/${uuid}-${input.platform}.${extension}`;

		return this.storage.upload(key, input.data, input.contentType);
	}
}
