# Meeboter Architecture

> Technical documentation for the Meeboter meeting bot platform

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Platform Architectures](#2-platform-architectures)
3. [Bot Package Architecture](#3-bot-package-architecture)
4. [Bot Pool System](#4-bot-pool-system)
5. [Request Flows](#5-request-flows)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)

---

## 1. System Overview

### What is Meeboter?

Meeboter is a meeting bot platform that joins video conferences (Google Meet, Microsoft Teams, Zoom) to record meetings, capture transcripts, and report events in real-time.

### High-Level Architecture

```
+-----------------------------------------------------------------------+
|                         User Application                              |
|                    (Web Dashboard / API Client)                       |
+-----------------------------------+-----------------------------------+
                                    |
                              tRPC / REST API
                                    |
                                    v
+-----------------------------------------------------------------------+
|                          Meeboter Server                              |
|                                                                       |
|  +-------------+  +-------------+  +-------------+  +-------------+  |
|  |  tRPC API   |  |  Bot Pool   |  |    Auth     |  |   Storage   |  |
|  |   Router    |  |   Manager   |  | (better-auth)|  |  (S3/MinIO) |  |
|  +-------------+  +-------------+  +-------------+  +-------------+  |
|                          |                                            |
+--------------------------|--------------------------------------------+
                           | Platform Service
                           v
+-----------------------------------------------------------------------+
|                     Bot Deployment Platform                           |
|           (Coolify / AWS ECS / Kubernetes)                            |
+-----------------------------------------------------------------------+
                           |
                           v
+-----------------------------------------------------------------------+
|                    Video Conference Platforms                         |
|                                                                       |
|         Google Meet          Microsoft Teams            Zoom          |
+-----------------------------------------------------------------------+
```

### Key Components

\- **Server:** Next.js + tRPC for API endpoints, authentication, bot orchestration<br>
\- **Database:** PostgreSQL + Drizzle ORM for bot state, user data, subscriptions<br>
\- **Storage:** MinIO/S3 (S3-compatible) for meeting recordings<br>
\- **Bot Runtime:** Docker containers with Playwright/Puppeteer-based meeting bots<br>
\- **Orchestration:** Coolify / AWS ECS / Kubernetes for container management

---

## 2. Platform Architectures

Meeboter supports three deployment platforms through a unified platform abstraction layer:

| Platform | Model | Best For |
|----------|-------|----------|
| **Coolify** | Pool-based | Self-hosted, bare-metal, cost-efficient at scale |
| **AWS ECS** | Task-based | Cloud-native, auto-scaling, pay-per-use |
| **Kubernetes** | Pod-based | Enterprise, multi-cloud, existing K8s infrastructure |

### Platform Abstraction (`services/platform/`)

All deployment platforms implement a common `PlatformService` interface:

| File | Description |
|------|-------------|
| `platform-service.ts` | Abstract platform interface |
| `platform-factory.ts` | Creates platform service based on config |
| `coolify-platform-service.ts` | Coolify pool-based deployment |
| `aws-platform-service.ts` | AWS ECS task-based deployment |
| `kubernetes-platform-service.ts` | Kubernetes pod-based deployment |
| `local-platform-service.ts` | Local development mode |

---

### 2.1 Coolify Architecture (Pool-Based)

Coolify deployment uses a **pre-provisioned pool** of bot containers. When a meeting is scheduled, an idle container is configured and started. After the meeting ends, the container returns to the pool.

```
+-----------------------------------------------------------------------+
|                         Coolify Server                                |
|                                                                       |
|  +------------------------+     +----------------------------------+  |
|  | Meeboter API (Next.js) |     |          Bot Pool                |  |
|  |                        |     |                                  |  |
|  |  +------------------+  |     |  +------+ +------+ +------+      |  |
|  |  | Bot Pool Manager |--------->| Slot | | Slot | | Slot | ...  |  |
|  |  +------------------+  |     |  | idle | | busy | | idle |      |  |
|  |                        |     |  +------+ +------+ +------+      |  |
|  |  +------------------+  |     +----------------------------------+  |
|  |  | PostgreSQL       |  |                                          |
|  |  | MinIO (S3)       |  |                                          |
|  |  +------------------+  |                                          |
|  +------------------------+                                          |
+-----------------------------------------------------------------------+
```

**How it works:**

1. Pool of Docker containers pre-created via Coolify API
2. When bot needed: acquire idle slot, configure env vars, start container
3. Bot joins meeting, sends heartbeats
4. When done: stop container, mark slot as idle
5. Slot reused for next bot (~30s deploy vs ~7min cold start)

**Key Features:**

\- **Fast deployment:** ~30 seconds (vs 7+ minutes for cold start)<br>
\- **Queue system:** Requests queue when pool exhausted<br>
\- **Slot recovery:** Failed slots automatically recovered<br>
\- **LRU selection:** Least recently used slots assigned first

**Environment Variables:**

```bash
DEPLOYMENT_PLATFORM="coolify"
COOLIFY_API_URL="https://coolify.example.com/api/v1"
COOLIFY_API_TOKEN="your-api-token"
COOLIFY_PROJECT_UUID="project-uuid"
COOLIFY_SERVER_UUID="server-uuid"
COOLIFY_DESTINATION_UUID="destination-uuid"
```

---

### 2.2 AWS ECS Architecture (Task-Based)

AWS ECS deployment creates **ephemeral Fargate tasks** for each meeting. Tasks are created on-demand and terminated after the meeting ends.

```
+-----------------------------------------------------------------------+
|                          AWS Cloud                                    |
|                                                                       |
|  +------------------------+     +----------------------------------+  |
|  | Meeboter API           |     |         ECS Cluster              |  |
|  |                        |     |                                  |  |
|  |  +------------------+  |     |  Meeting 1 --> [Task A] --> Done |  |
|  |  | ECS Task Manager |--------->Meeting 2 --> [Task B] --> Done |  |
|  |  +------------------+  |     |  Meeting 3 --> [Task C] Running  |  |
|  |                        |     |                                  |  |
|  +------------------------+     +----------------------------------+  |
|                                                                       |
|  +------------------------+     +----------------------------------+  |
|  | RDS PostgreSQL        |     |    ECR (Container Registry)      |  |
|  +------------------------+     +----------------------------------+  |
+-----------------------------------------------------------------------+
```

**How it works:**

1. Bot request received
2. ECS task created with bot config as environment variables
3. Fargate pulls image from ECR, runs container
4. Bot joins meeting, reports status via API
5. Meeting ends: task terminates, resources released
6. Pay only for actual runtime

**Key Features:**

\- **Pay-per-use:** No idle resources<br>
\- **Auto-scaling:** Fargate handles capacity<br>
\- **CloudWatch integration:** Centralized logging<br>
\- **Task definitions:** Per-platform configurations

**Environment Variables:**

```bash
DEPLOYMENT_PLATFORM="aws"
AWS_REGION="us-east-1"
ECS_CLUSTER="meeboter-cluster"
ECS_SUBNETS="subnet-xxx,subnet-yyy"
ECS_SECURITY_GROUPS="sg-xxx"
ECS_TASK_DEF_GOOGLE_MEET="meeboter-google-meet-bot:1"
ECS_TASK_DEF_MICROSOFT_TEAMS="meeboter-microsoft-teams-bot:1"
ECS_TASK_DEF_ZOOM="meeboter-zoom-bot:1"
```

---

### 2.3 Kubernetes Architecture (Pod-Based)

Kubernetes deployment uses **Jobs** to create ephemeral pods for each meeting. Similar to AWS ECS but runs on any K8s cluster.

```
+-----------------------------------------------------------------------+
|                       Kubernetes Cluster                              |
|                                                                       |
|  +------------------------+     +----------------------------------+  |
|  | Meeboter API           |     |      namespace: meeboter         |  |
|  |                        |     |                                  |  |
|  |  +------------------+  |     |  +--------+ +--------+ +--------+|  |
|  |  | K8s Job Manager  |--------->| Job A  | | Job B  | | Job C  ||  |
|  |  +------------------+  |     |  | (done) | | (done) | | (run)  ||  |
|  |                        |     |  +--------+ +--------+ +--------+|  |
|  +------------------------+     +----------------------------------+  |
|                                                                       |
|  +------------------------+     +----------------------------------+  |
|  | PostgreSQL             |     | Container Registry (GHCR/ECR)   |  |
|  +------------------------+     +----------------------------------+  |
+-----------------------------------------------------------------------+
```

**How it works:**

1. Bot request received
2. Kubernetes Job created with bot config
3. Pod scheduled, image pulled, container started
4. Bot joins meeting, reports status via API
5. Meeting ends: Job completes, pod terminated
6. TTL controller cleans up completed Jobs

**Key Features:**

\- **Multi-cloud:** Works on K3s, EKS, GKE, AKS<br>
\- **Resource limits:** CPU/memory constraints per bot<br>
\- **Node scheduling:** Distributes bots across nodes<br>
\- **Native kubectl access:** Full observability

**Environment Variables:**

```bash
DEPLOYMENT_PLATFORM="kubernetes"
KUBE_NAMESPACE="meeboter"
KUBE_CONFIG_PATH="/path/to/kubeconfig"  # Optional
KUBE_CPU_REQUEST="250m"
KUBE_CPU_LIMIT="500m"
KUBE_MEMORY_REQUEST="768Mi"
KUBE_MEMORY_LIMIT="1Gi"
```

---

### Platform Comparison

| Feature | Coolify | AWS ECS | Kubernetes |
|---------|---------|---------|------------|
| **Deployment Speed** | ~30s (pool) | ~60-90s | ~30-60s |
| **Cold Start** | ~7min | ~60-90s | ~30-60s |
| **Cost Model** | Fixed (server) | Pay-per-use | Fixed (cluster) |
| **Max Concurrent** | Pool size | Unlimited* | Node capacity |
| **Setup Complexity** | Low | Medium | Medium |
| **Best For** | Self-hosted | Cloud-native | Multi-cloud |

*AWS ECS limited by account quotas and budget

---

## 3. Bot Package Architecture

The `@meeboter/bots` package implements platform-specific meeting bots using a **strategy pattern**:

```
+-----------------------------------------------------------------------+
|                          Bot Factory                                  |
|                       (bot-factory.ts)                                |
|  Creates platform-specific bot based on config.meetingInfo.platform   |
+-----------------------------------+-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                         |                         |
          v                         v                         v
+------------------+    +--------------------+    +------------------+
|  GoogleMeetBot   |    | MicrosoftTeamsBot  |    |     ZoomBot      |
|  (Playwright)    |    |    (Puppeteer)     |    |   (Puppeteer)    |
+------------------+    +--------------------+    +------------------+
          |                         |                         |
          +-------------------------+-------------------------+
                                    |
                                    v
                        +------------------------+
                        |     Abstract Bot       |
                        |       (bot.ts)         |
                        +------------------------+
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
| `meeboter-microsoft-teams-bot` | Bun Alpine | ~1.7GB |
| `meeboter-zoom-bot` | Bun Alpine | ~1.7GB |

> **Full Documentation:** See [`apps/bots/ARCHITECTURE.md`](apps/bots/ARCHITECTURE.md)

---

## 4. Bot Pool System

> Applies to Coolify deployment only

### Problem Statement

Creating a new Coolify application for each bot takes **7+ minutes** due to Docker image pull (~7.5GB image), container initialization, and network configuration.

### Solution: Pre-Provisioned Pool

The bot pool maintains reusable Coolify applications. Once an image is cached, subsequent deployments take **~30 seconds**.

```
+-----------------------------------------------------------------------+
|                       Bot Pool (max 100 slots)                        |
+-----------------------------------------------------------------------+
|  [IDLE]     [IDLE]     [BUSY]     [IDLE]     [BUSY]     ...          |
|  slot-001   slot-002   slot-003   slot-004   slot-005                |
+-----------------------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------------------+
|                         Pool Manager                                  |
|                                                                       |
|  * Acquire idle slots (with database locking)                         |
|  * Create new slots on demand (lazy initialization)                   |
|  * Release slots when bots complete                                   |
|  * Queue requests when pool exhausted                                 |
|  * Sync status to Coolify app description                             |
+-----------------------------------------------------------------------+
```

### Pool Slot States

| State | Description | Container | Assignable |
|-------|-------------|-----------|------------|
| `idle` | Ready for assignment | Stopped | Yes |
| `deploying` | Starting up for a bot | Starting | No |
| `busy` | Running a bot | Running | No |
| `error` | Failed state | Unknown | No |

### Performance Comparison

| Scenario | Without Pool | With Pool |
|----------|--------------|-----------|
| First bot (new slot) | ~7 min | ~7 min |
| Subsequent bots | ~7 min | **~30 sec** |
| Pool exhausted | N/A | Queued + wait |

### Atomic Slot Acquisition

Uses PostgreSQL `FOR UPDATE SKIP LOCKED` for concurrent-safe slot assignment:

```sql
UPDATE bot_pool_slots
SET status = 'busy', "assignedBotId" = $1
WHERE id = (
    SELECT id FROM bot_pool_slots
    WHERE status = 'idle'
    ORDER BY "lastUsedAt" ASC NULLS FIRST
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

---

## 5. Request Flows

### Bot Creation Flow

```
Request arrives (createBot)
    |
    v
+-----------------------------+
| Validate subscription/limits |
+-----------------------------+
    |
    v
+-----------------------------+
| Create bot record in DB      |
| Status: "DEPLOYING"          |
+-----------------------------+
    |
    v
+-----------------------------+
| Platform Service: deploy()   |
+-----------------------------+
    |
    +---> Coolify: Acquire/create slot, start container
    +---> AWS ECS: Create Fargate task
    +---> Kubernetes: Create Job
    |
    v
+-----------------------------+
| Bot joins meeting            |
| Status: "JOINING_CALL"       |
+-----------------------------+
```

### Bot Lifecycle

```
DEPLOYING --> JOINING_CALL --> IN_WAITING_ROOM --> IN_CALL --> DONE
                   |                                   |
                   v                                   v
                 FATAL <-------------------------------+
```

---

## 6. Database Schema

```
+----------------+         +--------------------+
|     user       |         |    subscription    |
+----------------+         +--------------------+
| id             |<------->| userId             |
| name           |   1:1   | plan               |
| email          |         | dailyBotLimit      |
+-------+--------+         +--------------------+
        |
        | 1:N
        v
+----------------+         +--------------------+
|     bots       |         |  bot_pool_slots    |
+----------------+         +--------------------+
| id             |<--------| assignedBotId      |
| userId         |   N:1   | coolifyServiceUuid |
| status         |         | slotName           |
| meetingInfo    |         | status             |
| coolifyUuid    |         | lastUsedAt         |
+-------+--------+         +--------------------+
        |
        | 1:N
        v
+----------------+         +--------------------+
|    events      |         |  bot_pool_queue    |
+----------------+         +--------------------+
| id             |         | id                 |
| botId          |         | botId              |
| type           |         | priority           |
| payload        |         | queuedAt           |
+----------------+         +--------------------+
```

---

## 7. API Reference

### Bot Endpoints

#### Create Bot

```typescript
POST /api/trpc/bots.createBot

Input: {
  meetingInfo: {
    platform: "google-meet" | "microsoft-teams" | "zoom",
    meetingUrl: string,
  },
  botDisplayName?: string,
  startTime?: string,
  endTime?: string,
  recordingEnabled?: boolean,
}

Output: {
  id: number,
  status: string,
  queued?: boolean,
  queuePosition?: number,
}
```

#### Deploy Bot

```typescript
POST /api/trpc/bots.deployBot

Input: { id: string }
Output: { ...botFields, queued?: boolean }
```

### Monitoring Endpoints

#### Pool Statistics (Coolify only)

```typescript
GET /api/trpc/pool.statistics.getPool

Output: {
  total: number,
  idle: number,
  busy: number,
  error: number,
  maxSize: number
}
```

---

## References

\- **[DEPLOYMENT.md](DEPLOYMENT.md):** Deployment guides for all platforms<br>
\- **[apps/bots/ARCHITECTURE.md](apps/bots/ARCHITECTURE.md):** Bot package documentation<br>
\- **[Coolify Documentation](https://coolify.io/docs/)**<br>
\- **[AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)**<br>
\- **[Kubernetes Documentation](https://kubernetes.io/docs/)**

---

*This document is maintained alongside the codebase. For implementation details, see `apps/milo/src/server/api/services/`.*
