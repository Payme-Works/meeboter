# Bots tRPC Procedures Rename Design

**Date:** 2025-12-19
**Status:** Implemented

## Goals

1. **Consistency** - Follow a consistent verb-first naming pattern
2. **Clarity** - Make names more descriptive of what they do
3. **Domain alignment** - Align with domain terminology
4. **Aesthetics** - Names that look and feel good
5. **Structure** - Organize related procedures under sub-routers

## Naming Convention

**Verb-first** pattern: `getConfig`, `sendHeartbeat`, `updateStatus`, etc.

## Procedure Renaming

| Current Name | New Name | Change Type |
|-------------|----------|-------------|
| `bots.getPoolSlot` | `bots.pool.getSlot` | Move to sub-router |
| `bots.reportEvent` | `bots.events.report` | Move to sub-router |
| `bots.updateBotStatus` | `bots.updateStatus` | Rename (remove redundant "Bot") |
| `bots.appendScreenshot` | `bots.addScreenshot` | Rename ("add" cleaner than "append") |
| `bots.heartbeat` | `bots.sendHeartbeat` | Rename (verb-first) |
| `chat.getNextQueuedMessage` | `bots.chat.dequeueMessage` | Move router + rename |

## New Router Structure

```
bots/
├── pool/
│   └── getSlot          # Get bot configuration from pool slot
├── events/
│   └── report           # Report bot lifecycle events
├── chat/
│   └── dequeueMessage   # Get and remove next queued chat message
├── updateStatus         # Update bot status (flat, common operation)
├── addScreenshot        # Add screenshot to bot data (flat)
└── sendHeartbeat        # Send heartbeat signal (flat)
```

## Implementation Steps

### 1. Backend Changes (apps/milo or server)

1. Create `pool` sub-router with `getSlot` procedure
2. Create `events` sub-router with `report` procedure
3. Create `chat` sub-router under bots with `dequeueMessage` procedure
4. Rename flat procedures:
   - `updateBotStatus` → `updateStatus`
   - `appendScreenshot` → `addScreenshot`
   - `heartbeat` → `sendHeartbeat`
5. Update router exports and merge sub-routers

### 2. Frontend/Client Changes (apps/bots)

Update all procedure calls in:
- `src/index.ts`
- `src/bot.ts`
- `src/services/bot-service.ts`
- `src/workers/heartbeat-worker.ts`
- `src/workers/message-queue-worker.ts`
- `providers/meet/src/bot.ts`
- `src/__mocks__/trpc.ts`

### 3. Documentation Updates

- Update `README.md`
- Update `DOCKER.md`

## Files to Modify

### Backend (server/milo)
- Router definition files for bots procedures
- Chat router (move to bots.chat)

### Bots App
- `src/index.ts` - 4 procedure calls
- `src/bot.ts` - 2 procedure calls
- `src/services/bot-service.ts` - 3 procedure calls
- `src/workers/heartbeat-worker.ts` - 1 procedure call
- `src/workers/message-queue-worker.ts` - 1 procedure call
- `providers/meet/src/bot.ts` - 1 procedure call
- `src/__mocks__/trpc.ts` - Mock definitions
- `README.md` - Documentation reference
- `DOCKER.md` - Documentation reference
