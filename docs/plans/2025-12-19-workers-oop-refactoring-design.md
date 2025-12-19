# Workers OOP Refactoring Design

## Problem

Background workers (slot-recovery, bot-heartbeat-monitor) are implemented using functional patterns with `setInterval`. This makes them:
- Hard to test (real timers, direct DB access)
- No lifecycle control (can't stop/restart gracefully)
- Inconsistent pattern for future workers

## Goals

1. **Better testability** - Unit test workers without real timers/DB
2. **Lifecycle control** - Ability to stop/restart workers gracefully
3. **Consistency** - Establish a standard pattern for future workers

## Solution

Refactor to OOP pattern with:
- DI-ready abstract base class
- Individual worker implementations
- Centralized initialization via `startWorkers()`
- New `/workers` folder

## Folder Structure

```
apps/milo/src/server/workers/
├── base-worker.ts           # Abstract base class with lifecycle, DI
├── slot-recovery.worker.ts  # Slot health: error recovery, stale deploying
├── bot-health.worker.ts     # Bot health: active bot heartbeat monitoring
└── index.ts                 # startWorkers(), stopWorkers(), exports
```

## Base Worker Class

```typescript
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/server/database/schema";
import type { Services } from "@/server/api/services";

export interface WorkerOptions {
  /** Interval in ms between executions. Set to 0 to disable auto-run. */
  intervalMs: number;
  /** Whether to run immediately on start */
  runOnStart?: boolean;
}

export interface WorkerResult {
  [key: string]: number;
}

export abstract class BaseWorker<TResult extends WorkerResult = WorkerResult> {
  protected intervalId: NodeJS.Timeout | null = null;
  protected isRunning = false;

  constructor(
    protected readonly db: PostgresJsDatabase<typeof schema>,
    protected readonly services: Services,
    protected readonly options: WorkerOptions,
  ) {}

  /** Worker name for logging */
  abstract readonly name: string;

  /** Main execution logic - implement in subclass */
  protected abstract execute(): Promise<TResult>;

  /** Start the worker with interval */
  start(): void {
    if (this.intervalId) {
      console.warn(`[${this.name}] Already running`);
      return;
    }

    console.log(
      `[${this.name}] Starting (interval: ${this.options.intervalMs}ms, runOnStart: ${this.options.runOnStart ?? true})`,
    );

    if (this.options.runOnStart !== false) {
      this.executeNow();
    }

    if (this.options.intervalMs > 0) {
      this.intervalId = setInterval(() => this.executeNow(), this.options.intervalMs);
    }
  }

  /** Stop the worker */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[${this.name}] Stopped`);
    }
  }

  /** Execute once (for testing or manual trigger) */
  async executeNow(): Promise<TResult> {
    if (this.isRunning) {
      console.warn(`[${this.name}] Skipping execution - previous run still in progress`);
      return {} as TResult;
    }

    this.isRunning = true;

    try {
      const result = await this.execute();
      console.log(`[${this.name}] Results:`, result);
      return result;
    } catch (error) {
      console.error(`[${this.name}] Execution failed:`, error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }
}
```

## Worker Implementations

### SlotRecoveryWorker

Monitors slot health and recovers stuck slots.

**Responsibilities:**
- Find error slots → attempt recovery
- Find stale deploying slots → check heartbeat, attempt recovery
- Delete slots after 3 failed recovery attempts
- Mark assigned bots as FATAL when recovering/deleting

```typescript
export interface SlotRecoveryResult extends WorkerResult {
  recovered: number;
  failed: number;
  deleted: number;
  skipped: number;
}

export class SlotRecoveryWorker extends BaseWorker<SlotRecoveryResult> {
  readonly name = "SlotRecovery";

  protected async execute(): Promise<SlotRecoveryResult> {
    // Migrated logic from slot-recovery.ts
  }
}
```

### BotHealthWorker

Monitors bot health via heartbeats for active bots only.

**Responsibilities:**
- Find bots in active status (JOINING_CALL, IN_WAITING_ROOM, IN_CALL, LEAVING)
- With stale/missing heartbeat
- Mark FATAL and release resources

**Note:** DEPLOYING status is NOT monitored here - handled by SlotRecoveryWorker.

```typescript
export interface BotHealthResult extends WorkerResult {
  checked: number;
  markedFatal: number;
  resourcesReleased: number;
}

export class BotHealthWorker extends BaseWorker<BotHealthResult> {
  readonly name = "BotHealth";

  protected async execute(): Promise<BotHealthResult> {
    // Modified logic - active statuses only (no DEPLOYING)
  }
}
```

## Worker Responsibility Split

| Worker | Monitors | Actions |
|--------|----------|---------|
| `SlotRecoveryWorker` | Slot status (error, stale deploying) | Recover slot, mark bot FATAL, delete slot |
| `BotHealthWorker` | Bot heartbeat (active statuses only) | Mark bot FATAL, release resources |

**Key insight:** DEPLOYING bots are monitored by SlotRecoveryWorker because deployment failures are slot-related. BotHealthWorker only catches bots that crashed after successful deployment.

## Index and Initialization

```typescript
// apps/milo/src/server/workers/index.ts

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export function startWorkers(
  db: PostgresJsDatabase<typeof schema>,
  services: Services,
): BaseWorker[] {
  const workers = [
    new SlotRecoveryWorker(db, services, {
      intervalMs: DEFAULT_INTERVAL_MS,
      runOnStart: true,
    }),
    new BotHealthWorker(db, services, {
      intervalMs: DEFAULT_INTERVAL_MS,
      runOnStart: true,
    }),
  ];

  console.log(`[Workers] Starting ${workers.length} background workers...`);
  workers.forEach(w => w.start());

  return workers;
}

export function stopWorkers(workers: BaseWorker[]): void {
  console.log(`[Workers] Stopping ${workers.length} workers...`);
  workers.forEach(w => w.stop());
}
```

## Migration Steps

1. Create `workers/` folder with base class and implementations
2. Update `db.ts` to use `startWorkers()` instead of individual functions
3. Delete old files:
   - `services/slot-recovery.ts`
   - `services/bot-heartbeat-monitor.ts`
4. Run lint and typecheck

## Testing

Workers are now easily testable without real timers:

```typescript
// Unit test
const worker = new SlotRecoveryWorker(mockDb, mockServices, { intervalMs: 0 });
const result = await worker.executeNow();
expect(result.recovered).toBe(1);
```

## Summary

| Aspect | Before | After |
|--------|--------|-------|
| Pattern | Functional (`setInterval`) | OOP (BaseWorker class) |
| Location | `services/` folder | `workers/` folder |
| Testability | Hard (real timers, DB) | Easy (DI, `executeNow()`) |
| Lifecycle | No stop capability | `start()` / `stop()` |
| Initialization | `db.ts` calls 2 functions | `db.ts` calls `startWorkers()` |
| DEPLOYING monitoring | Both workers | SlotRecoveryWorker only |
