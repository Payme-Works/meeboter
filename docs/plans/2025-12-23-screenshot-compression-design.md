# Screenshot Compression Design

**Date**: 2025-12-23
**Status**: Approved

## Summary

Move screenshot compression from bots to Milo (server) using Sharp library for optimal performance. Screenshots will be compressed to WebP format at 80% quality before uploading to S3.

## Problem

Currently, bots upload raw PNG screenshots directly to S3, resulting in:
- Large file sizes (screenshots can be 1-5MB each)
- High S3 storage costs
- Slower upload times from bot containers

## Solution

Implement server-side compression in Milo using Sharp (the fastest Node.js image library) with a new HTTP endpoint for screenshot uploads.

### Architecture

```
┌─────────────┐     POST /api/bots/{id}/screenshots     ┌──────────────┐
│    Bot      │ ────────────────────────────────────────▶│    Milo      │
│  (captures  │     multipart/form-data (PNG buffer)    │  (compresses │
│  screenshot)│                                          │   to WebP)   │
└─────────────┘                                          └──────┬───────┘
                                                                │
                                                                ▼
                                                         ┌──────────────┐
                                                         │     S3       │
                                                         │  (stores     │
                                                         │   WebP)      │
                                                         └──────────────┘
```

### Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Compression library | Sharp | Fastest Node.js image processor (uses libvips), 60% avg size reduction |
| Output format | WebP | Best compression ratio (~80% smaller than PNG), modern format |
| Quality level | 80% | Optimal balance of quality and file size |
| Transport | HTTP multipart | Standard for file uploads, no base64 overhead, no size limits |

## Implementation

### 1. Milo HTTP Endpoint

**File**: `apps/milo/src/app/api/bots/[id]/screenshots/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { compressImage } from "@/server/utils/image-compression";
import { uploadToS3 } from "@/server/utils/s3";
import { db } from "@/server/database";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Validate X-Milo-Token header
  // 2. Parse multipart form data
  // 3. Compress PNG → WebP using Sharp
  // 4. Upload to S3
  // 5. Update bot.screenshots in database
  // 6. Return screenshot metadata
}
```

### 2. Image Compression Service

**File**: `apps/milo/src/server/utils/image-compression.ts`

```typescript
import sharp from "sharp";

interface CompressImageOptions {
  quality?: number;  // Default: 80
  format?: "webp" | "jpeg" | "png";  // Default: webp
}

interface CompressImageResult {
  data: Buffer;
  originalSize: number;
  compressedSize: number;
  format: string;
}

export async function compressImage(
  input: Buffer,
  options: CompressImageOptions = {}
): Promise<CompressImageResult> {
  const { quality = 80, format = "webp" } = options;
  const originalSize = input.length;

  const compressed = await sharp(input)
    .webp({ quality })
    .toBuffer();

  return {
    data: compressed,
    originalSize,
    compressedSize: compressed.length,
    format,
  };
}
```

### 3. Bot Screenshot Uploader

**File**: `apps/bots/src/services/screenshot-uploader.ts`

```typescript
import type { ScreenshotData } from "../logger";

interface UploadScreenshotInput {
  botId: number;
  data: Buffer;
  type: ScreenshotData["type"];
  state: string;
  trigger?: string;
}

export class ScreenshotUploader {
  constructor(
    private readonly miloUrl: string,
    private readonly authToken: string
  ) {}

  async upload(input: UploadScreenshotInput): Promise<ScreenshotData> {
    const formData = new FormData();
    formData.append("file", new Blob([input.data]), "screenshot.png");
    formData.append("type", input.type);
    formData.append("state", input.state);
    if (input.trigger) {
      formData.append("trigger", input.trigger);
    }

    const response = await fetch(
      `${this.miloUrl}/api/bots/${input.botId}/screenshots`,
      {
        method: "POST",
        headers: {
          "X-Milo-Token": this.authToken,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Screenshot upload failed: ${response.statusText}`);
    }

    return response.json();
  }
}
```

## File Changes

### Files to Create

| File | Purpose |
|------|---------|
| `apps/milo/src/app/api/bots/[id]/screenshots/route.ts` | HTTP endpoint |
| `apps/milo/src/server/utils/image-compression.ts` | Sharp compression |
| `apps/bots/src/services/screenshot-uploader.ts` | HTTP upload client |

### Files to Modify

| File | Change |
|------|--------|
| `apps/bots/providers/google-meet/src/bot.ts` | Use ScreenshotUploader |
| `apps/bots/providers/microsoft-teams/src/bot.ts` | Use ScreenshotUploader |
| `apps/bots/providers/zoom/src/bot.ts` | Use ScreenshotUploader |

### Dependencies

| Package | App | Version |
|---------|-----|---------|
| `sharp` | `@meeboter/milo` | latest |

## Expected Results

- **File size reduction**: ~70-80% smaller (PNG → WebP at 80%)
- **Storage savings**: Significant S3 cost reduction
- **Centralized control**: Easy to adjust compression settings in one place

## Sources

- [Sharp - High Performance Node.js Image Processing](https://sharp.pixelplumbing.com/)
- [Sharp Performance Benchmarks](https://sharp.pixelplumbing.com/performance/)
