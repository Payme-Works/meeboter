# Meeboter Architecture

> Comprehensive technical documentation for the Meeboter meeting bot platform

**Last Updated:** December 2024 (Image Pull Lock added)
**Status:** Production (Coolify-hosted)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Bot Package Architecture](#2-bot-package-architecture)
3. [Infrastructure Architecture](#3-infrastructure-architecture)
4. [Bot Pool System](#4-bot-pool-system)
5. [Request Flows](#5-request-flows)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Deployment & CI/CD](#8-deployment--cicd)
9. [Future Enhancements](#9-future-enhancements)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. System Overview

### What is Meeboter?

Meeboter is a meeting bot platform that joins video conferences (Google Meet, Microsoft Teams, Zoom) to record meetings, capture transcripts, and report events in real-time.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Application                                │
│                         (Web Dashboard / API Client)                         │
└─────────────────────────────────────────────────────────┬───────────────────┘
                                                          │
                                                    tRPC / REST API
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Meeboter Server                                   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   tRPC API   │  │  Bot Pool    │  │   Auth       │  │  Storage     │    │
│  │   Router     │  │  Manager     │  │  (better-    │  │  (S3/MinIO)  │    │
│  │              │  │              │  │   auth)      │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                           │                                                  │
└───────────────────────────┼──────────────────────────────────────────────────┘
                            │ Coolify API
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Bot Pool (Coolify Applications)                      │
│                                                                              │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       ┌─────────────┐  │
│   │  pool-001   │  │  pool-002   │  │  pool-003   │  ...  │  pool-100   │  │
│   │   [BUSY]    │  │   [IDLE]    │  │   [BUSY]    │       │   [IDLE]    │  │
│   │  Bot #123   │  │  Available  │  │  Bot #456   │       │  Available  │  │
│   └─────────────┘  └─────────────┘  └─────────────┘       └─────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Video Conference Platforms                            │
│                                                                              │
│         Google Meet            Microsoft Teams              Zoom             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Server | Next.js + tRPC | API endpoints, authentication, bot orchestration |
| Database | PostgreSQL | Bot state, user data, subscriptions |
| Storage | MinIO (S3-compatible) | Meeting recordings |
| Bot Runtime | Docker containers | Puppeteer-based meeting bots |
| Orchestration | Coolify | Container management, deployment |
| Bot Pool | Custom implementation | Reusable bot slots for fast deployment |
| Image Pull Lock | In-memory coordination | Prevents redundant parallel image pulls |

---

## 2. Bot Package Architecture

The `@meeboter/bots` package implements platform-specific meeting bots using a **strategy pattern**. Each bot runs as an isolated Docker container that joins meetings, records audio/video, and reports status to the backend.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Bot Factory                                 │
│                       (bot-factory.ts)                               │
│  Creates platform-specific bot based on config.meetingInfo.platform  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  GoogleMeetBot   │    │ MicrosoftTeamsBot│    │     ZoomBot      │
│  (Playwright)    │    │   (Puppeteer)    │    │   (Puppeteer)    │
└──────────────────┘    └──────────────────┘    └──────────────────┘
          │                        │                        │
          └────────────────────────┼────────────────────────┘
                                   ▼
                        ┌──────────────────┐
                        │   Abstract Bot   │
                        │   (bot.ts)       │
                        └──────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **Bot Factory** | Creates platform-specific bot instances with dynamic imports |
| **Abstract Bot** | Base class defining the bot contract (join, run, cleanup) |
| **Platform Providers** | Google Meet (Playwright), Teams/Zoom (Puppeteer) implementations |
| **Workers** | Background heartbeat, duration monitoring, chat message queue |
| **Logger** | Structured logging with breadcrumbs, screenshots, and streaming |
| **S3 Service** | Upload recordings and screenshots to S3-compatible storage |

### Docker Images

| Image | Base | Size |
|-------|------|------|
| `meeboter-google-meet-bot` | Playwright (Ubuntu) | ~4GB |
| `meeboter-microsoft-teams-bot` | Node.js Alpine | ~1.7GB |
| `meeboter-zoom-bot` | Node.js Alpine | ~1.7GB |

> **Full Documentation:** See [`apps/bots/ARCHITECTURE.md`](apps/bots/ARCHITECTURE.md) for detailed component documentation, lifecycle flows, and implementation guides.

---

## 3. Infrastructure Architecture

### Coolify-Based Deployment

Meeboter runs entirely on Coolify, a self-hosted platform-as-a-service. This provides:

- **Single management plane** - All services visible in one UI
- **Automatic SSL** - Let's Encrypt certificates via Traefik
- **Zero AWS dependency** - Fully self-hosted

### Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                      meeboter-network                            │
│                                                                  │
│   ┌──────────────┐                      ┌──────────────┐        │
│   │  PostgreSQL  │◄────────────────────►│    MinIO     │        │
│   │   (DB)       │                      │  (Storage)   │        │
│   └──────┬───────┘                      └──────┬───────┘        │
│          │                                     │                 │
│          │         ┌──────────────┐            │                 │
│          └────────►│   Server     │◄───────────┘                 │
│                    │  (Next.js)   │                              │
│                    └──────┬───────┘                              │
│                           │                                      │
│              Coolify API  │ (spawn/stop bots)                    │
│                           ▼                                      │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐      │
│   │ Bot 001 │  │ Bot 002 │  │ Bot 003 │  ...  │ Bot 100 │      │
│   └─────────┘  └─────────┘  └─────────┘       └─────────┘      │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                         Traefik (reverse proxy)
                               │
                         HTTPS (Let's Encrypt)
                               │
                           Internet
```

### Services Overview

| Service | Type | Port | Domain |
|---------|------|------|--------|
| PostgreSQL | One-click | 5432 | Internal only |
| MinIO | One-click | 9000/9001 | minio.yourdomain.com |
| Meeboter Server | Docker Image | 3000 | meeboter.yourdomain.com |
| Bot Containers | Dynamic | - | Internal only |

---

## 4. Bot Pool System

### Problem Statement

Creating a new Coolify application for each bot takes **7+ minutes** due to:
1. Docker image pull (~7.5GB image)
2. Container initialization
3. Network configuration

At high scale (50+ concurrent bots), this latency is unacceptable.

### Solution: Pre-Provisioned Pool

The bot pool maintains reusable Coolify applications. Once an image is cached on the server, subsequent bot deployments take **~30 seconds**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Bot Pool (max 100 slots)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  [IDLE]        [IDLE]        [BUSY]        [IDLE]        [BUSY]     ...    │
│  pool-google-meet-001 pool-google-meet-002 pool-google-meet-003 pool-teams-001 pool-zoom-001 │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Pool Manager                               │
│                                                                  │
│  • Acquire idle slots (with database locking)                   │
│  • Create new slots on demand (lazy initialization)             │
│  • Release slots when bots complete                             │
│  • Queue requests when pool exhausted                           │
│  • Sync status to Coolify app description                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pool Slot States

| State | Description | Container | Assignable |
|-------|-------------|-----------|------------|
| `idle` | Ready for assignment | Stopped | Yes |
| `deploying` | Starting up for a bot | Starting | No |
| `busy` | Running a bot | Running | No |
| `error` | Failed state | Unknown | No |

**State Transitions:**
```
idle → deploying (on acquire/create) → busy (when container starts) → idle (on release)
              ↓                                ↓
           error                            error
```

### Performance Comparison

| Scenario | Without Pool | With Pool |
|----------|--------------|-----------|
| First bot (new slot) | ~7 min | ~7 min |
| Subsequent bots | ~7 min | **~30 sec** |
| Pool exhausted | N/A | Queued + wait |

### Image Pull Lock

When multiple bots of the same platform are deployed simultaneously, each would trigger a separate Docker image pull for the same image. The **Image Pull Lock** service coordinates these pulls to prevent redundant parallel downloads.

> **Design Document:** [`docs/plans/2025-01-19-image-pull-lock-design.md`](docs/plans/2025-01-19-image-pull-lock-design.md)

**Problem:**
```
Bot A (google-meet) → createSlot() → image pull starts (~30-60s)
Bot B (google-meet) → createSlot() → image pull starts (duplicate!)
Bot C (google-meet) → createSlot() → image pull starts (duplicate!)

Bandwidth: 3x image size
```

**Solution:**
```
Bot A (google-meet) → createSlot() → image pull starts
Bot B (google-meet) → waits for A's pull...
Bot C (google-meet) → waits for A's pull...
                      ↓
              A's pull completes (image cached)
                      ↓
Bot B → createSlot() → uses cached image (fast!)
Bot C → createSlot() → uses cached image (fast!)

Bandwidth: 1x image size
```

**Implementation:**
- Uses in-memory `Map<string, Promise>` keyed by `platform:imageTag`
- First deployment acquires lock, subsequent deployments wait
- Lock released on success or failure
- Different platforms can pull in parallel (separate keys)

**Key Files:**
| File | Purpose |
|------|---------|
| `image-pull-lock-service.ts` | Lock coordination service |
| `bot-pool-service.ts` | Uses lock in `createAndAcquireNewSlot()` |

### Slot Recovery

Slots in `error` state or stuck in `deploying` state are unusable, reducing pool capacity. The **Slot Recovery** background job attempts to recover these slots by stopping and resetting them.

> **Design Documents:**
> - [`docs/plans/2025-12-16-error-slot-recovery-design.md`](docs/plans/2025-12-16-error-slot-recovery-design.md)
> - [`docs/plans/2025-12-17-deploying-slot-status-design.md`](docs/plans/2025-12-17-deploying-slot-status-design.md)

**Implementation Details:**
| Component | Description |
|-----------|-------------|
| `slot-recovery.ts` | Background job service with `startSlotRecoveryJob()` |
| `recoveryAttempts` column | Tracks attempts per slot (schema + migration) |
| `db.ts` | Starts job in production via global flag pattern |

**Key Decisions:**
| Decision | Choice |
|----------|--------|
| Attempt tracking | `recoveryAttempts` integer column |
| Job scheduling | `setInterval` in server process (5 min) |
| Recovery action | Stop container → Reset to idle |
| Max attempts exceeded | Delete slot from DB + Coolify (pool self-heals) |

**Configuration:**
| Parameter | Default |
|-----------|---------|
| Recovery interval | 5 minutes |
| Max recovery attempts | 3 |

**Migration:** `drizzle/0008_minor_ravenous.sql`

### Queue System

When all 100 slots are busy, new requests enter a priority queue:

```
┌─────────────────────────────────────────────────────────────────┐
│                       Bot Queue                                  │
│                                                                  │
│  Priority: 100 (normal) | Lower = Higher Priority               │
│                                                                  │
│  ┌──────────────┬──────────────┬──────────────┬───────────────┐ │
│  │  Bot #789    │  Bot #790    │  Bot #791    │  Bot #792     │ │
│  │  Priority: 50│  Priority:100│  Priority:100│  Priority:100 │ │
│  │  Wait: 30s   │  Wait: 60s   │  Wait: 90s   │  Wait: 120s   │ │
│  └──────────────┴──────────────┴──────────────┴───────────────┘ │
│                                                                  │
│  Timeout: Configurable per request (default: 5 min, max: 10 min)│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Atomic Slot Acquisition

Uses PostgreSQL `FOR UPDATE SKIP LOCKED` for concurrent-safe slot assignment:

```sql
UPDATE bot_pool_slots
SET status = 'busy',
    "assignedBotId" = $1,
    "lastUsedAt" = NOW()
WHERE id = (
    SELECT id FROM bot_pool_slots
    WHERE status = 'idle'
    ORDER BY "lastUsedAt" ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

This ensures:
- No two requests get the same slot
- Locked rows are skipped (no blocking)
- LRU selection (least recently used slot first)

### Coolify Integration

Pool status is synced to Coolify application descriptions:

```
pool-google-meet-001   [DEPLOYING] Bot #123 - Starting container...
pool-google-meet-002   [BUSY] Bot #456 - 2025-12-16T21:30:00Z
pool-google-meet-003   [IDLE] Available - Last used: 2025-12-16T20:15:00Z
pool-teams-001         [ERROR] Container crashed - 2025-12-16T21:00:00Z
```

---

## 5. Request Flows

### Bot Creation Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Bot Creation Flow                                    │
└──────────────────────────────────────────────────────────────────────────────┘

Request arrives (createBot)
    │
    ▼
┌─────────────────────────────┐
│ Validate subscription/limits │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Create bot record in DB      │
│ Status: "DEPLOYING"          │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Should deploy immediately?   │ (startTime within 5 min?)
└─────────────────────────────┘
    │
    ├── No ──► Return bot (scheduled for later)
    │
    └── Yes
         │
         ▼
┌─────────────────────────────┐
│ Try acquire idle slot        │
└─────────────────────────────┘
    │
    ├── Found slot ─────────────────────────────────────┐
    │                                                    │
    └── No idle slot                                     │
         │                                               │
         ▼                                               │
    ┌─────────────────────────────┐                     │
    │ Pool size < 100?             │                     │
    └─────────────────────────────┘                     │
         │                                               │
         ├── Yes                                         │
         │    │                                          │
         │    ▼                                          │
         │   ┌─────────────────────────────┐            │
         │   │ Create new slot (~7 min)    │            │
         │   │ Pull image, configure       │            │
         │   └─────────────────────────────┘            │
         │    │                                          │
         │    └──────────────────────────────────────────┤
         │                                               │
         └── No (pool exhausted)                        │
              │                                          │
              ▼                                          │
         ┌─────────────────────────────┐                │
         │ Add to queue                 │                │
         │ Return: queuePosition,       │                │
         │         estimatedWaitMs      │                │
         └─────────────────────────────┘                │
                                                         │
         ◄───────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │ Configure slot               │
                    │ • Assign bot to slot in DB  │
                    │ • Update description [BUSY] │
                    └─────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │ Start container              │
                    │ Status: "JOINING_CALL"       │
                    └─────────────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │ Return bot with slot info    │
                    └─────────────────────────────┘
```

### Bot Lifecycle Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Bot Lifecycle Flow                                   │
└──────────────────────────────────────────────────────────────────────────────┘

      DEPLOYING
         │
         │ Container starts
         ▼
    JOINING_CALL ◄──────────────────────────────────────┐
         │                                               │
         │ Bot joins meeting                             │
         ▼                                               │
    IN_WAITING_ROOM ─────► (timeout) ──────────────────►│
         │                                               │
         │ Admitted to meeting                           │
         ▼                                               │
      IN_CALL ────────────► (everyone leaves) ─────────►│
         │    │                                          │
         │    │ Recording                                │
         │    ▼                                          │
         │  RECORDING                                    │
         │    │                                          │
         │    │ Meeting ends                             │
         ▼    ▼                                          │
       DONE ◄──────────────────────────────────────────┘
         │                                    │
         │                                    │
         ▼                                    ▼
    Release slot                           FATAL
    Process queue                       (on error)
```

### Slot Release Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Slot Release Flow                                    │
└──────────────────────────────────────────────────────────────────────────────┘

Bot finishes (DONE or FATAL)
         │
         ▼
┌─────────────────────────────┐
│ Find slot by bot ID          │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Stop Coolify container       │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Mark slot as "idle"          │
│ Clear assignedBotId          │
│ Update description [IDLE]    │
└─────────────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Check queue for waiting bots │
└─────────────────────────────┘
         │
         ├── Queue empty ──► Slot stays idle
         │
         └── Waiting bot found
              │
              ▼
         ┌─────────────────────────────┐
         │ Assign slot to queued bot   │
         │ Configure & start           │
         │ Remove from queue           │
         └─────────────────────────────┘
```

---

## 6. Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Database Schema                                    │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐         ┌──────────────────┐
    │    user      │         │   subscription   │
    ├──────────────┤         ├──────────────────┤
    │ id           │◄────────│ userId           │
    │ name         │    1:1  │ plan             │
    │ email        │         │ dailyBotLimit    │
    │ ...          │         │ ...              │
    └──────┬───────┘         └──────────────────┘
           │
           │ 1:N
           ▼
    ┌──────────────┐         ┌──────────────────┐
    │    bots      │         │ bot_pool_slots   │
    ├──────────────┤         ├──────────────────┤
    │ id           │◄────────│ assignedBotId    │
    │ userId       │    N:1  │ coolifyServiceUuid│
    │ status       │         │ slotName         │
    │ meetingInfo  │         │ status           │
    │ coolifyUuid  │         │ lastUsedAt       │
    │ ...          │         │ errorMessage     │
    └──────┬───────┘         └──────────────────┘
           │
           │ 1:N
           ▼
    ┌──────────────┐         ┌──────────────────┐
    │   events     │         │ bot_pool_queue   │
    ├──────────────┤         ├──────────────────┤
    │ id           │         │ id               │
    │ botId        │         │ botId ───────────┼──► bots.id
    │ type         │         │ priority         │
    │ payload      │         │ queuedAt         │
    │ timestamp    │         │ timeoutAt        │
    └──────────────┘         └──────────────────┘
```

### Key Tables

#### `bots`

Primary table for bot instances.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `userId` | TEXT | Owner user ID |
| `status` | ENUM | Current state (see below) |
| `meetingInfo` | JSONB | Meeting URL, platform, etc. |
| `coolifyServiceUuid` | TEXT | Assigned pool slot UUID |
| `recording` | TEXT | S3 key for recording |
| `deploymentError` | TEXT | Error message if FATAL |

**Status Values:**
- `DEPLOYING` - Container starting
- `JOINING_CALL` - Bot joining meeting
- `IN_WAITING_ROOM` - Waiting to be admitted
- `IN_CALL` - Active in meeting
- `RECORDING` - Recording in progress
- `DONE` - Completed successfully
- `FATAL` - Failed with error

#### `bot_pool_slots`

Tracks pool slot state and assignment.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `coolifyServiceUuid` | VARCHAR(255) | Coolify app UUID |
| `slotName` | VARCHAR(255) | Human name (pool-google-meet-001) |
| `status` | VARCHAR(50) | idle, busy, error |
| `assignedBotId` | INTEGER | Currently assigned bot |
| `lastUsedAt` | TIMESTAMP | For LRU selection |
| `errorMessage` | TEXT | Error details |

#### `bot_pool_queue`

Holds requests waiting for available slots.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `botId` | INTEGER | Waiting bot ID |
| `priority` | INTEGER | Lower = higher priority |
| `queuedAt` | TIMESTAMP | When added to queue |
| `timeoutAt` | TIMESTAMP | Auto-fail deadline |

---

## 7. API Reference

### Bot Endpoints

#### Create Bot

```typescript
POST /api/trpc/bots.createBot

Input:
{
  meetingInfo: {
    platform: "google-meet" | "microsoft-teams" | "zoom",
    meetingUrl: string,
    meetingId?: string,
    password?: string
  },
  botDisplayName?: string,
  botImage?: string,
  startTime?: string,      // ISO 8601
  endTime?: string,
  recordingEnabled?: boolean,
  queueTimeoutMs?: number  // 0-600000 (max 10 min)
}

Output:
{
  id: number,
  status: string,
  // ... bot fields
  queued?: boolean,          // true if waiting for slot
  queuePosition?: number,    // position in queue (1-indexed)
  estimatedWaitMs?: number   // estimated wait time
}
```

#### Deploy Bot

```typescript
POST /api/trpc/bots.deployBot

Input:
{
  id: string,
  queueTimeoutMs?: number
}

Output:
{
  // ... bot fields
  queued?: boolean,
  queuePosition?: number,
  estimatedWaitMs?: number
}
```

#### Update Bot Status

```typescript
PATCH /api/trpc/bots.updateBotStatus

Input:
{
  id: string,
  status: BotStatus,
  recording?: string,           // S3 key when DONE
  speakerTimeframes?: array
}
```

### Monitoring Endpoints

#### Pool Statistics

```typescript
GET /api/trpc/bots.getPoolStats

Output:
{
  total: number,     // Total slots created
  idle: number,      // Available slots
  busy: number,      // In-use slots
  error: number,     // Failed slots
  maxSize: number    // Maximum pool size (100)
}
```

#### Queue Statistics

```typescript
GET /api/trpc/bots.getQueueStats

Output:
{
  length: number,           // Bots waiting
  oldestQueuedAt: Date,     // Longest wait
  avgWaitMs: number         // Average wait time
}
```

---

## 8. Deployment & CI/CD

### GitHub Actions Workflow

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - name: milo
            dockerfile: apps/milo/Dockerfile
          - name: google-meet-bot
            dockerfile: apps/bots/providers/google-meet/Dockerfile
          # ... teams-bot, zoom-bot

    steps:
      - uses: actions/checkout@v4

      - name: Build and push to GHCR
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository_owner }}/meeboter-${{ matrix.name }}:latest
```

### Image Registry

All images are stored in GitHub Container Registry (ghcr.io):

```
ghcr.io/payme-works/meeboter-milo:latest
ghcr.io/payme-works/meeboter-google-meet-bot:latest
ghcr.io/payme-works/meeboter-microsoft-teams-bot:latest
ghcr.io/payme-works/meeboter-zoom-bot:latest
```

### Environment Variables

#### Server

```bash
# Database
DATABASE_URL=postgresql://user:pass@postgres:5432/meeboter

# Coolify API (for bot spawning)
COOLIFY_API_URL=https://coolify.yourdomain.com/api/v1
COOLIFY_API_TOKEN=your-token
COOLIFY_PROJECT_UUID=project-uuid
COOLIFY_SERVER_UUID=server-uuid
COOLIFY_DESTINATION_UUID=destination-uuid

# Storage (S3-compatible)
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=your-key
S3_SECRET_KEY=your-secret
S3_BUCKET_NAME=meeboter-recordings

# Bot images
GHCR_ORG=payme-works
```

#### Bot Containers

```bash
POOL_SLOT_UUID=<coolify-service-uuid>  # Used to fetch bot config from API
MILO_URL=https://meeboter.yourdomain.com  # Bootstrap URL for initial API call
MILO_AUTH_TOKEN=server-auth-token
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

Note: Bot containers fetch their configuration from the `getPoolSlot` API endpoint on startup. The `MILO_URL` env var is set during container deployment and used for all tRPC calls.

---

## 9. Future Enhancements

### Enhancement Summary

| Priority | Enhancement | Effort | Impact | Status |
|----------|-------------|--------|--------|--------|
| **High** | Pool Pre-Warming | Medium | Eliminates cold-start latency | Planned |
| **High** | Background Queue Processor | Medium | Faster queue processing | Planned |
| **Medium** | Multi-Platform Pools | High | Platform isolation | Planned |
| **Medium** | Pool Auto-Scaling | High | Cost optimization | Planned |
| **Medium** | Health Monitoring Dashboard | Medium | Operational visibility | Planned |
| **Medium** | Webhook Notifications | Low | Real-time status updates | Planned |
| **Medium** | Priority Queue Tiers | Low | SLA differentiation | Planned |
| **Low** | Slot Affinity | Low | Minor performance gains | Planned |
| **Low** | Geographic Distribution | Very High | Global scale | Planned |
| **Low** | Recording Transcoding | Medium | Storage optimization | Planned |
| **Low** | Scheduled Maintenance | Medium | Proactive health | Planned |

> **Note:** Implemented features (Slot Recovery, Image Pull Lock) have been moved to their respective sections in [Bot Pool System](#3-bot-pool-system).

---

### High Priority

#### 1. Pool Pre-Warming

**Problem:** First bot deployment takes ~7 minutes due to Docker image pull.

**Solution:** Create N idle slots at system startup, ensuring images are cached.

**Implementation:**

```typescript
// services/pool-prewarm.ts
import { env } from "@/env";

const PREWARM_COUNT = Number(env.POOL_PREWARM_COUNT) || 5;
const PREWARM_PLATFORMS = ["google"]; // Start with Meet only

export async function prewarmPool(db: Database): Promise<void> {
  console.log(`[Pool] Pre-warming ${PREWARM_COUNT} slots...`);

  for (const platform of PREWARM_PLATFORMS) {
    const existingSlots = await db
      .select({ count: sql<number>`count(*)` })
      .from(botPoolSlotsTable)
      .where(like(botPoolSlotsTable.slotName, `%${platform}%`));

    const existing = Number(existingSlots[0]?.count ?? 0);
    const toCreate = Math.max(0, PREWARM_COUNT - existing);

    if (toCreate === 0) {
      console.log(`[Pool] Platform ${platform} already has ${existing} slots`);
      continue;
    }

    console.log(`[Pool] Creating ${toCreate} pre-warm slots for ${platform}`);

    // Create slots sequentially to avoid overwhelming Coolify
    for (let i = 0; i < toCreate; i++) {
      try {
        await createPrewarmSlot(platform, db);
        console.log(`[Pool] Created pre-warm slot ${i + 1}/${toCreate}`);
      } catch (error) {
        console.error(`[Pool] Failed to create pre-warm slot:`, error);
      }
    }
  }

  console.log(`[Pool] Pre-warming complete`);
}

async function createPrewarmSlot(platform: string, db: Database): Promise<void> {
  const image = getImageForPlatform(platform);
  const slotName = generateSlotName(platform, db);

  // Create Coolify application (pulls image)
  const uuid = await createCoolifyApplication(slotName, image, {});

  // Insert as idle slot
  await db.insert(botPoolSlotsTable).values({
    coolifyServiceUuid: uuid,
    slotName,
    status: "idle",
    assignedBotId: null,
  });
}
```

**Environment Variables:**

```bash
POOL_PREWARM_COUNT=5              # Slots to pre-warm per platform
POOL_PREWARM_ON_STARTUP=true      # Enable pre-warming
```

**Integration Point:** Call `prewarmPool()` from server startup in `src/index.ts`.

---

#### 2. Background Queue Processor

**Problem:** Queue only processes when slots are released, causing delays.

**Solution:** Dedicated background worker that continuously polls the queue.

**Implementation:**

```typescript
// services/queue-processor.ts
const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 5;

export async function startQueueProcessor(db: Database): Promise<void> {
  console.log("[Queue] Starting background processor");

  let isRunning = true;

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[Queue] Shutting down processor...");
    isRunning = false;
  });

  while (isRunning) {
    try {
      await processQueueBatch(db);
    } catch (error) {
      console.error("[Queue] Processing error:", error);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.log("[Queue] Processor stopped");
}

async function processQueueBatch(db: Database): Promise<void> {
  // Clean up timed-out entries first
  const timedOut = await cleanupTimedOutEntries(db);
  if (timedOut > 0) {
    console.log(`[Queue] Cleaned up ${timedOut} timed-out entries`);
  }

  // Get next batch of queued bots
  const queuedBots = await db
    .select()
    .from(botPoolQueueTable)
    .where(gt(botPoolQueueTable.timeoutAt, new Date()))
    .orderBy(botPoolQueueTable.priority, botPoolQueueTable.queuedAt)
    .limit(BATCH_SIZE);

  if (queuedBots.length === 0) return;

  // Try to deploy each queued bot
  for (const entry of queuedBots) {
    const slot = await acquireOrCreateSlot(entry.botId, db);

    if (!slot) {
      // No slots available, stop processing
      break;
    }

    // Deploy the bot
    try {
      await deployQueuedBot(entry, slot, db);
      console.log(`[Queue] Deployed bot ${entry.botId} to slot ${slot.slotName}`);
    } catch (error) {
      console.error(`[Queue] Failed to deploy bot ${entry.botId}:`, error);
      // Release slot on failure
      await releaseSlot(entry.botId, db);
    }
  }
}

async function deployQueuedBot(
  entry: QueueEntry,
  slot: PoolSlot,
  db: Database
): Promise<void> {
  // Get bot config
  const bot = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, entry.botId));

  if (!bot[0]) {
    await removeFromQueue(entry.botId, db);
    throw new Error(`Bot ${entry.botId} not found`);
  }

  // Configure and start slot
  const botConfig = buildBotConfig(bot[0]);
  await configureAndStartSlot(slot, botConfig, db);

  // Update bot status
  await db
    .update(botsTable)
    .set({
      status: "JOINING_CALL",
      coolifyServiceUuid: slot.coolifyServiceUuid,
    })
    .where(eq(botsTable.id, entry.botId));

  // Remove from queue
  await removeFromQueue(entry.botId, db);
}
```

---

### Medium Priority

#### 3. Multi-Platform Pools

**Current State:** Single pool supporting all platforms with mixed slots.

**Enhancement:** Separate pools per platform with independent sizing and images.

**Database Schema Changes:**

```sql
-- Add platform column to slots
ALTER TABLE bot_pool_slots ADD COLUMN platform VARCHAR(50) NOT NULL DEFAULT 'google-meet';
CREATE INDEX idx_bot_pool_slots_platform ON bot_pool_slots(platform);

-- Separate queue by platform
ALTER TABLE bot_pool_queue ADD COLUMN platform VARCHAR(50) NOT NULL DEFAULT 'google-meet';
```

**Implementation:**

```typescript
// config/pool-config.ts
export interface PlatformPoolConfig {
  platform: string;
  maxSize: number;
  image: string;
  prewarmCount: number;
  enabled: boolean;
}

export const POOL_CONFIGS: PlatformPoolConfig[] = [
  {
    platform: "google-meet",
    maxSize: 100,
    image: "meeboter-google-meet-bot",
    prewarmCount: 5,
    enabled: true,
  },
  {
    platform: "microsoft-teams",
    maxSize: 50,
    image: "meeboter-microsoft-teams-bot",
    prewarmCount: 3,
    enabled: true,
  },
  {
    platform: "zoom",
    maxSize: 50,
    image: "meeboter-zoom-bot",
    prewarmCount: 3,
    enabled: true,
  },
];

// services/multi-platform-pool.ts
export async function acquireSlotForPlatform(
  botId: number,
  platform: string,
  db: Database
): Promise<PoolSlot | null> {
  const config = POOL_CONFIGS.find((c) => c.platform === platform);
  if (!config || !config.enabled) {
    throw new Error(`Platform ${platform} not supported`);
  }

  // Try to acquire existing idle slot for this platform
  const slot = await acquireIdleSlot(botId, platform, db);
  if (slot) return slot;

  // Check platform-specific pool size
  const platformSize = await getPoolSizeForPlatform(platform, db);
  if (platformSize >= config.maxSize) {
    return null; // Must queue
  }

  // Create new slot for this platform
  return await createSlotForPlatform(botId, platform, config, db);
}
```

**API Changes:**
- Pool stats endpoint returns per-platform breakdown
- Queue stats show platform-specific queue depths

---

#### 4. Pool Auto-Scaling

**Concept:** Automatically adjust pool size based on utilization patterns.

**Implementation:**

```typescript
// services/auto-scaler.ts
interface ScalingConfig {
  minIdleSlots: number;      // Always keep N idle slots
  maxTotalSlots: number;     // Hard limit
  scaleUpThreshold: number;  // Scale up when utilization > X%
  scaleDownThreshold: number; // Scale down when utilization < X%
  scaleUpStep: number;       // Add N slots when scaling up
  scaleDownStep: number;     // Remove N slots when scaling down
  cooldownMinutes: number;   // Wait between scaling events
  evaluationPeriodMinutes: number; // Average utilization over N minutes
}

const DEFAULT_CONFIG: ScalingConfig = {
  minIdleSlots: 3,
  maxTotalSlots: 100,
  scaleUpThreshold: 0.8,
  scaleDownThreshold: 0.3,
  scaleUpStep: 5,
  scaleDownStep: 2,
  cooldownMinutes: 10,
  evaluationPeriodMinutes: 5,
};

export async function evaluateScaling(db: Database): Promise<ScalingDecision> {
  const stats = await getPoolStats(db);
  const utilization = stats.busy / stats.total;
  const idleCount = stats.idle;

  // Scale up conditions
  if (utilization > DEFAULT_CONFIG.scaleUpThreshold) {
    return {
      action: "scale_up",
      reason: `Utilization ${(utilization * 100).toFixed(1)}% > threshold`,
      slots: Math.min(
        DEFAULT_CONFIG.scaleUpStep,
        DEFAULT_CONFIG.maxTotalSlots - stats.total
      ),
    };
  }

  // Ensure minimum idle slots
  if (idleCount < DEFAULT_CONFIG.minIdleSlots) {
    return {
      action: "scale_up",
      reason: `Only ${idleCount} idle slots < minimum ${DEFAULT_CONFIG.minIdleSlots}`,
      slots: DEFAULT_CONFIG.minIdleSlots - idleCount,
    };
  }

  // Scale down conditions
  if (
    utilization < DEFAULT_CONFIG.scaleDownThreshold &&
    idleCount > DEFAULT_CONFIG.minIdleSlots + DEFAULT_CONFIG.scaleDownStep
  ) {
    return {
      action: "scale_down",
      reason: `Utilization ${(utilization * 100).toFixed(1)}% < threshold`,
      slots: DEFAULT_CONFIG.scaleDownStep,
    };
  }

  return { action: "none", reason: "Within normal parameters", slots: 0 };
}

async function scaleDown(count: number, db: Database): Promise<void> {
  // Only remove idle slots that haven't been used recently
  const oldestIdle = await db
    .select()
    .from(botPoolSlotsTable)
    .where(eq(botPoolSlotsTable.status, "idle"))
    .orderBy(asc(botPoolSlotsTable.lastUsedAt))
    .limit(count);

  for (const slot of oldestIdle) {
    await deleteCoolifyApplication(slot.coolifyServiceUuid);
    await db.delete(botPoolSlotsTable).where(eq(botPoolSlotsTable.id, slot.id));
    console.log(`[AutoScale] Removed slot ${slot.slotName}`);
  }
}
```

---

#### 5. Health Monitoring Dashboard

**Metrics to Expose:**

```typescript
// services/metrics.ts
import { Registry, Gauge, Counter, Histogram } from "prom-client";

const register = new Registry();

// Pool metrics
const poolSlotsTotal = new Gauge({
  name: "meeboter_pool_slots_total",
  help: "Total number of pool slots",
  labelNames: ["platform", "status"],
  registers: [register],
});

const poolUtilization = new Gauge({
  name: "meeboter_pool_utilization",
  help: "Pool utilization percentage",
  labelNames: ["platform"],
  registers: [register],
});

// Queue metrics
const queueDepth = new Gauge({
  name: "meeboter_queue_depth",
  help: "Number of bots waiting in queue",
  labelNames: ["platform"],
  registers: [register],
});

const queueWaitTime = new Histogram({
  name: "meeboter_queue_wait_seconds",
  help: "Time spent waiting in queue",
  labelNames: ["platform"],
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [register],
});

// Bot metrics
const botDeploymentDuration = new Histogram({
  name: "meeboter_bot_deployment_seconds",
  help: "Time to deploy a bot",
  labelNames: ["platform", "slot_type"], // slot_type: "existing" | "new"
  buckets: [5, 15, 30, 60, 120, 300, 600],
  registers: [register],
});

const botCompletionTotal = new Counter({
  name: "meeboter_bot_completions_total",
  help: "Total bot completions",
  labelNames: ["platform", "status"], // status: "done" | "fatal"
  registers: [register],
});

// Expose metrics endpoint
export function getMetrics(): Promise<string> {
  return register.metrics();
}
```

**Grafana Dashboard Panels:**
1. Pool Utilization (gauge)
2. Slots by Status (stacked bar: idle, deploying, busy, error)
3. Queue Depth Over Time (line)
4. Deployment Duration (histogram)
5. Bot Success Rate (percentage)
6. Slot Recovery Rate

---

#### 6. Webhook Notifications

**Events to Notify:**

```typescript
// services/webhooks.ts
type WebhookEvent =
  | "bot.queued"
  | "bot.deployed"
  | "bot.completed"
  | "bot.failed"
  | "pool.exhausted"
  | "queue.timeout";

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, unknown>;
}

async function sendWebhook(
  callbackUrl: string,
  payload: WebhookPayload
): Promise<void> {
  try {
    await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": payload.event,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`[Webhook] Failed to send ${payload.event}:`, error);
  }
}

// Example: Notify when bot is queued
async function notifyBotQueued(bot: Bot, queuePosition: number): Promise<void> {
  if (!bot.callbackUrl) return;

  await sendWebhook(bot.callbackUrl, {
    event: "bot.queued",
    timestamp: new Date().toISOString(),
    data: {
      botId: bot.id,
      queuePosition,
      estimatedWaitMs: queuePosition * 30000,
    },
  });
}
```

---

#### 7. Priority Queue Tiers

**Concept:** Different priority levels for different subscription tiers.

```typescript
// config/queue-priorities.ts
export const QUEUE_PRIORITIES = {
  enterprise: 10,   // Highest priority
  professional: 50,
  standard: 100,    // Default
  free: 200,        // Lowest priority
};

// When adding to queue
async function addToQueueWithPriority(
  botId: number,
  userId: string,
  db: Database
): Promise<number> {
  const subscription = await getUserSubscription(userId, db);
  const priority = QUEUE_PRIORITIES[subscription.plan] ?? QUEUE_PRIORITIES.standard;

  return await addToQueue(botId, DEFAULT_TIMEOUT, priority, db);
}
```

---

### Low Priority

#### 8. Slot Affinity

**Concept:** Prefer assigning bots to slots that previously ran the same platform.

**Benefit:** Docker layer caching, slightly faster container starts.

```typescript
async function acquireIdleSlotWithAffinity(
  botId: number,
  platform: string,
  db: Database
): Promise<PoolSlot | null> {
  // First, try to find a slot that previously ran this platform
  const affinitySlot = await db.execute(sql`
    UPDATE bot_pool_slots
    SET status = 'busy', "assignedBotId" = ${botId}
    WHERE id = (
      SELECT id FROM bot_pool_slots
      WHERE status = 'idle' AND platform = ${platform}
      ORDER BY "lastUsedAt" DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  if (affinitySlot.length > 0) return affinitySlot[0];

  // Fallback to any idle slot
  return await acquireIdleSlot(botId, db);
}
```

---

#### 9. Geographic Distribution

**Concept:** Deploy pool servers in multiple regions for lower latency.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Global Load Balancer                              │
│                     (Route by meeting location)                          │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   US-East       │    │   EU-West       │    │   APAC          │
│   Coolify       │    │   Coolify       │    │   Coolify       │
│   Pool: 50      │    │   Pool: 30      │    │   Pool: 20      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Implementation Considerations:**
- Shared database with read replicas
- MinIO replication across regions
- DNS-based routing by meeting URL domain

---

#### 10. Recording Transcoding Pipeline

**Concept:** Post-process recordings for optimal file sizes.

```typescript
// services/transcoding.ts
interface TranscodingJob {
  recordingKey: string;
  sourceFormat: string;
  targetFormats: string[];
}

async function processRecording(job: TranscodingJob): Promise<void> {
  // Download original from MinIO
  const original = await downloadFromMinio(job.recordingKey);

  for (const format of job.targetFormats) {
    // Transcode with FFmpeg
    const transcoded = await transcode(original, format);

    // Upload transcoded version
    const key = job.recordingKey.replace(/\.[^.]+$/, `.${format}`);
    await uploadToMinio(key, transcoded);
  }
}

// FFmpeg command for web-optimized MP4
function getTranscodeCommand(input: string, output: string): string {
  return `ffmpeg -i ${input} \
    -c:v libx264 -preset medium -crf 23 \
    -c:a aac -b:a 128k \
    -movflags +faststart \
    ${output}`;
}
```

---

#### 11. Scheduled Slot Maintenance

**Concept:** Proactively refresh slots during low-usage periods.

```typescript
// services/maintenance.ts
const MAINTENANCE_HOUR = 3; // 3 AM local time

export async function runScheduledMaintenance(db: Database): Promise<void> {
  console.log("[Maintenance] Starting scheduled maintenance");

  // 1. Recover error slots
  await recoverErrorSlots(db);

  // 2. Refresh old idle slots (recreate to get latest image)
  const oldSlots = await db
    .select()
    .from(botPoolSlotsTable)
    .where(
      and(
        eq(botPoolSlotsTable.status, "idle"),
        lt(botPoolSlotsTable.lastUsedAt, subDays(new Date(), 7))
      )
    );

  for (const slot of oldSlots) {
    await refreshSlot(slot, db);
  }

  // 3. Clean up orphaned Coolify applications
  await cleanupOrphanedApps(db);

  console.log("[Maintenance] Maintenance complete");
}

async function refreshSlot(slot: PoolSlot, db: Database): Promise<void> {
  // Pull latest image
  await restartCoolifyApplication(slot.coolifyServiceUuid);
  await stopCoolifyApplication(slot.coolifyServiceUuid);

  // Update last used
  await db
    .update(botPoolSlotsTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(botPoolSlotsTable.id, slot.id));
}
```

---

## 10. Troubleshooting

### Common Issues

#### Bot stuck in DEPLOYING

**Symptoms:** Bot status remains DEPLOYING for > 10 minutes.

**Diagnosis:**
1. Check Coolify UI for container status
2. View container logs: `docker logs <container_id>`
3. Check pool slot status in database

**Resolution:**
- If container crashed: Mark bot as FATAL, release slot
- If network issue: Restart container via Coolify

#### Pool exhausted (all slots busy)

**Symptoms:** New bots queued, long wait times.

**Diagnosis:**
```sql
SELECT status, COUNT(*) FROM bot_pool_slots GROUP BY status;
SELECT COUNT(*) FROM bot_pool_queue;
```

**Resolution:**
- Check for stuck bots that should have completed
- Increase `MAX_POOL_SIZE` if hardware supports it
- Implement queue priority for critical bots

#### Slot in error state

**Symptoms:** Slot marked as `error`, not being used.

**Diagnosis:**
```sql
SELECT * FROM bot_pool_slots WHERE status = 'error';
```

**Resolution:**
- Check `errorMessage` column for details
- Manually reset: `UPDATE bot_pool_slots SET status = 'idle', error_message = NULL WHERE id = X`
- Or implement error recovery job (see Future Enhancements)

### Debugging Commands

```bash
# Check container status
docker ps -a | grep pool-

# View container logs (replace with actual slot name)
docker logs pool-google-meet-001 --tail 100

# Check database pool status
psql $DATABASE_URL -c "SELECT slot_name, status, assigned_bot_id FROM bot_pool_slots"

# Check queue
psql $DATABASE_URL -c "SELECT * FROM bot_pool_queue ORDER BY priority, queued_at"

# Verify Coolify API connectivity
curl -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_API_URL/applications"
```

### Performance Tuning

#### Database Indexes

Ensure these indexes exist for optimal query performance:

```sql
CREATE INDEX idx_bot_pool_slots_status ON bot_pool_slots(status);
CREATE INDEX idx_bot_pool_slots_assigned_bot ON bot_pool_slots("assignedBotId");
CREATE INDEX idx_bot_pool_queue_priority ON bot_pool_queue(priority, "queuedAt");
```

#### Connection Pooling

For high-concurrency scenarios, ensure database connection pooling is configured:

```typescript
// drizzle.config.ts
export default {
  // ...
  pool: {
    min: 5,
    max: 20,
  },
};
```

---

## References

- [Coolify Documentation](https://coolify.io/docs/)
- [Coolify API Reference](https://coolify.io/docs/api-reference/api/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [tRPC Documentation](https://trpc.io/docs)
- [MinIO Documentation](https://min.io/docs/minio/linux/index.html)

---

*This document is maintained alongside the codebase. For implementation details, see the source files in `apps/milo/src/server/api/services/`.*
