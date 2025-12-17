# Error Slot Recovery Design

**Date:** 2025-12-16
**Status:** Approved
**Author:** Claude (via brainstorming session)

## Problem

Pool slots that enter `error` state become permanently unusable, reducing pool capacity over time. Errors are often transient (network blips, container hiccups) and slots could be recovered.

## Solution

A background recovery job that:
1. Runs every 5 minutes within the server process
2. Finds slots in `error` state
3. Attempts recovery by stopping the container and resetting to `idle`
4. Tracks attempts per slot (max 3)
5. Auto-deletes permanently failed slots from both DB and Coolify

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Attempt tracking | `recoveryAttempts` column | Clean, queryable, not hacky |
| Job scheduling | `setInterval` in server | Simple, no extra infra |
| Recovery action | Stop → Reset to idle | Fast, handles transient errors |
| Max attempts exceeded | Delete slot entirely | Pool self-heals |

## Configuration

| Parameter | Default | Env Var |
|-----------|---------|---------|
| Recovery interval | 5 minutes | `SLOT_RECOVERY_INTERVAL_MS` |
| Max recovery attempts | 3 | `SLOT_MAX_RECOVERY_ATTEMPTS` |

## Database Changes

### Migration

```sql
ALTER TABLE "bot_pool_slots"
ADD COLUMN "recoveryAttempts" integer DEFAULT 0 NOT NULL;
```

### Updated Schema

```typescript
export const botPoolSlotsTable = pgTable("bot_pool_slots", {
  id: serial("id").primaryKey(),
  coolifyServiceUuid: varchar("coolifyServiceUuid", { length: 255 }).notNull().unique(),
  slotName: varchar("slotName", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).$type<PoolSlotStatus>().notNull().default("idle"),
  assignedBotId: integer("assignedBotId").references(() => botsTable.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("lastUsedAt"),
  errorMessage: text("errorMessage"),
  recoveryAttempts: integer("recoveryAttempts").notNull().default(0),  // NEW
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, ...);
```

### Behavior

- Reset to `0` when slot is successfully released back to idle
- Increment by `1` on each failed recovery attempt
- Delete slot when `recoveryAttempts >= MAX_RECOVERY_ATTEMPTS`

## Implementation

### New Service: `slot-recovery.ts`

```typescript
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "@/server/database/schema";
import {
  botPoolSlotsTable,
  type SelectBotPoolSlotType,
} from "@/server/database/schema";
import {
  deleteCoolifyApplication,
  stopCoolifyApplication,
} from "./coolify-deployment";
import { updateSlotDescription } from "./bot-pool-manager";

const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RECOVERY_ATTEMPTS = 3;

interface RecoveryResult {
  recovered: number;
  failed: number;
  deleted: number;
}

export function startSlotRecoveryJob(
  db: PostgresJsDatabase<typeof schema>
): void {
  console.log("[Recovery] Starting slot recovery job (interval: 5min)");

  // Run immediately on startup, then every interval
  recoverErrorSlots(db);
  setInterval(() => recoverErrorSlots(db), RECOVERY_INTERVAL_MS);
}

async function recoverErrorSlots(
  db: PostgresJsDatabase<typeof schema>
): Promise<RecoveryResult> {
  const result = { recovered: 0, failed: 0, deleted: 0 };

  try {
    const errorSlots = await db
      .select()
      .from(botPoolSlotsTable)
      .where(eq(botPoolSlotsTable.status, "error"));

    for (const slot of errorSlots) {
      if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        await deleteSlotPermanently(slot, db);
        result.deleted++;
        continue;
      }

      const success = await attemptSlotRecovery(slot, db);
      success ? result.recovered++ : result.failed++;
    }

    if (result.recovered + result.failed + result.deleted > 0) {
      console.log(
        `[Recovery] recovered=${result.recovered} failed=${result.failed} deleted=${result.deleted}`
      );
    }
  } catch (error) {
    console.error("[Recovery] Job failed:", error);
  }

  return result;
}

async function attemptSlotRecovery(
  slot: SelectBotPoolSlotType,
  db: PostgresJsDatabase<typeof schema>
): Promise<boolean> {
  console.log(
    `[Recovery] Attempting recovery for ${slot.slotName} (attempt ${slot.recoveryAttempts + 1}/${MAX_RECOVERY_ATTEMPTS})`
  );

  try {
    await stopCoolifyApplication(slot.coolifyServiceUuid);

    await db
      .update(botPoolSlotsTable)
      .set({
        status: "idle",
        assignedBotId: null,
        errorMessage: null,
        recoveryAttempts: 0,
        lastUsedAt: new Date(),
      })
      .where(eq(botPoolSlotsTable.id, slot.id));

    await updateSlotDescription(slot.coolifyServiceUuid, "idle");

    console.log(`[Recovery] Successfully recovered ${slot.slotName}`);
    return true;
  } catch (error) {
    await db
      .update(botPoolSlotsTable)
      .set({ recoveryAttempts: slot.recoveryAttempts + 1 })
      .where(eq(botPoolSlotsTable.id, slot.id));

    console.error(`[Recovery] Failed to recover ${slot.slotName}:`, error);
    return false;
  }
}

async function deleteSlotPermanently(
  slot: SelectBotPoolSlotType,
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  console.log(`[Recovery] Deleting permanently failed slot ${slot.slotName}`);

  try {
    await deleteCoolifyApplication(slot.coolifyServiceUuid);
  } catch (error) {
    console.error(`[Recovery] Failed to delete Coolify app:`, error);
  }

  await db
    .delete(botPoolSlotsTable)
    .where(eq(botPoolSlotsTable.id, slot.id));

  console.log(`[Recovery] Deleted slot ${slot.slotName}`);
}
```

### New Function in `coolify-deployment.ts`

```typescript
export async function deleteCoolifyApplication(
  applicationUuid: string
): Promise<void> {
  const response = await fetch(
    `${env.COOLIFY_API_URL}/applications/${applicationUuid}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    throw new CoolifyDeploymentError(
      `Failed to delete application: ${await response.text()}`
    );
  }
}
```

### Update `releaseSlot` in `bot-pool-manager.ts`

Add `recoveryAttempts: 0` to the update when releasing:

```typescript
await db
  .update(botPoolSlotsTable)
  .set({
    status: "idle",
    assignedBotId: null,
    lastUsedAt: new Date(),
    errorMessage: null,
    recoveryAttempts: 0,  // Reset on successful release
  })
  .where(eq(botPoolSlotsTable.id, slot.id));
```

### Server Startup Integration

```typescript
import { startSlotRecoveryJob } from "./api/services/slot-recovery";

// After database connection is established
if (env.NODE_ENV === "production") {
  startSlotRecoveryJob(db);
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `schema.ts` | Add `recoveryAttempts` column |
| `coolify-deployment.ts` | Add `deleteCoolifyApplication` function |
| `bot-pool-manager.ts` | Reset `recoveryAttempts: 0` in `releaseSlot`, export `updateSlotDescription` |
| Server entry point | Call `startSlotRecoveryJob(db)` on startup |

## Files to Create

| File | Purpose |
|------|---------|
| `slot-recovery.ts` | Recovery job service |
| `drizzle/0008_*.sql` | Migration for new column |

## Implementation Order

1. Add `recoveryAttempts` to schema
2. Generate migration
3. Add `deleteCoolifyApplication` to coolify-deployment
4. Export `updateSlotDescription` from bot-pool-manager
5. Create `slot-recovery.ts` service
6. Update `releaseSlot` to reset attempts counter
7. Wire up job at server startup
8. Run lint/typecheck/build
