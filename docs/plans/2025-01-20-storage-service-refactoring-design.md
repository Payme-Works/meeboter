# Storage Service Refactoring Design

## Overview

Refactor the storage service to follow clean architecture principles by separating the abstract storage interface from business-specific upload logic.

## Current State

- `StorageService` is a concrete class with business logic (`uploadRecording`, `uploadScreenshot`)
- `StorageProvider` interface handles the actual storage backend (S3)
- Business logic (path generation, file cleanup, retry logic) is mixed into StorageService

## Target Architecture

```
┌─────────────────┐     ┌─────────────────────────┐
│  Bot Providers  │────▶│  UploadRecordingUseCase │
│  (callers)      │     │  UploadScreenshotUseCase│
└─────────────────┘     └───────────┬─────────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   StorageService      │
                        │   (abstract class)    │
                        └───────────┬───────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │   S3StorageProvider   │
                        │   (implementation)    │
                        └───────────────────────┘
```

## Components

### StorageService (Abstract)

```typescript
abstract class StorageService {
  abstract upload(key: string, data: Buffer, contentType: string): Promise<string>;
}
```

- Single method: `upload()`
- No `isConfigured()` method
- Cannot be instantiated without configuration (type-safety enforced)

### S3StorageProvider

```typescript
interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string; // Required, not optional
}

class S3StorageProvider extends StorageService {
  constructor(private config: S3Config) {}

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    // Upload to S3, return key
  }
}
```

- Implements StorageService for S3/S3-compatible storage
- All config fields are required (TypeScript enforces)
- No runtime validation needed

### UploadRecordingUseCase

```typescript
interface UploadRecordingInput {
  botId: number;
  data: Buffer;
  platform: string;
  contentType: string;
}

class UploadRecordingUseCase {
  constructor(private storage: StorageService) {}

  async execute(input: UploadRecordingInput): Promise<string> {
    const key = `bots/${input.botId}/recordings/${uuid()}-${input.platform}.${extension}`;
    return this.storage.upload(key, input.data, input.contentType);
  }
}
```

- Receives Buffer directly (caller handles file I/O)
- Generates storage path internally
- Returns the storage key

### UploadScreenshotUseCase

```typescript
interface UploadScreenshotInput {
  botId: number;
  data: Buffer;
  type: "error" | "fatal" | "manual" | "state_change";
  state: string;
  trigger?: string;
}

class UploadScreenshotUseCase {
  constructor(private storage: StorageService) {}

  async execute(input: UploadScreenshotInput): Promise<ScreenshotData> {
    const key = `bots/${input.botId}/screenshots/${uuid()}-${input.type}-${timestamp}.png`;
    await this.storage.upload(key, input.data, "image/png");
    return { key, type: input.type, state: input.state, trigger: input.trigger, timestamp };
  }
}
```

- Receives Buffer directly
- Generates storage path internally
- Returns ScreenshotData with metadata

## Caller Pattern

```typescript
// Caller creates provider directly with config
const storageService = new S3StorageProvider({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  bucketName,
});
const uploadRecording = new UploadRecordingUseCase(storageService);

// Usage: caller handles file I/O and cleanup
const buffer = await fs.readFile(path);
const key = await uploadRecording.execute({ botId, data: buffer, platform, contentType });
await fs.unlink(path);
```

## Key Decisions

| Decision | Rationale |
| --- | --- |
| No `isConfigured()` | If StorageService exists, it's configured |
| No retry logic | Fail immediately if file read fails |
| Path generation in use cases | Each use case knows its domain path structure |
| Buffer input | Use cases are pure, callers handle file I/O |
| All config required | Type-safety over runtime checks |
| No factory function | Callers instantiate directly |

## Files to Modify

1. `apps/bots/src/services/storage/storage-service.ts` - Make abstract with single `upload()` method
2. `apps/bots/src/services/storage/s3-provider.ts` - Extend abstract StorageService
3. Create `apps/bots/src/use-cases/upload-recording.ts`
4. Create `apps/bots/src/use-cases/upload-screenshot.ts`
5. Update `apps/bots/src/index.ts` - Use new use case pattern
6. Update bot providers (Google Meet, Zoom, Teams) - Use new use case pattern
7. Remove old `StorageProvider` interface
8. Clean up unused error classes if any
