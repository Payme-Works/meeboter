# Bot Pool Design

## Problem

Bot deployment takes 10+ minutes due to Coolify pulling the 7.5GB Docker image on every new application creation. At high scale (50+ concurrent bots), this latency is unacceptable.

## Solution

Implement a **Bot Pool** - pre-provisioned Coolify applications that reuse cached images. Slots are created lazily on first demand and reused for subsequent requests.

| Metric | Current | With Pool |
|--------|---------|-----------|
| First bot (new slot) | ~7 min | ~7 min |
| Subsequent bots | ~7 min | **~30 sec** |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Bot Pool (max 100 slots)               │
├─────────────────────────────────────────────────────────┤
│  [IDLE]  [IDLE]  [BUSY]  [IDLE]  [BUSY]  ...           │
│  pool-001 pool-002 pool-003 pool-004 pool-005          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Pool Manager                          │
│  - Acquire idle slots (with locking)                   │
│  - Create new slots on demand (lazy init)              │
│  - Release slots when bots complete                    │
│  - Queue requests when pool exhausted                  │
│  - Sync status to Coolify app description              │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### bot_pool_slots

Tracks pool slot state and assignment.

```sql
CREATE TABLE bot_pool_slots (
  id SERIAL PRIMARY KEY,
  coolify_service_uuid VARCHAR(255) NOT NULL UNIQUE,
  slot_name VARCHAR(255) NOT NULL,            -- "pool-google-meet-001" to "pool-google-meet-100"
  status VARCHAR(50) NOT NULL DEFAULT 'idle', -- "idle", "busy", "error"
  assigned_bot_id INTEGER REFERENCES bots(id),
  last_used_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bot_pool_slots_status ON bot_pool_slots(status);
```

### bot_pool_queue

Holds requests waiting for available slots.

```sql
CREATE TABLE bot_pool_queue (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES bots(id),
  priority INTEGER NOT NULL DEFAULT 100,
  queued_at TIMESTAMP DEFAULT NOW(),
  timeout_at TIMESTAMP NOT NULL,
  UNIQUE(bot_id)
);

CREATE INDEX idx_bot_pool_queue_priority ON bot_pool_queue(priority, queued_at);
```

## Pool Slot Statuses

| Status | Description |
|--------|-------------|
| `idle` | Ready for assignment, container stopped |
| `busy` | Assigned to a bot, container running |
| `error` | Something went wrong, needs attention |

## API Changes

### createBot Request

```typescript
createBot({
  meetingUrl: string,
  botDisplayName: string,
  // ... existing fields
  queueTimeoutMs?: number  // Default: 300000 (5 min), Max: 600000 (10 min)
})
```

### createBot Response

```typescript
{
  bot: Bot,
  queuePosition?: number,   // If queued: position in line
  estimatedWaitMs?: number  // If queued: estimated wait time
}
```

### New Bot Status

Add `"QUEUED"` to existing bot statuses - indicates bot is waiting for a pool slot.

## Core Operations

### acquireOrCreateSlot

```typescript
async function acquireOrCreateSlot(botId: number): Promise<PoolSlot | null> {
  // 1. Try to get existing idle slot (atomic with FOR UPDATE SKIP LOCKED)
  const idleSlot = await acquireIdleSlot(botId);
  if (idleSlot) return idleSlot;

  // 2. Check if we can grow the pool
  const currentPoolSize = await getPoolSize();
  if (currentPoolSize < MAX_POOL_SIZE) {
    return await createAndAcquireNewSlot(botId);
  }

  // 3. Pool at max capacity - must queue
  return null;
}
```

### Atomic Slot Acquisition

```sql
UPDATE bot_pool_slots
SET status = 'busy', assigned_bot_id = $1, last_used_at = NOW()
WHERE id = (
  SELECT id FROM bot_pool_slots
  WHERE status = 'idle'
  ORDER BY last_used_at ASC NULLS FIRST
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

### releaseSlot

```typescript
async function releaseSlot(botId: number): Promise<void> {
  // 1. Find slot assigned to this bot
  // 2. Stop the Coolify container
  // 3. Mark slot "idle", clear assigned_bot_id
  // 4. Update Coolify description: [IDLE] Available
  // 5. Check queue for waiting bots, assign if any
}
```

### updateSlotDescription

Keep pool status visible in Coolify UI.

```typescript
async function updateSlotDescription(uuid: string, status: string, botId?: number) {
  const description = botId
    ? `[${status.toUpperCase()}] Bot #${botId} - ${new Date().toISOString()}`
    : `[${status.toUpperCase()}] Available - Last used: ${new Date().toISOString()}`;

  await fetch(`${env.COOLIFY_API_URL}/applications/${uuid}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}
```

**Coolify UI displays:**
```
pool-google-meet-001  [BUSY] Bot #123 - 2025-12-16T21:30:00Z
pool-google-meet-002  [IDLE] Available - Last used: 2025-12-16T20:15:00Z
pool-google-meet-003  [ERROR] Container crashed - 2025-12-16T21:00:00Z
```

## Request Flow

### Bot Creation

```
Request arrives
    │
    ▼
Create bot record (status: "PENDING")
    │
    ▼
Try acquire idle slot ──────────────────────┐
    │                                       │
    │ No idle slot                    Found slot
    ▼                                       │
Pool < 100? ─────────────────┐              │
    │                        │              │
   Yes                      No              │
    │                        │              │
    ▼                        ▼              │
Create new slot        Add to queue         │
(~7 min, one-time)     status: "QUEUED"     │
    │                        │              │
    └────────────────────────┴──────────────┘
                             │
                             ▼
              Update env vars (BOT_DATA)
              Update description: [BUSY]
              Start container
              status: "JOINING_CALL"
                             │
                             ▼
                      Return bot
```

### Bot Completion

```
Bot finishes/crashes
    │
    ▼
Stop Coolify container
Mark slot: status='idle'
Update description: [IDLE]
    │
    ▼
Check queue for waiting bots
    │
    ├── Queue empty → Slot stays idle
    │
    └── Waiting bot found → Assign slot, start bot
```

## Configuration

| Parameter | Value | Description |
|-----------|-------|-------------|
| MAX_POOL_SIZE | 100 | Maximum pool slots |
| DEFAULT_QUEUE_TIMEOUT | 300000 | Default queue wait (5 min) |
| MAX_QUEUE_TIMEOUT | 600000 | Maximum queue wait (10 min) |
| POLL_INTERVAL | 1000 | Queue polling interval (1 sec) |

## Scope

- **Included:** Google Meet bots only (100 slots)
- **Future:** Add Teams and Zoom pools as needed

## Files to Create/Modify

### New Files
- `apps/milo/src/server/database/schema/bot-pool.ts` - Schema definitions
- `apps/milo/src/server/api/services/bot-pool-manager.ts` - Pool manager logic
- `apps/milo/src/server/api/services/bot-pool-queue.ts` - Queue logic

### Modified Files
- `apps/milo/src/server/api/services/bot-deployment.ts` - Use pool instead of direct creation
- `apps/milo/src/server/api/routers/bots.ts` - Add queueTimeoutMs param, new statuses
- `apps/milo/src/server/database/schema/index.ts` - Export new tables

## Migration

```sql
-- Migration: Add bot pool tables
CREATE TABLE bot_pool_slots (
  id SERIAL PRIMARY KEY,
  coolify_service_uuid VARCHAR(255) NOT NULL UNIQUE,
  slot_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  assigned_bot_id INTEGER REFERENCES bots(id),
  last_used_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bot_pool_slots_status ON bot_pool_slots(status);

CREATE TABLE bot_pool_queue (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES bots(id),
  priority INTEGER NOT NULL DEFAULT 100,
  queued_at TIMESTAMP DEFAULT NOW(),
  timeout_at TIMESTAMP NOT NULL,
  UNIQUE(bot_id)
);

CREATE INDEX idx_bot_pool_queue_priority ON bot_pool_queue(priority, queued_at);
```
