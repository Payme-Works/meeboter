import sharp from "sharp";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompressImageOptions {
	/** Output quality (1-100). Default: 80 */
	quality?: number;
	/** Output format. Default: webp */
	format?: "webp" | "jpeg" | "png";
}

interface CompressImageResult {
	/** Compressed image buffer */
	data: Buffer;
	/** Original size in bytes */
	originalSize: number;
	/** Compressed size in bytes */
	compressedSize: number;
	/** Output format used */
	format: string;
	/** Compression ratio (e.g., 0.3 means 70% reduction) */
	ratio: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_QUALITY = 80;
const DEFAULT_FORMAT = "webp" as const;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Compresses an image buffer using Sharp.
 * Converts to WebP format by default for optimal compression.
 *
 * @param input - Raw image buffer (PNG, JPEG, etc.)
 * @param options - Compression options
 * @returns Compressed image with size metrics
 *
 * @example
 * ```typescript
 * const result = await compressImage(pngBuffer);
 * console.log(`Reduced by ${(1 - result.ratio) * 100}%`);
 * // Reduced by 75%
 * ```
 */
export async function compressImage(
	input: Buffer,
	options: CompressImageOptions = {},
): Promise<CompressImageResult> {
	const { quality = DEFAULT_QUALITY, format = DEFAULT_FORMAT } = options;
	const originalSize = input.length;

	let sharpInstance = sharp(input);

	switch (format) {
		case "webp":
			sharpInstance = sharpInstance.webp({ quality });

			break;
		case "jpeg":
			sharpInstance = sharpInstance.jpeg({ quality });

			break;
		case "png":
			sharpInstance = sharpInstance.png({ compressionLevel: 9 });

			break;
	}

	const compressed = await sharpInstance.toBuffer();
	const compressedSize = compressed.length;

	return {
		data: compressed,
		originalSize,
		compressedSize,
		format,
		ratio: compressedSize / originalSize,
	};
}

/**
 * Gets the MIME type for a given format.
 */
export function getMimeType(format: "webp" | "jpeg" | "png"): string {
	const mimeTypes: Record<string, string> = {
		webp: "image/webp",
		jpeg: "image/jpeg",
		png: "image/png",
	};

	return mimeTypes[format] ?? "image/webp";
}

/**
 * Gets the file extension for a given format.
 */
export function getFileExtension(format: "webp" | "jpeg" | "png"): string {
	return format === "jpeg" ? "jpg" : format;
}
