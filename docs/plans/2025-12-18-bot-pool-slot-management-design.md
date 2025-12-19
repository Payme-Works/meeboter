# Bot Pool Slot Management Architecture

**Date**: 2025-12-18
**Status**: Proposed
**Author**: Claude Code + User collaboration

## Problem Statement

The current bot pool slot management has several reliability and complexity issues:

1. **Data synchronization bugs**: Multiple places update the slot/bot relationship independently, leading to stale references (e.g., `botsTable.coolifyServiceUuid` not updated when slot recreates Coolify app)

2. **Race conditions**: Slot can be released while bot container still makes API calls, causing "No bot assigned to pool slot" errors

3. **Scattered logic**: Assignment, release, and error recovery code spread across multiple files without consistent patterns

4. **Poor observability**: Inconsistent logging makes debugging slot state transitions difficult

## Design Goals

- **Single source of truth**: `botPoolSlotsTable.assignedBotId` owns the relationship
- **Atomic operations**: All state changes happen in transactions
- **Centralized functions**: One place for assignment, one for release
- **Consistent observability**: Structured logging for all state transitions
- **Graceful degradation**: Handle post-release API calls without errors

## Data Model Clarification

### Source of Truth

```
botPoolSlotsTable.assignedBotId  →  SOURCE OF TRUTH
  - When set: slot is actively assigned to this bot
  - When null: slot is available (idle or error state)

botsTable.coolifyServiceUuid  →  HISTORICAL REFERENCE
  - Records which Coolify app this bot last ran in
  - Survives after slot is released
  - Used for post-release lookups and debugging
```

### Relationship Direction

```
Slot ──owns──► Bot assignment (via assignedBotId)
Bot  ──references──► Container (via coolifyServiceUuid, historical)
```

## Core Operations

### assignBotToSlot()

Single entry point for all bot-to-slot assignments:

```typescript
async function assignBotToSlot(
  slotId: string,
  botId: string,
  coolifyUuid: string
): Promise<void> {
  await db.transaction(async (tx) => {
    // Update slot: mark as busy, record assignment
    await tx.update(botPoolSlotsTable)
      .set({
        status: 'busy',
        assignedBotId: botId,
        lastAssignedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(botPoolSlotsTable.id, slotId));

    // Update bot: record which container it's running in
    await tx.update(botsTable)
      .set({ coolifyServiceUuid: coolifyUuid })
      .where(eq(botsTable.id, botId));
  });

  logSlotTransition({
    slotId,
    newState: 'busy',
    botId,
    coolifyUuid,
    reason: 'Bot assigned to slot',
  });
}
```

### releaseBotFromSlot()

Single entry point for all slot releases:

```typescript
async function releaseBotFromSlot(slotId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const slot = await tx.select()
      .from(botPoolSlotsTable)
      .where(eq(botPoolSlotsTable.id, slotId))
      .limit(1);

    if (!slot[0]) return;

    const previousBotId = slot[0].assignedBotId;

    // Release the slot (bot keeps its coolifyServiceUuid for history)
    await tx.update(botPoolSlotsTable)
      .set({
        status: 'idle',
        assignedBotId: null,
        lastReleasedAt: new Date(),
      })
      .where(eq(botPoolSlotsTable.id, slotId));

    logSlotTransition({
      slotId,
      previousState: slot[0].status,
      newState: 'idle',
      botId: previousBotId,
      coolifyUuid: slot[0].coolifyServiceUuid,
      reason: 'Slot released',
    });
  });
}
```

## Lookup Strategies

### Finding a Bot's Current Slot

```typescript
async function getSlotForBot(botId: string): Promise<PoolSlot | null> {
  const result = await db.select()
    .from(botPoolSlotsTable)
    .where(eq(botPoolSlotsTable.assignedBotId, botId))
    .limit(1);
  return result[0] ?? null;
}
```

### Finding a Bot by Container UUID (getPoolSlot fix)

```typescript
async function getBotByContainerUuid(coolifyUuid: string): Promise<Bot | null> {
  // Step 1: Find which slot owns this UUID
  const slot = await db.select()
    .from(botPoolSlotsTable)
    .where(eq(botPoolSlotsTable.coolifyServiceUuid, coolifyUuid))
    .limit(1);

  if (!slot[0]) return null;

  // Step 2: If slot has an assigned bot, return it
  if (slot[0].assignedBotId) {
    const bot = await db.select().from(botsTable)
      .where(eq(botsTable.id, slot[0].assignedBotId))
      .limit(1);
    return bot[0] ?? null;
  }

  // Step 3: Slot released - use historical reference
  const bot = await db.select().from(botsTable)
    .where(eq(botsTable.coolifyServiceUuid, coolifyUuid))
    .limit(1);
  return bot[0] ?? null;
}
```

## Observability

### Structured Logging

```typescript
interface SlotStateLog {
  slotId: string;
  slotName: string;
  coolifyUuid: string;
  previousState: SlotStatus;
  newState: SlotStatus;
  botId?: string;
  reason: string;
}

function logSlotTransition(log: SlotStateLog) {
  console.log(
    `[Pool] Slot ${log.slotName} (${log.slotId}): ` +
    `${log.previousState} → ${log.newState} | ` +
    `bot=${log.botId ?? 'none'} | ` +
    `coolify=${log.coolifyUuid} | ` +
    `reason="${log.reason}"`
  );
}
```

### Critical Transition Points

| Event | Log Content |
|-------|-------------|
| `assignBotToSlot()` | slot, bot, previous state, coolify UUID |
| `releaseBotFromSlot()` | slot, bot, final bot status, duration |
| `recreateSlotApplication()` | slot, old UUID → new UUID, recovery attempt # |
| Heartbeat timeout | slot, bot, last heartbeat time, threshold |
| Deployment status change | slot, deployment UUID, status transition |

### Correlation IDs

Add a `correlationId` to track a bot's entire lifecycle:

```typescript
console.log(`[Pool] [corr=${bot.correlationId}] Assigning bot ${bot.id} to slot ${slot.slotName}`);
```

## Error Handling & Recovery

### Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Deployment fails | Coolify API returns `failed` | Mark slot `error`, release bot, optionally retry |
| Container crashes | Heartbeat timeout | Release slot, mark bot failed |
| Slot stuck in `deploying` | Timeout (e.g., 30min) | Force release, recreate app |
| Bot completes but slot not released | Bot status `DONE`/`FAILED` + slot still `busy` | Cleanup job releases slot |

### Atomic Error Recovery

```typescript
async function handleSlotError(
  slotId: string,
  error: string,
  shouldRecreate: boolean
): Promise<void> {
  await db.transaction(async (tx) => {
    const slot = await tx.select().from(botPoolSlotsTable)
      .where(eq(botPoolSlotsTable.id, slotId))
      .for('update')
      .limit(1);

    if (!slot[0]) return;

    // Release the bot if assigned
    if (slot[0].assignedBotId) {
      await tx.update(botsTable)
        .set({ status: 'FAILED', failureReason: error })
        .where(eq(botsTable.id, slot[0].assignedBotId));
    }

    // Update slot state
    await tx.update(botPoolSlotsTable)
      .set({
        status: shouldRecreate ? 'idle' : 'error',
        assignedBotId: null,
        errorMessage: error,
        lastReleasedAt: new Date(),
      })
      .where(eq(botPoolSlotsTable.id, slotId));
  });

  logSlotTransition({ /* ... */ reason: error });
}
```

### Cleanup Job

Periodic task to catch orphaned states:

```typescript
async function cleanupOrphanedSlots() {
  const orphaned = await db.select()
    .from(botPoolSlotsTable)
    .innerJoin(botsTable, eq(botPoolSlotsTable.assignedBotId, botsTable.id))
    .where(
      and(
        eq(botPoolSlotsTable.status, 'busy'),
        inArray(botsTable.status, ['DONE', 'FAILED'])
      )
    );

  for (const { bot_pool_slots } of orphaned) {
    console.log(`[Pool] Cleanup: releasing orphaned slot ${bot_pool_slots.slotName}`);
    await releaseBotFromSlot(bot_pool_slots.id);
  }
}
```

## Implementation Priority

### 1. Immediate (fixes current bugs)

- Create `assignBotToSlot()` and `releaseBotFromSlot()` functions
- Refactor existing code to use them
- Fix `getPoolSlot` to use the lookup strategy above

### 2. Short-term (improves reliability)

- Add structured logging with `logSlotTransition()`
- Implement `handleSlotError()` for consistent recovery

### 3. Medium-term (prevents future issues)

- Add cleanup job for orphaned slots
- Add correlation IDs for log tracing

## Files to Modify

- `apps/milo/src/server/api/services/bot-pool-service.ts` - Add centralized functions
- `apps/milo/src/server/api/routers/bots.ts` - Refactor to use new functions
- `apps/milo/src/server/api/services/coolify-service.ts` - Use new functions for deployment callbacks

## Migration Path

1. Add new functions alongside existing code
2. Refactor callers one at a time
3. Remove duplicated logic after all callers migrated
4. Add cleanup job as final step
