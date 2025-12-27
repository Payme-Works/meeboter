# Log File Compression Design

**Date**: 2025-12-27
**Status**: Approved

## Summary

Add gzip compression to log file archival in LogArchivalService, following the same pattern as screenshot compression. Logs will be compressed before uploading to S3, reducing storage costs by 70-90%.

## Problem

Currently, LogArchivalService uploads JSONL log files to S3 uncompressed:
- Large file sizes (JSONL is verbose text format)
- Higher S3 storage costs over time
- Inefficient use of storage for highly compressible text data

## Solution

Add gzip compression at archival time using Node.js built-in `zlib` module.

### Architecture

```
┌─────────────┐     tRPC (logs)      ┌──────────────────────────────────────┐
│    Bot      │ ──────────────────▶  │              Milo                    │
│  (generates │                      │  ┌────────────────────────────────┐  │
│   logs)     │                      │  │     LogBufferService           │  │
└─────────────┘                      │  │  (1000 entries per bot)        │  │
                                     │  └───────────────┬────────────────┘  │
                                     │                  │ every 30s         │
                                     │                  ▼                   │
                                     │  ┌────────────────────────────────┐  │
                                     │  │    LogArchivalService          │  │
                                     │  │  • Convert to JSONL            │  │
                                     │  │  • Compress with gzip          │  │
                                     │  │  • Upload to S3                │  │
                                     │  └───────────────┬────────────────┘  │
                                     └──────────────────┼───────────────────┘
                                                        ▼
                                     ┌──────────────────────────────────────┐
                                     │              S3                      │
                                     │  bots/{id}/logs/{date}/{ts}.jsonl.gz │
                                     │  • Content-Encoding: gzip            │
                                     │  • ~70-90% smaller files             │
                                     └──────────────────────────────────────┘
```

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compression library | Bun `gzipSync`/`gunzipSync` | Native implementation, faster than Node.js zlib |
| Compression level | 6 (default) | Good balance of speed vs size |
| File extension | `.jsonl.gz` | Clear indication of format |
| Backward compatibility | Yes | Detect by extension, read old `.jsonl` files |

## Implementation

### 1. Text Compression Utility

**File**: `apps/milo/src/server/utils/text-compression.ts`

```typescript
interface CompressTextResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number;
}

// Uses Bun's native gzip - significantly faster than Node.js zlib
export function compressText(input: string | Buffer): CompressTextResult {
  const encoder = new TextEncoder();
  const inputArray = typeof input === "string"
    ? encoder.encode(input)
    : new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));

  const originalSize = inputArray.length;
  const compressed = Bun.gzipSync(inputArray.buffer as ArrayBuffer, { level: 6 });

  return {
    data: compressed,
    originalSize,
    compressedSize: compressed.length,
    ratio: compressed.length / originalSize,
  };
}

export function decompressText(input: Buffer | Uint8Array): string {
  const inputBuffer = ArrayBuffer.isView(input)
    ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    : input;

  const decompressed = Bun.gunzipSync(inputBuffer as ArrayBuffer);
  return new TextDecoder().decode(decompressed);
}
```

### 2. LogArchivalService Changes

**File**: `apps/milo/src/server/api/services/log-archival-service.ts`

#### archiveEntries method:

```typescript
import { compressText } from "@/server/utils/text-compression";

private async archiveEntries(
  botId: number,
  entries: LogEntry[],
  isFinal: boolean,
): Promise<void> {
  // Change key extension: .jsonl → .jsonl.gz
  const key = `bots/${botId}/logs/${dateStr}/${timestamp}${suffix}.jsonl.gz`;

  // Convert to JSONL
  const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");

  // Compress before upload
  const compressed = await compressText(jsonl);

  console.log(
    `[LogArchivalService] Bot ${botId}: compressing ${entries.length} entries ` +
    `(${compressed.originalSize} → ${compressed.compressedSize} bytes, ` +
    `${((1 - compressed.ratio) * 100).toFixed(0)}% reduction)`
  );

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: compressed.data,
    ContentType: "application/gzip",
    ContentEncoding: "gzip",
  });

  await s3Client.send(putCommand);
}
```

#### getHistoricalLogs method:

```typescript
import { decompressText } from "@/server/utils/text-compression";

async getHistoricalLogs(botId: number, options = {}) {
  // ... existing list logic ...

  for (const key of sortedKeys) {
    const result = await s3Client.send(getCommand);
    const bodyBytes = await result.Body?.transformToByteArray();

    if (bodyBytes) {
      // Detect and handle compressed files
      const isCompressed = key.endsWith('.gz');
      let body: string;

      if (isCompressed) {
        body = await decompressText(Buffer.from(bodyBytes));
      } else {
        // Backward compatibility: handle old uncompressed files
        body = new TextDecoder().decode(bodyBytes);
      }

      // ... rest of parsing unchanged ...
    }
  }
}
```

## File Changes

### Files to Create

| File | Purpose |
|------|---------|
| `apps/milo/src/server/utils/text-compression.ts` | Gzip compression/decompression utility |

### Files to Modify

| File | Change |
|------|--------|
| `apps/milo/src/server/api/services/log-archival-service.ts` | Add compression on upload, decompression on read |

## Expected Results

- **S3 storage reduction**: ~70-90% (JSONL compresses very well)
- **Backward compatible**: Old `.jsonl` files still readable
- **No API changes**: Consumers unaffected
- **No new dependencies**: Uses Node.js built-in `zlib`
