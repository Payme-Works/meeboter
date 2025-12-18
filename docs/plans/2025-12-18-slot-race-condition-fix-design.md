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
4. All insert `meeboter-pool-meet-001`

**Evidence**: Database showed 8 rows with identical `slotName = meeboter-pool-meet-001`

### Status Bug

`configureAndStartSlot` calls `startApplication()` then immediately sets status to `busy` without waiting for the container to actually be running. The Coolify API just queues the start and returns immediately.

## Solution

### Fix 1: Advisory Lock

Use PostgreSQL `pg_advisory_xact_lock()` to serialize slot creation per platform:

```typescript
const PLATFORM_LOCK_IDS = {
  meet: 100001,
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

### Fix 3: Wait for Deployment

Use existing `waitForDeployment()` before transitioning to `busy`:

```typescript
await this.coolify.startApplication(activeSlot.coolifyServiceUuid);

const result = await this.coolify.waitForDeployment(activeSlot.coolifyServiceUuid);
if (!result.success) {
  // Mark as error, not busy
  throw new Error(`Container failed to start: ${result.error}`);
}

// NOW transition to busy
await this.db.update(...).set({ status: "busy" });
```

## Implementation

### Files to Modify

1. `bot-pool-service.ts`
   - Add advisory lock to `createAndAcquireNewSlot`
   - Update `configureAndStartSlot` to wait for deployment

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
idle → deploying (on acquire) → [wait for container] → busy → idle
              ↓                         ↓
           error                     error
```

`deploying` status now visible for ~30 seconds while container starts.
