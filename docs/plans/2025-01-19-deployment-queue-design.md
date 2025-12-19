# Deployment Queue Design

## Overview

Add a deployment queue to limit concurrent bot deployments to 4 on Coolify, preventing server resource exhaustion.

## Problem

When multiple bots deploy simultaneously, the Coolify server gets overwhelmed with:
- Docker image pulls
- Container creation
- Container startup
- Health checks

## Solution

Introduce an in-memory `DeploymentQueueService` that limits concurrent deployments to 4.

## Architecture

```
Bot Deployment Flow (Updated)
─────────────────────────────

Request Deploy
     ↓
┌─────────────────────────┐
│  Acquire Pool Slot      │ ← Existing logic
│  (or enter pool queue)  │
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  Acquire Deploy Slot    │ ← NEW: max 4 concurrent
│  (or enter deploy queue)│
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  Image Pull Lock        │ ← Existing
└───────────┬─────────────┘
            ↓
┌─────────────────────────┐
│  Start Container        │ ← Existing Coolify API
└─────────────────────────┘
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Coolify only | AWS Fargate handles its own scaling |
| Concurrency limit | 4 | Protects server resources |
| Queue storage | In-memory | Simple, fast, matches image pull lock pattern |
| Queue order | FIFO | Fair ordering |
| Timeout | 30 minutes | Allows for slow deploys without blocking forever |
| Bot status | No change | Bot stays DEPLOYING, queue is internal |
| Integration point | After pool slot acquisition | Don't hold deploy slots while waiting for pool |

## Service Interface

**File:** `apps/milo/src/server/api/services/deployment-queue-service.ts`

```typescript
interface QueuedDeployment {
  botId: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutAt: Date;
  queuedAt: Date;
}

class DeploymentQueueService {
  private readonly maxConcurrent = 4;
  private readonly timeoutMs = 30 * 60 * 1000; // 30 minutes

  private activeDeployments = new Set<string>();  // botIds currently deploying
  private queue: QueuedDeployment[] = [];         // FIFO queue

  // Main API
  async acquireSlot(botId: string): Promise<void>  // Waits until slot available
  release(botId: string): void                      // Called when deploy completes/fails

  // Observability
  getStats(): { active: number; queued: number; maxConcurrent: number }
}
```

## Integration

**File:** `apps/milo/src/server/api/services/platform/coolify-platform-service.ts`

```typescript
async deploy(bot: Bot, queueTimeoutMs?: number): Promise<DeployResult> {
  const slot = await this.botPoolService.acquireOrCreateSlot(...);
  // ... assign bot to slot ...

  await this.deploymentQueueService.acquireSlot(bot.id);  // ← NEW
  try {
    await this.botPoolService.configureAndStartSlot(...);
  } finally {
    this.deploymentQueueService.release(bot.id);          // ← NEW
  }

  return result;
}
```

## Implementation Details

### acquireSlot Method

```typescript
async acquireSlot(botId: string): Promise<void> {
  // If under limit, acquire immediately
  if (this.activeDeployments.size < this.maxConcurrent) {
    this.activeDeployments.add(botId);
    console.log(`[DeploymentQueue] Acquired slot for ${botId} (${this.activeDeployments.size}/${this.maxConcurrent})`);
    return;
  }

  // Otherwise, queue and wait
  console.log(`[DeploymentQueue] Queueing ${botId} (${this.queue.length + 1} waiting)`);

  return new Promise((resolve, reject) => {
    const timeoutAt = new Date(Date.now() + this.timeoutMs);

    const entry: QueuedDeployment = {
      botId,
      resolve: () => {
        this.activeDeployments.add(botId);
        resolve();
      },
      reject,
      timeoutAt,
      queuedAt: new Date(),
    };

    this.queue.push(entry);
    this.scheduleTimeoutCheck(entry);
  });
}
```

### release Method

```typescript
release(botId: string): void {
  if (!this.activeDeployments.delete(botId)) {
    return; // Was not active (maybe timed out)
  }

  console.log(`[DeploymentQueue] Released slot for ${botId} (${this.activeDeployments.size}/${this.maxConcurrent})`);
  this.processQueue();
}

private processQueue(): void {
  // Clean up timed-out entries first
  const now = Date.now();
  while (this.queue.length > 0 && this.queue[0].timeoutAt.getTime() < now) {
    const expired = this.queue.shift()!;
    expired.reject(new DeploymentQueueTimeoutError(expired.botId));
  }

  // Process next if slot available
  if (this.activeDeployments.size < this.maxConcurrent && this.queue.length > 0) {
    const next = this.queue.shift()!;
    console.log(`[DeploymentQueue] Dequeuing ${next.botId}`);
    next.resolve();
  }
}
```

## Error Handling

**New error class:** `apps/milo/src/server/api/errors/deployment-queue-timeout-error.ts`

```typescript
export class DeploymentQueueTimeoutError extends Error {
  constructor(botId: string) {
    super(`Deployment queue timeout for bot ${botId}`);
    this.name = "DeploymentQueueTimeoutError";
  }
}
```

**In CoolifyPlatformService:**

```typescript
try {
  await this.deploymentQueueService.acquireSlot(bot.id);
} catch (error) {
  if (error instanceof DeploymentQueueTimeoutError) {
    // Release pool slot since we never deployed
    await this.botPoolService.releaseSlot(slot.id);
    throw error; // Propagate to mark bot as FATAL
  }
  throw error;
}
```

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Server restart | Queue lost, in-flight deploys retry naturally |
| Deploy crashes mid-way | `finally` block ensures release |
| Timeout while queued | Reject promise, caller marks FATAL |
| Same bot queued twice | Prevented by existing flow (bot already DEPLOYING) |
| Release called twice | `Set.delete` returns false, no-op |

## Implementation Tasks

1. Create `DeploymentQueueTimeoutError` error class
2. Create `DeploymentQueueService` with acquireSlot/release/getStats
3. Integrate into `CoolifyPlatformService.deploy()` method
4. Add logging for observability
5. Add unit tests for the queue service

## Testing Strategy

- Unit tests for DeploymentQueueService
  - Immediate acquisition when under limit
  - Queueing when at limit
  - FIFO order
  - Timeout behavior
  - Release processing
- Integration test with mock Coolify
