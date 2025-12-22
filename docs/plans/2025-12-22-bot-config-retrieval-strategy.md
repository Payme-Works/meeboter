# Bot Config Retrieval Strategy Pattern

**Date**: 2025-12-22
**Status**: Approved
**Extends**: 2025-12-22-kubernetes-bot-deployment-design.md

## Problem

Bot containers call `bots.pool.getSlot` with `POOL_SLOT_UUID` to fetch their configuration:
- **Coolify**: Uses pool slot's `applicationUuid` → works
- **K8s/ECS**: Sets `POOL_SLOT_UUID` to bot ID → no pool slot exists → fails

## Solution

Platform-aware bot config retrieval using separate env vars and endpoints.

## Design Decisions

1. **Separate env vars per platform** (explicit, backwards compatible)
   - `BOT_ID` for K8s/ECS (direct bot lookup)
   - `POOL_SLOT_UUID` for Coolify (pool slot lookup)

2. **New dedicated endpoint** for direct bot lookup
   - `bots.getConfig({ botId })` for K8s/ECS
   - `bots.pool.getSlot({ poolSlotUuid })` unchanged for Coolify

## Implementation

### Bot Bootstrap Logic

```typescript
// apps/bots/src/index.ts
const botId = env.BOT_ID;
const poolSlotUuid = env.POOL_SLOT_UUID;

let config: BotConfig;

if (botId) {
  // K8s/ECS: Direct lookup by bot ID
  console.log(`[INIT] Fetching bot config by ID: ${botId}`);
  config = await bootstrapTrpc.bots.getConfig.query({ botId: Number(botId) });
} else if (poolSlotUuid) {
  // Coolify: Pool slot lookup
  console.log(`[INIT] Fetching bot config for pool slot: ${poolSlotUuid}`);
  config = await bootstrapTrpc.bots.pool.getSlot.query({ poolSlotUuid });
} else {
  throw new Error("Either BOT_ID or POOL_SLOT_UUID must be set");
}
```

### New tRPC Endpoint

```typescript
// apps/milo/src/server/api/routers/bots.ts
getConfig: publicProcedure
  .input(z.object({ botId: z.number() }))
  .output(botConfigSchema)
  .query(async ({ input, ctx }) => {
    const bot = await ctx.db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, input.botId))
      .limit(1);

    if (!bot[0]) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Bot not found: ${input.botId}` });
    }

    // Prevent restarting finished bots
    if (["DONE", "FATAL"].includes(bot[0].status)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Bot ${input.botId} has already finished (status: ${bot[0].status})`,
      });
    }

    return { /* bot config fields */ };
  }),
```

### K8s Platform Service

```typescript
// kubernetes-platform-service.ts
// Change from POOL_SLOT_UUID to BOT_ID
{ name: "BOT_ID", value: botConfig.id.toString() },
```

## Files to Modify

| File | Change |
|------|--------|
| `apps/bots/src/config/env.ts` | Add `BOT_ID` optional env var |
| `apps/bots/src/index.ts` | Platform-aware config retrieval |
| `apps/milo/.../kubernetes-platform-service.ts` | Use `BOT_ID` env var |
| `apps/milo/.../routers/bots.ts` | Add `getConfig` endpoint |

## Backwards Compatibility

- **Coolify**: Unchanged (uses `POOL_SLOT_UUID` → `pool.getSlot`)
- **AWS ECS**: Can adopt `BOT_ID` → `getConfig` (future)
- **K8s**: Uses `BOT_ID` → `getConfig`
