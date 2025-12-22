# Image Pull Lock Design

**Status:** ✅ Implemented

## Problem Statement

When deploying multiple bots simultaneously for the same platform (e.g., 3 Google Meet bots at once), each deployment triggers a parallel Docker image pull for the same image. This wastes bandwidth and time since Docker layer caching only benefits deployments that start AFTER the first pull completes.

### Current Behavior (Before)

```
Bot A (google-meet) → startApplication() → image pull starts (~30-60s)
Bot B (google-meet) → startApplication() → image pull starts (duplicate!)
Bot C (google-meet) → startApplication() → image pull starts (duplicate!)

Total time: ~60s (parallel pulls, but redundant)
Bandwidth: 3x image size
```

### Desired Behavior (After)

```
Bot A (google-meet) → startApplication() → image pull starts
Bot B (google-meet) → waits for A's deployment...
Bot C (google-meet) → waits for A's deployment...
                      ↓
              A's deployment completes (image cached)
                      ↓
Bot B → startApplication() → uses cached image (~5-10s)
Bot C → startApplication() → uses cached image (~5-10s)

Total time: ~70-80s (sequential but cached)
Bandwidth: 1x image size
```

## Solution: In-Memory Lock per Image

Use a `Map<string, Promise<void>>` to track ongoing image pulls. Subsequent deployments for the same image wait for the first pull to complete.

### Why In-Memory (Not Database)?

- **Single server deployment** - No need for distributed coordination
- **Simple implementation** - ~130 lines of code
- **Fast** - No database round-trips for lock checks
- **Acceptable failure mode** - Server restart just means a fresh pull

## Implementation Details

### Key Insight: Lock Placement

The image pull happens during `startApplication()` → `waitForDeployment()`, NOT during `createApplication()`. Therefore, the lock must wrap the deployment phase, not the app creation phase.

### New File: `image-pull-lock-service.ts`

Location: `apps/milo/src/server/api/services/image-pull-lock-service.ts`

```typescript
interface PendingLock {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

export interface LockResult {
  release: (error?: Error) => void;
  isFirstDeployer: boolean;  // True if caller holds the lock
}

export class ImagePullLockService {
  private locks = new Map<string, PendingLock>();

  private getImageKey(platform: string, imageTag: string): string {
    return `${platform}:${imageTag}`;
  }

  async acquireLock(platform: string, imageTag: string): Promise<LockResult> {
    const key = this.getImageKey(platform, imageTag);
    const existingLock = this.locks.get(key);

    if (existingLock) {
      // Wait for existing pull to complete
      try {
        await existingLock.promise;
      } catch {
        // Previous pull failed, we'll attempt our own
      }
      // After waiting, image is cached - return no-op release
      return { release: () => {}, isFirstDeployer: false };
    }

    // Create new lock and return real release function
    // ... (see full implementation in source)
    return { release, isFirstDeployer: true };
  }
}
```

### Modified: `bot-pool-service.ts`

Lock is acquired in `configureAndStartSlot()` around `startApplication()` and `waitForDeployment()`:

```typescript
async configureAndStartSlot(slot: PoolSlot, botConfig: BotConfig): Promise<PoolSlot> {
  // ... app existence check and recreation if needed ...

  // Get platform info for image pull lock
  const image = this.coolify.selectBotImage(botConfig.meetingInfo);
  const platformName = this.getPlatformSlotName(botConfig.meetingInfo.platform);

  // Acquire lock - if another deployment is in progress, we wait
  const { release: releaseLock, isFirstDeployer } =
    await this.imagePullLock.acquireLock(platformName, image.tag);

  await this.coolify.startApplication(activeSlot.coolifyServiceUuid);

  if (isFirstDeployer) {
    // First deployer: wait for deployment to complete before releasing lock
    // This ensures image is fully pulled and cached before others proceed
    try {
      await this.waitAndTransitionStatus(activeSlot, botConfig.id);
      releaseLock();
    } catch (error) {
      releaseLock(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  } else {
    // Not first deployer: image is cached, can fire-and-forget
    // This provides optimistic feedback to the user
    this.waitAndTransitionStatus(activeSlot, botConfig.id).catch((error) => {
      console.error(`Background status transition failed:`, error);
    });
  }

  return { ...activeSlot, status: "deploying" as const };
}
```

### Modified: `platform-factory.ts` and `index.ts`

Both files create and inject the `ImagePullLockService`:

```typescript
import { ImagePullLockService } from "./image-pull-lock-service";

const imagePullLock = new ImagePullLockService();
const poolService = new BotPoolService(db, coolifyService, imagePullLock);
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| First deployment fails | Promise rejected, waiters notified, lock removed, next attempt starts fresh |
| Server restarts mid-pull | Lock lost, next deployment starts new pull (acceptable) |
| Slow pull (30+ min) | Coolify times out, error propagates to all waiters |
| Different platforms simultaneously | Separate locks, parallel pulls allowed |
| Same platform, different tags | Different keys, parallel pulls (correct - different images) |

## Files Changed

| File | Change |
|------|--------|
| `apps/milo/src/server/api/services/image-pull-lock-service.ts` | **NEW** - Lock coordination service with `isFirstDeployer` flag |
| `apps/milo/src/server/api/services/bot-pool-service.ts` | Lock in `configureAndStartSlot()`, waits for deployment if first deployer |
| `apps/milo/src/server/api/services/platform/platform-factory.ts` | Create and provide lock service |
| `apps/milo/src/server/api/services/index.ts` | Create and provide lock service |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    BotPoolService                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            configureAndStartSlot()                        │   │
│  │                                                           │   │
│  │  1. Check if Coolify app exists (recreate if not)        │   │
│  │  2. acquireLock(platform, imageTag) ◄────────────────┐   │   │
│  │     │                                                 │   │   │
│  │     ▼                                                 │   │   │
│  │  ┌──────────────────────────────────────────────┐   │   │   │
│  │  │         ImagePullLockService                  │   │   │   │
│  │  │  ┌─────────────────────────────────────────┐ │   │   │   │
│  │  │  │ locks: Map<"platform:tag", Promise>     │ │   │   │   │
│  │  │  │                                         │ │   │   │   │
│  │  │  │ "google-meet:v1.0" → Promise<void>     │ │   │   │   │
│  │  │  │ "teams:v1.0"       → (none)            │ │   │   │   │
│  │  │  └─────────────────────────────────────────┘ │   │   │   │
│  │  └──────────────────────────────────────────────┘   │   │   │
│  │     │                                                 │   │   │
│  │     ▼ (waits if lock exists, creates if not)         │   │   │
│  │  3. startApplication() ← Starts container             │   │   │
│  │  4. waitForDeployment() ← Image pull happens here     │   │   │
│  │  5. releaseLock() (if isFirstDeployer) ──────────────┘   │   │
│  │  6. Update slot status to busy                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

First Deployer Flow:
  acquireLock → isFirstDeployer=true → startApplication → waitForDeployment (blocking) → releaseLock

Subsequent Deployer Flow:
  acquireLock (waits) → isFirstDeployer=false → startApplication → waitForDeployment (fire-and-forget)
```

## Testing Strategy

1. **Unit test `ImagePullLockService`:**
   - Concurrent lock requests wait properly
   - `isFirstDeployer` flag is correct
   - Error propagation works
   - Lock cleanup on success/failure

2. **Integration test:**
   - Deploy 3 bots of same platform simultaneously
   - Verify only 1 image pull occurs (check Coolify logs)
   - First deployer takes longer (waits for deployment)
   - Subsequent deployers return immediately
   - All 3 bots deploy successfully

## Acceptance Criteria

- [x] Deploying N bots of same platform simultaneously triggers only 1 image pull
- [x] First deployer waits for deployment to complete before releasing lock
- [x] Subsequent deployments use cached image (faster startup, fire-and-forget)
- [x] Failed first deployment doesn't block future deployments
- [x] Different platforms can pull simultaneously
- [x] No deadlocks or memory leaks
