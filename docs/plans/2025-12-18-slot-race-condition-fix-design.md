# Slot Race Condition & Status Fix Design

## Summary

Fix two issues with pool slot creation:
1. **Race condition**: Concurrent deployments create duplicate slot names when pool is empty
2. **Status bug**: Slots show `busy` immediately instead of `deploying` during container startup

## Problem Analysis

### Race Condition

When 10 bots deploy simultaneously with an empty pool:
1. All transactions query the table
2. `FOR UPDATE` finds no rows to lock (empty table)
3. All proceed simultaneously, calculate slot number 1
4. All insert `meeboter-pool-google-meet-001`

**Evidence**: Database showed 8 rows with identical `slotName = meeboter-pool-google-meet-001`

### Status Bug

`configureAndStartSlot` calls `startApplication()` then immediately sets status to `busy` without waiting for the container to actually be running. The Coolify API just queues the start and returns immediately.

## Solution

### Fix 1: Advisory Lock

Use PostgreSQL `pg_advisory_xact_lock()` to serialize slot creation per platform:

```typescript
const PLATFORM_LOCK_IDS = {
  "google-meet": 100001,
  teams: 100002,
  zoom: 100003,
  unknown: 100000,
};

// Inside transaction
await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockId})`);
```

**Benefits**:
- Works even with empty tables
- Transaction-scoped (auto-releases on commit/rollback)
- Per-platform parallelism preserved

### Fix 2: Unique Constraint

Add unique index on `slotName` as database-level safety net:

```typescript
slotName: varchar("slotName", { length: 255 }).notNull().unique(),
```

Requires migration and cleanup of existing duplicates first.

### Fix 3: Fire-and-Forget Status Transition

Wait for deployment in background for optimistic UI feedback:

```typescript
await this.coolify.startApplication(activeSlot.coolifyServiceUuid);

// Fire-and-forget: runs in background, returns immediately
this.waitAndTransitionStatus(activeSlot, botConfig.id).catch((error) => {
  console.error(`Background status transition failed:`, error);
});

// Return immediately with deploying status
return { ...activeSlot, status: "deploying" };
```

The background `waitAndTransitionStatus` method handles:
- Polling `waitForDeployment()` until container is running
- Updating status to `busy` on success
- Updating status to `error` on failure

**Benefits**:
- API returns immediately with `deploying` status
- User sees optimistic feedback
- Status transitions correctly in background

## Implementation

### Files to Modify

1. `bot-pool-service.ts`
   - Add advisory lock to `createAndAcquireNewSlot`
   - Add `waitAndTransitionStatus` helper method
   - Update `configureAndStartSlot` to fire-and-forget

2. `schema.ts`
   - Add `.unique()` to `slotName` column

### Cleanup Required

Before adding unique constraint:
```sql
DELETE FROM bot_pool_slots WHERE id IN (4,5,6,7,8,9,10,11);
```

Also delete corresponding Coolify applications manually.

## Status Lifecycle (Corrected)

```
idle → deploying (on acquire) → [background wait] → busy → idle
              ↓                         ↓
           error                     error
```

API returns immediately with `deploying` status. Background process transitions to `busy` (~30 seconds) or `error`.

### Fix 4: Grace Period in waitForDeployment

The `waitForDeployment` function was failing prematurely because:
1. `startApplication` queues the start and returns immediately
2. First poll catches container in "exited"/"stopped" state (old state)
3. Treated as failure before Coolify even began starting the container

**Solution**: Add 3-minute grace period where "exited"/"stopped" are not treated as failures:

```typescript
// Deployments can take 5-20 minutes
const timeoutMs = 25 * 60 * 1000;     // 25 min total timeout
const pollIntervalMs = 15 * 1000;     // Poll every 15 seconds
const gracePeriodMs = 3 * 60 * 1000;  // 3 min grace period

const alwaysFailedStatuses = ["error", "degraded"];  // Always failures
const delayedFailedStatuses = ["exited", "stopped"]; // Only after grace

// Only fail on exited/stopped after grace period
if (!isGracePeriod && delayedFailedStatuses.includes(status)) {
  return { success: false, ... };
}
```
