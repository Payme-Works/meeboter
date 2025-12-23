import type { ScreenshotData } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadScreenshotInput {
	botId: number;
	data: Buffer;
	type: ScreenshotData["type"];
	state: string;
	trigger?: string;
}

interface UploadScreenshotConfig {
	miloUrl: string;
	authToken: string;
}

// ─── Use Case ─────────────────────────────────────────────────────────────────

/**
 * Use case for uploading screenshots to Milo for compression and S3 storage.
 *
 * The bot sends raw PNG screenshots to Milo, which compresses them to WebP
 * and uploads to S3. This centralizes compression logic in the server.
 *
 * @example
 * ```typescript
 * const uploadScreenshot = new UploadScreenshotUseCase({
 *   miloUrl: "http://localhost:3000",
 *   authToken: "secret",
 * });
 *
 * const screenshot = await uploadScreenshot.execute({
 *   botId: 123,
 *   data: pngBuffer,
 *   type: "error",
 *   state: "IN_CALL",
 *   trigger: "Connection lost",
 * });
 * ```
 */
export class UploadScreenshotUseCase {
	constructor(private readonly config: UploadScreenshotConfig) {}

	/**
	 * Uploads a screenshot to Milo for compression and S3 storage.
	 *
	 * @param input - Screenshot data and metadata
	 * @returns Screenshot metadata including the S3 key
	 * @throws Error if upload fails
	 */
	async execute(input: UploadScreenshotInput): Promise<ScreenshotData> {
		const formData = new FormData();

		// Append file as Blob (convert Buffer to Uint8Array for type compatibility)
		formData.append(
			"file",
			new Blob([new Uint8Array(input.data)]),
			"screenshot.png",
		);

		formData.append("type", input.type);
		formData.append("state", input.state);

		if (input.trigger) {
			formData.append("trigger", input.trigger);
		}

		const response = await fetch(
			`${this.config.miloUrl}/api/bots/${input.botId}/screenshots`,
			{
				method: "POST",
				headers: {
					"X-Milo-Token": this.config.authToken,
				},
				body: formData,
			},
		);

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");

			throw new Error(
				`Screenshot upload failed: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		const result = (await response.json()) as ScreenshotData;

		// Ensure capturedAt is a Date object
		return {
			...result,
			capturedAt: new Date(result.capturedAt),
		};
	}
}
