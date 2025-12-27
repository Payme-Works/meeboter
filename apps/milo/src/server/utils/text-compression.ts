// ─── Types ────────────────────────────────────────────────────────────────────

interface CompressTextResult {
	/** Compressed data buffer */
	data: Uint8Array;
	/** Original size in bytes */
	originalSize: number;
	/** Compressed size in bytes */
	compressedSize: number;
	/** Compression ratio (e.g., 0.2 means 80% reduction) */
	ratio: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default compression level (1-9, where 6 is default balance of speed/size) */
const DEFAULT_COMPRESSION_LEVEL = 6;

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Compresses text content using gzip via Bun's native implementation.
 * Ideal for JSONL log files - typically achieves 70-90% compression.
 *
 * Uses Bun.gzipSync which is significantly faster than Node.js zlib.
 *
 * @param input - Text string or Buffer to compress
 * @returns Compressed buffer with size metrics
 *
 * @example
 * ```typescript
 * const result = compressText(jsonlContent);
 * console.log(`Reduced by ${((1 - result.ratio) * 100).toFixed(0)}%`);
 * // Reduced by 85%
 * ```
 */
export function compressText(input: string | Buffer): CompressTextResult {
	// Convert input to ArrayBuffer for Bun.gzipSync
	const encoder = new TextEncoder();

	const inputArray =
		typeof input === "string"
			? encoder.encode(input)
			: new Uint8Array(
					input.buffer.slice(
						input.byteOffset,
						input.byteOffset + input.byteLength,
					),
				);

	const originalSize = inputArray.length;

	const compressed = Bun.gzipSync(inputArray.buffer as ArrayBuffer, {
		level: DEFAULT_COMPRESSION_LEVEL,
	});

	return {
		data: compressed,
		originalSize,
		compressedSize: compressed.length,
		ratio: compressed.length / originalSize,
	};
}

/**
 * Decompresses gzipped content back to string.
 * Uses Bun.gunzipSync which is significantly faster than Node.js zlib.
 *
 * @param input - Gzipped buffer or Uint8Array
 * @returns Decompressed UTF-8 string
 */
export function decompressText(input: Buffer | Uint8Array): string {
	// Convert to ArrayBuffer for Bun.gunzipSync
	const inputBuffer = ArrayBuffer.isView(input)
		? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
		: input;

	const decompressed = Bun.gunzipSync(inputBuffer as ArrayBuffer);

	return new TextDecoder().decode(decompressed);
}
