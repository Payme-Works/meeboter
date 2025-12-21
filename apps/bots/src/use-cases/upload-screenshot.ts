import type { ScreenshotData } from "../logger";
import type { StorageService } from "../services/storage/storage-service";

interface UploadScreenshotInput {
	botId: number;
	data: Buffer;
	type: ScreenshotData["type"];
	state: string;
	trigger?: string;
}

/**
 * Use case for uploading bot screenshots to storage.
 * Handles path generation and returns screenshot metadata.
 */
export class UploadScreenshotUseCase {
	constructor(private readonly storage: StorageService) {}

	async execute(input: UploadScreenshotInput): Promise<ScreenshotData> {
		const uuid = crypto.randomUUID();
		const timestamp = Date.now();
		const key = `bots/${input.botId}/screenshots/${uuid}-${input.type}-${timestamp}.png`;

		await this.storage.upload(key, input.data, "image/png");

		return {
			key,
			capturedAt: new Date(),
			type: input.type,
			state: input.state,
			trigger: input.trigger,
		};
	}
}
