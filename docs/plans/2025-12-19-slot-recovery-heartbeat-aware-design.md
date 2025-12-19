# Slot Recovery Heartbeat-Aware Design

## Problem

The slot recovery service incorrectly marks bots as FATAL during active deployments. The current 5-minute timeout for "stale deploying" slots is too aggressive and doesn't distinguish between:
- Legitimately stuck deployments (container crashed, network error)
- Slow but valid deployments (cold image pulls, container startup, meeting join delays)

## Root Cause

In `slot-recovery.ts`, the recovery job only checks `lastUsedAt` timestamp:

```typescript
const staleDeployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS); // 5 minutes

const stuckSlots = await db.select().from(botPoolSlotsTable).where(
  and(
    eq(botPoolSlotsTable.status, "deploying"),
    lt(botPoolSlotsTable.lastUsedAt, staleDeployingCutoff),
  ),
);
```

It doesn't check if the bot is **actively progressing** (container running, heartbeats received).

## Solution: Hybrid Approach

Extend timeout AND add heartbeat-aware recovery logic without schema changes.

### Changes

1. **Increase timeout** from 5 → 15 minutes
2. **Check bot heartbeat** before marking FATAL
3. **Self-heal slot status** if bot is alive but slot stuck in "deploying"

### Implementation

#### Constants

```typescript
/** Timeout for deploying slots before they're considered stale (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/** Threshold for considering a heartbeat "recent" */
const HEARTBEAT_FRESHNESS_MS = 5 * 60 * 1000;

/** Number of skipped recoveries before fixing slot status */
const MAX_SKIPPED_RECOVERIES = 3;
```

#### New Helper Functions

```typescript
async function checkBotHeartbeatBeforeRecovery(slot: SelectBotPoolSlotType): Promise<{
  skip: boolean;
  fixStatus: boolean;
}> {
  const bot = await db.query.botsTable.findFirst({
    where: eq(botsTable.id, slot.assignedBotId!),
    columns: { lastHeartbeat: true, status: true },
  });

  if (!bot?.lastHeartbeat) {
    return { skip: false, fixStatus: false };
  }

  const heartbeatAge = Date.now() - bot.lastHeartbeat.getTime();

  if (heartbeatAge > HEARTBEAT_FRESHNESS_MS) {
    return { skip: false, fixStatus: false };
  }

  const shouldFixStatus = slot.recoveryAttempts >= MAX_SKIPPED_RECOVERIES;

  return { skip: true, fixStatus: shouldFixStatus };
}

async function bumpSlotTimestamp(slot: SelectBotPoolSlotType): Promise<void> {
  await db.update(botPoolSlotsTable)
    .set({
      lastUsedAt: new Date(),
      recoveryAttempts: slot.recoveryAttempts + 1,
    })
    .where(eq(botPoolSlotsTable.id, slot.id));
}

async function fixSlotStatusToBusy(slot: SelectBotPoolSlotType): Promise<void> {
  await db.update(botPoolSlotsTable)
    .set({
      status: "busy",
      recoveryAttempts: 0,
      lastUsedAt: new Date(),
    })
    .where(eq(botPoolSlotsTable.id, slot.id));
}
```

#### Modified Recovery Logic

In `recoverStuckSlots`, before attempting recovery:

```typescript
if (slot.assignedBotId && slot.status === "deploying") {
  const skipResult = await checkBotHeartbeatBeforeRecovery(slot);

  if (skipResult.skip) {
    if (skipResult.fixStatus) {
      await fixSlotStatusToBusy(slot);
    } else {
      await bumpSlotTimestamp(slot);
    }
    result.skipped++;
    continue;
  }
}
```

### Decision Matrix

| Scenario | Heartbeat | Age | Recovery Attempts | Action |
|----------|-----------|-----|-------------------|--------|
| Bot never started | None | - | - | Proceed with recovery |
| Bot crashed | Exists | >5 min | - | Proceed with recovery |
| Bot alive, first check | Exists | <5 min | 0-2 | Skip, bump timestamp |
| Bot alive, repeated | Exists | <5 min | ≥3 | Fix slot to "busy" |

### Testing Scenarios

1. **Slow but healthy deployment** - Bot takes 10 min to start, sends heartbeats → NOT marked FATAL ✓
2. **Stuck deployment, no heartbeat** - Bot never starts, 15 min pass → marked FATAL ✓
3. **Bot alive but slot stuck** - Heartbeats present, 3 cycles → slot fixed to "busy" ✓
4. **Bot crashed after heartbeat** - Heartbeat >5 min old → marked FATAL ✓
5. **Error status slots** - Unchanged behavior, immediate recovery attempt ✓

### Files Modified

- `apps/milo/src/server/api/services/slot-recovery.ts`

### Result Structure Update

```typescript
interface RecoveryResult {
  recovered: number;
  failed: number;
  deleted: number;
  skipped: number;  // NEW: bots with active heartbeats
}
```
