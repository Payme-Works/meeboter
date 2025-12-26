# Hybrid Infrastructure for Bot Deployments

**Date:** 2025-12-26
**Status:** Approved

## Overview

Support hybrid infrastructure for bot deployments with configurable limits per platform and priority-based failover.

## Requirements

- Support multiple deployment platforms simultaneously (K8s, AWS ECS, Coolify)
- Configurable capacity limits per platform via environment variables
- Priority ordering for platform selection
- Automatic failover on capacity exhaustion OR deployment failure
- Global queue when all platforms are exhausted
- Per-platform queue timeouts before trying next platform

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `PLATFORM_PRIORITY` | Comma-separated priority list | `k8s,aws,coolify` |

### Per-Platform Limits (Required for each platform in priority list)

| Variable | Description | Example |
|----------|-------------|---------|
| `K8S_BOT_LIMIT` | Max concurrent K8s bots | `30` |
| `AWS_BOT_LIMIT` | Max concurrent AWS bots | `100` |
| `COOLIFY_BOT_LIMIT` | Max concurrent Coolify bots | `50` |

### Per-Platform Queue Timeouts (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `K8S_QUEUE_TIMEOUT_MS` | `60000` | Wait time before trying next platform |
| `AWS_QUEUE_TIMEOUT_MS` | `30000` | Wait time before trying next platform |
| `COOLIFY_QUEUE_TIMEOUT_MS` | `300000` | Wait time before trying next platform |
| `GLOBAL_QUEUE_TIMEOUT_MS` | `600000` | Max total wait when all platforms exhausted |

### Example Configuration

```bash
# Priority order (first = highest priority)
PLATFORM_PRIORITY=k8s,aws,coolify

# Capacity limits
K8S_BOT_LIMIT=30
AWS_BOT_LIMIT=100
COOLIFY_BOT_LIMIT=50

# Queue timeouts (optional - defaults shown)
K8S_QUEUE_TIMEOUT_MS=60000
AWS_QUEUE_TIMEOUT_MS=30000
COOLIFY_QUEUE_TIMEOUT_MS=300000
GLOBAL_QUEUE_TIMEOUT_MS=600000
```

### Validation Rules

1. `PLATFORM_PRIORITY` is required and must not be empty
2. At least one platform in priority list must have a `*_BOT_LIMIT` configured
3. `local` is not allowed in `PLATFORM_PRIORITY` (production safety)
4. Platforms without a limit are skipped with a warning

## Removed Environment Variables

- `DEPLOYMENT_PLATFORM` - Replaced by `PLATFORM_PRIORITY`

## Backend Architecture

### HybridPlatformService

New coordinator service that manages multiple platforms:

```typescript
interface HybridPlatformService {
  // Tries platforms in priority order until one succeeds
  deployBot(botConfig: BotConfig): Promise<HybridDeployResult>

  // Routes to correct platform based on bot's deploymentPlatform
  stopBot(botId: number): Promise<void>

  // Aggregated stats across all platforms
  getCapacityStats(): Promise<PlatformCapacity[]>

  // Global queue operations
  getQueuedBots(): Promise<QueuedBot[]>
  processQueue(): Promise<void>
}
```

### Deployment Flow

```
deployBot(config)
    │
    ├─ For each platform in PLATFORM_PRIORITY:
    │   │
    │   ├─ Check capacity: SELECT COUNT(*) FROM bots
    │   │   WHERE deployment_platform = 'k8s'
    │   │   AND status IN ('DEPLOYING', 'IN_CALL', ...)
    │   │
    │   ├─ If under limit:
    │   │   ├─ Try deploy on this platform
    │   │   ├─ If success → return result
    │   │   └─ If failure → try next platform
    │   │
    │   └─ If at limit:
    │       ├─ Wait up to platform timeout (K8S_QUEUE_TIMEOUT_MS)
    │       └─ If still at limit → try next platform
    │
    └─ All platforms exhausted:
        ├─ Add to global queue
        └─ Wait up to GLOBAL_QUEUE_TIMEOUT_MS
```

### Capacity Tracking

- Real-time database query per platform
- Count active bots with `deploymentPlatform = '<platform>'` and active status
- Index on `deployment_platform` column for performance

## Database Schema

### New Table: `deployment_queue`

Replaces Coolify-specific `bot_pool_queue` with a global queue:

```typescript
// schema/deployment-queue.ts
export const deploymentQueueTable = pgTable("deployment_queue", {
  id: serial("id").primaryKey(),
  botId: integer("bot_id").references(() => botsTable.id).notNull(),
  priority: integer("priority").default(0).notNull(),
  queuedAt: timestamp("queued_at").defaultNow().notNull(),
  timeoutAt: timestamp("timeout_at").notNull(),
  status: varchar("status", { length: 20 }).default("WAITING").notNull(),
}, (table) => ({
  botIdIdx: index("deployment_queue_bot_id_idx").on(table.botId),
  statusIdx: index("deployment_queue_status_idx").on(table.status),
}));
```

### Migration

```sql
-- Migration: 0018_hybrid_platform_support.sql

-- Create new global deployment queue
CREATE TABLE deployment_queue (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  queued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  timeout_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'WAITING'
);

CREATE INDEX deployment_queue_bot_id_idx ON deployment_queue(bot_id);
CREATE INDEX deployment_queue_status_idx ON deployment_queue(status);

-- Migrate existing Coolify queue entries
INSERT INTO deployment_queue (bot_id, priority, queued_at, timeout_at, status)
SELECT bot_id, priority, queued_at, timeout_at,
       CASE WHEN status = 'waiting' THEN 'WAITING' ELSE 'EXPIRED' END
FROM bot_pool_queue
WHERE status = 'waiting';
```

## tRPC API Changes

### New Endpoints

```typescript
// infrastructure/index.ts

// Get all active platforms with capacity stats
getActivePlatforms: publicProcedure.query(() => {
  // Returns: [{ platform: "k8s", used: 25, limit: 30, isHealthy: true }, ...]
})

// Get global queue stats
getQueueStats: publicProcedure.query(() => {
  // Returns: { total: 5, oldest: Date, avgWaitMs: 12000 }
})

// Get queued bots list
getQueuedBots: publicProcedure.query(() => {
  // Returns: [{ botId, botName, queuedAt, timeoutAt, position }]
})
```

### Modified Endpoints

```typescript
// getStats - now supports optional platform filter
getStats: publicProcedure
  .input(z.object({ platform: z.enum(["k8s", "aws", "coolify"]).optional() }))
  .query()

// getPlatform → getPlatforms (plural, returns array)
getPlatforms: publicProcedure.query()
```

### Types

```typescript
type PlatformCapacity = {
  platform: "k8s" | "aws" | "coolify";
  used: number;
  limit: number;
  queueTimeout: number;
  isHealthy: boolean;
};

type QueuedBot = {
  id: number;
  botId: number;
  botName: string;
  platform: string; // meeting platform (zoom, google-meet, etc.)
  queuedAt: Date;
  timeoutAt: Date;
  position: number;
};

type HybridDeployResult = {
  success: boolean;
  platform?: "k8s" | "aws" | "coolify";
  platformIdentifier?: string;
  queued?: boolean;
  queuePosition?: number;
  estimatedWaitMs?: number;
};
```

## Frontend Changes

### Infrastructure Page (`/infrastructure`)

| Component | Change |
|-----------|--------|
| **Layout** | Stacked collapsible sections per platform (all visible) |
| **Stats cards** | Per-platform rows (4 status cards each) |
| **Capacity** | Badge on section header: "K8s (25/30)" |
| **Queue section** | New table showing queued bots with position, wait time |

### Dashboard Card

| Component | Change |
|-----------|--------|
| **Platform section** | Show all active platforms in expandable section |
| **Queue badge** | Show "Queue: 5 bots waiting" when queue not empty |

### Bots Table

| Column | Change |
|--------|--------|
| **New "Infra" column** | Shows K8s/AWS/Coolify icon or badge per bot |

## Code Changes Summary

### Files to Create

- `apps/milo/src/server/api/services/hybrid-platform-service.ts`
- `apps/milo/src/server/database/schema/deployment-queue.ts`
- `apps/milo/drizzle/0018_hybrid_platform_support.sql`
- `apps/milo/src/app/infrastructure/_components/queue-table.tsx`

### Files to Modify

- `apps/milo/src/env.ts` - Add new env vars, remove `DEPLOYMENT_PLATFORM`
- `apps/milo/src/server/api/services/index.ts` - Use HybridPlatformService
- `apps/milo/src/server/api/services/bot-deployment-service.ts` - Use hybrid service
- `apps/milo/src/server/api/routers/infrastructure/index.ts` - New endpoints
- `apps/milo/src/app/infrastructure/page.tsx` - Multi-platform layout
- `apps/milo/src/app/infrastructure/_components/infrastructure-stats.tsx` - Per-platform rows
- `apps/milo/src/app/infrastructure/_components/infrastructure-table.tsx` - Stacked sections
- `apps/milo/src/app/_components/infrastructure-card.tsx` - Multi-platform + queue badge
- `apps/milo/src/app/bots/_components/bots-columns.tsx` - Add Infra column

### Files to Remove

- `apps/milo/src/server/api/services/platform/platform-factory.ts` - Replaced by HybridPlatformService
