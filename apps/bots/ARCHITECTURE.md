# Bots Package Architecture

This document describes the architecture of the `@meeboter/bots` package, which provides automated meeting bot capabilities for Google Meet, Microsoft Teams, and Zoom.

## Overview

The bots package implements a **strategy pattern** for platform-specific meeting bots, with shared infrastructure for logging, monitoring, and recording. Each bot runs as an isolated Docker container that joins meetings, records audio/video, and reports status to the backend.

```
+---------------------------------------------------------------------+
|                           Entry Point                               |
|                          (src/index.ts)                             |
+-----------------------------------+---------------------------------+
                                    |
                                    v
+---------------------------------------------------------------------+
|                          Bot Factory                                |
|                       (src/bot-factory.ts)                          |
|  Creates platform-specific bot based on config.meetingInfo.platform |
+-----------------------------------+---------------------------------+
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
                        |     (src/bot.ts)       |
                        +------------------------+
```

## Directory Structure

```
apps/bots/
├── src/                          # Core source code
│   ├── index.ts                  # Main entry point and orchestration
│   ├── bot.ts                    # Abstract Bot base class
│   ├── bot-factory.ts            # Factory for creating platform bots
│   ├── types.ts                  # Shared types and enums
│   ├── trpc.ts                   # tRPC client for backend communication
│   ├── config/
│   │   └── env.ts                # Environment configuration
│   ├── errors/
│   │   ├── bot-errors.ts         # Bot-specific errors
│   │   ├── meeting-errors.ts     # Meeting-related errors
│   │   └── storage-errors.ts     # S3/storage errors
│   ├── events/
│   │   ├── index.ts              # Exports
│   │   └── bot-event-emitter.ts  # BotEventEmitter class
│   ├── helpers/                  # Browser automation utilities
│   │   ├── click-if-exists.ts
│   │   ├── element-exists.ts
│   │   ├── wait-for-element.ts
│   │   ├── with-retry.ts         # Generic retry wrapper
│   │   └── with-timeout.ts
│   ├── logger/                   # Logging infrastructure
│   │   ├── index.ts              # BotLogger class
│   │   ├── colors.ts             # Terminal color formatting
│   │   └── screenshot.ts         # Screenshot utilities
│   ├── services/
│   │   ├── index.ts              # Service container and exports
│   │   └── s3-service.ts         # S3 upload service
│   └── workers/                  # Background workers
│       ├── heartbeat-worker.ts   # Status heartbeat to backend
│       ├── duration-monitor-worker.ts  # Meeting duration limits
│       └── message-queue-worker.ts     # Chat message processing
├── providers/                    # Platform-specific implementations
│   ├── google-meet/src/
│   │   ├── bot.ts                # GoogleMeetBot implementation
│   │   └── selectors.ts          # DOM selectors
│   ├── microsoft-teams/src/
│   │   ├── bot.ts                # MicrosoftTeamsBot implementation
│   │   └── selectors.ts          # DOM selectors
│   └── zoom/src/
│       ├── bot.ts                # ZoomBot implementation
│       └── selectors.ts          # DOM selectors
└── tests/                        # Test files
```

## Core Components

### BotEventEmitter (`src/events/bot-event-emitter.ts`)

Centralized event emitter for bot lifecycle events. Handles event reporting to backend and state management.

```typescript
class BotEventEmitter extends EventEmitter {
  // State management (auto-set from status events)
  getState(): string;

  // Event emission via native EventEmitter
  emit("event", eventCode: EventCode, data?: Record<string, unknown>): boolean;

  // Event listeners
  on(event: 'event', listener: (code, data?) => void): this;
  on(event: 'stateChange', listener: (newState, oldState) => void): this;
}
```

- **Single source of truth** for bot state (derived from events)
- **Self-listening pattern** - listens to its own "event" events for side effects
- **Automatic backend reporting** via tRPC (fire-and-forget in listener)
- **Auto state management** - status events automatically update state

### Abstract Bot (`src/bot.ts`)

The base class that all platform bots extend. Defines the contract for meeting bot functionality:

```typescript
abstract class Bot {
  // Lifecycle
  abstract joinCall(): Promise<unknown>;
  abstract run(): Promise<void>;
  abstract cleanup(): Promise<unknown>;

  // Monitoring
  abstract hasBeenRemovedFromCall(): Promise<boolean>;

  // Recording
  abstract getRecordingPath(): string;
  abstract getContentType(): string;
  abstract getSpeakerTimeframes(): SpeakerTimeframe[];

  // Features
  abstract screenshot(filename?: string, trigger?: string): Promise<string | null>;
  abstract sendChatMessage(message: string): Promise<boolean>;

  // Shared implementation
  requestLeave(): void;
}
```

### Bot Factory (`src/bot-factory.ts`)

Factory function that creates platform-specific bot instances:

```typescript
async function createBot(
  botData: BotConfig,
  options?: CreateBotOptions
): Promise<Bot>
```

- Validates platform matches Docker image (safety check)
- Dynamically imports platform-specific implementation
- Sets up event handler for status reporting
- Returns configured bot instance

### Platform Providers

Each platform provider implements the abstract `Bot` class:

| Provider | Browser | Recording Method | Special Features |
|----------|---------|------------------|------------------|
| Google Meet | Playwright | FFmpeg (X11grab) | Chat support, speaker detection |
| Microsoft Teams | Puppeteer | puppeteer-stream | Participant tracking |
| Zoom | Puppeteer | puppeteer-stream | In-iframe controls |

### Workers

Background workers that run alongside the bot:

**HeartbeatWorker**
- Sends periodic status updates to backend
- Receives leave requests from user
- Handles dynamic log level changes
- Implements exponential backoff retry

**DurationMonitorWorker**
- Enforces maximum meeting duration limits
- Triggers graceful shutdown when exceeded

**MessageQueueWorker**
- Polls backend for queued chat messages
- Sends messages through bot's chat interface
- Only active when `chatEnabled: true`

### Logger (`src/logger/`)

Structured logging with multiple features:

- **Log Levels**: TRACE, DEBUG, INFO, WARN, ERROR, FATAL
- **Breadcrumbs**: Rolling buffer of recent actions for debugging
- **Screenshots**: Automatic capture on state changes and errors
- **Streaming**: Real-time log forwarding to backend via tRPC
- **State Tracking**: Current bot state displayed in logs

### Services

**S3Service**
- Uploads recordings to S3
- Uploads screenshots with metadata
- Configurable endpoint for S3-compatible storage

**createServices()**
- Dependency injection container
- Creates logger, tRPC client, S3 service, and workers
- Accepts `getBot` function for lazy bot access

## Lifecycle Flow

```
1. Container Start
   └─► main() in src/index.ts

2. Configuration
   ├─► Fetch bot config from backend via tRPC
   └─► Create services container

3. Bot Creation
   └─► createBot() creates platform-specific instance

4. Join Meeting
   ├─► bot.joinCall()
   ├─► Navigate to meeting URL
   ├─► Fill name, disable media
   ├─► Click join button
   └─► Wait for call entry (or waiting room)

5. In-Call Monitoring
   ├─► Start recording (if enabled)
   ├─► Start workers (heartbeat, duration, chat)
   └─► bot.run() enters monitoring loop
       ├─► Check leaveRequested flag
       ├─► Check hasBeenRemovedFromCall()
       └─► Process chat queue (if enabled)

6. Exit
   ├─► Triggered by: user request, kick, meeting end, duration limit
   ├─► bot.cleanup() stops recording and closes browser
   └─► Upload recording to S3

7. Finalization
   ├─► Stop all workers
   ├─► Report final status (DONE or FATAL)
   ├─► Flush logs
   └─► Process exit
```

## Event System

Bots report events through the `onEvent` handler:

```typescript
type EventCode =
  | "DEPLOYING"        // Bot deployment started
  | "JOINING_CALL"     // Attempting to join
  | "IN_WAITING_ROOM"  // Waiting for admission
  | "IN_CALL"          // Successfully joined
  | "CALL_ENDED"       // Meeting ended
  | "DONE"             // Bot completed
  | "FATAL"            // Fatal error occurred
  | "PARTICIPANT_JOIN" // Someone joined
  | "PARTICIPANT_LEAVE"// Someone left
  // Blocking events
  | "SIGN_IN_REQUIRED"
  | "CAPTCHA_DETECTED"
  | "MEETING_NOT_FOUND"
  | "MEETING_ENDED"
  | "PERMISSION_DENIED"
  | "JOIN_BLOCKED"
```

Status-changing events automatically update the bot status in the database.

## Error Handling

Custom error hierarchy:

```
BotError (base)
├── BotNotInitializedError
├── BotCreationError
├── UnsupportedPlatformError
└── PlatformMismatchError

WaitingRoomTimeoutError
MeetingJoinError
TimeoutError (from helpers)
```

All platform bots use consistent error handling:
- Errors during join trigger FATAL event
- Errors during monitoring trigger graceful exit
- Screenshots captured on errors for debugging

## Browser Automation Helpers

Shared utilities for reliable browser automation:

| Helper | Purpose |
|--------|---------|
| `clickIfExists` | Click element if present, with timeout |
| `elementExists` | Check element presence with optional details |
| `waitForElement` | Wait for element with configurable timeout |
| `withRetry` | Generic retry wrapper for any async operation |
| `withTimeout` | Wrap promise with timeout and error |

## Configuration

Bot configuration (`BotConfig`):

```typescript
interface BotConfig {
  id: number;
  userId: string;
  meetingInfo: MeetingInfo;
  meetingTitle: string;
  startTime: Date;
  endTime: Date;
  botDisplayName: string;
  botImage?: string;
  recordingEnabled: boolean;
  heartbeatInterval: number;
  automaticLeave: AutomaticLeave;
  callbackUrl?: string;
  chatEnabled: boolean;
}
```

Automatic leave timeouts:

```typescript
interface AutomaticLeave {
  waitingRoomTimeout: number;   // Max time in waiting room
  noOneJoinedTimeout: number;   // Leave if no participants join
  everyoneLeftTimeout: number;  // Leave after all participants leave
  inactivityTimeout: number;    // Leave on prolonged inactivity
}
```

## Docker Deployment

Each platform has a separate Docker image:
- `meeboter-google-meet-bot` - Google Meet bot
- `meeboter-microsoft-teams-bot` - Microsoft Teams bot
- `meeboter-zoom-bot` - Zoom bot

Environment variable `DOCKER_MEETING_PLATFORM` ensures platform/image match.

Images include:
- Chrome/Chromium browser
- FFmpeg (for Google Meet recording)
- X11 virtual display (for Google Meet)
- Node.js runtime

## Testing

Test categories:
- `bot.test.ts` - Bot factory and creation
- `s3-startup.test.ts` - S3 client initialization
- `*-recording.test.ts` - Platform-specific recording tests
- `bot-exit.test.ts` - Exit condition handling
- `bot-nav.test.ts` - Navigation and join flow
- `bot-event.test.ts` - Event reporting

Run tests:
```bash
bun turbo test --filter=@meeboter/bots
```

## Adding a New Platform

1. Create provider directory: `providers/new-platform/src/`
2. Create `bot.ts` extending abstract `Bot` class
3. Create `selectors.ts` with DOM selectors
4. Add platform case to `bot-factory.ts` switch statement
5. Create Docker image with required browser setup
6. Add tests for new platform

## AWS Infrastructure & Cost

This section documents the AWS ECS Fargate infrastructure used to run meeting bots at scale, along with detailed cost analysis and optimization strategies.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Region (us-east-2)                         │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         VPC (10.0.0.0/16)                             │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────┐    ┌─────────────────────────┐          │  │
│  │  │  Public Subnet AZ-a    │    │  Public Subnet AZ-b    │          │  │
│  │  │    (10.0.1.0/24)       │    │    (10.0.2.0/24)       │          │  │
│  │  │                        │    │                        │          │  │
│  │  │  ┌──────────────────┐  │    │  ┌──────────────────┐  │          │  │
│  │  │  │  Fargate Tasks   │  │    │  │  Fargate Tasks   │  │          │  │
│  │  │  │  (Bot Containers)│  │    │  │  (Bot Containers)│  │          │  │
│  │  │  └────────┬─────────┘  │    │  └────────┬─────────┘  │          │  │
│  │  └───────────┼────────────┘    └───────────┼────────────┘          │  │
│  │              │                             │                        │  │
│  │              └──────────────┬──────────────┘                        │  │
│  │                             │                                       │  │
│  │                    ┌────────▼────────┐                              │  │
│  │                    │ Internet Gateway│                              │  │
│  │                    └────────┬────────┘                              │  │
│  └─────────────────────────────┼─────────────────────────────────────────┘  │
│                                │                                             │
└────────────────────────────────┼─────────────────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     External Services    │
                    │  • GHCR (container images)│
                    │  • Milo API (backend)    │
                    │  • S3 (recordings)       │
                    │  • Meeting platforms     │
                    └──────────────────────────┘
```

### Infrastructure Components

| Component | Configuration | Purpose |
|-----------|---------------|---------|
| **ECS Cluster** | Fargate-only (no EC2) | Serverless container orchestration |
| **Task Definitions** | 3 (Google Meet, Zoom, Teams) | Platform-specific bot containers |
| **VPC** | Public subnets only (no NAT) | Zero fixed monthly cost |
| **CloudWatch Logs** | 1-day retention | Minimal log storage |
| **Secrets Manager** | 1 secret (GHCR) | Container registry auth |
| **S3** | Terraform state only | Infrastructure state backend |

### Task Configuration

All bot task definitions share the same optimized configuration:

```hcl
resource "aws_ecs_task_definition" "bot" {
  cpu    = 512   # 0.5 vCPU (sufficient for browser automation)
  memory = 2048  # 2 GB (required for Chromium/Playwright)

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"  # Graviton (20% cheaper)
  }
}
```

### Capacity Provider Strategy

Optimized for cost with Spot instance priority:

```hcl
default_capacity_provider_strategy {
  capacity_provider = "FARGATE_SPOT"
  weight            = 90   # 90% of tasks use Spot
  base              = 0
}

default_capacity_provider_strategy {
  capacity_provider = "FARGATE"
  weight            = 10   # 10% fallback to On-Demand
  base              = 1    # At least 1 On-Demand task
}
```

**Why Spot is safe for bots:**
- Meeting bots are interruption-tolerant (can rejoin if terminated)
- Short task duration (typically 30-90 minutes) reduces interruption risk
- 90% cost savings compared to On-Demand

### Cost Analysis

#### Fargate Pricing (us-east-2, December 2024)

| Resource | On-Demand | Spot (~70% off) |
|----------|-----------|-----------------|
| vCPU/hour | $0.04048 | ~$0.01214 |
| GB RAM/hour | $0.004445 | ~$0.00133 |

#### Per-Task Hourly Cost (0.5 vCPU + 2 GB)

| Launch Type | Calculation | Cost/Hour |
|-------------|-------------|-----------|
| On-Demand | (0.5 × $0.04048) + (2 × $0.004445) | $0.02913 |
| Spot | (0.5 × $0.01214) + (2 × $0.00133) | $0.00873 |
| **Blended (90/10)** | (0.9 × $0.00873) + (0.1 × $0.02913) | **$0.01077** |

#### Monthly Cost Projections

Based on 500 bots/day with varying meeting durations:

| Meeting Duration | Bot-Hours/Day | Bot-Hours/Month | Monthly Cost |
|------------------|---------------|-----------------|--------------|
| 30 min (short) | 250 | 7,500 | **$81** |
| 45 min (average) | 375 | 11,250 | **$121** |
| 60 min (standard) | 500 | 15,000 | **$162** |
| 90 min (extended) | 750 | 22,500 | **$242** |

#### Additional Costs (Minimal)

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| CloudWatch Logs | ~$0.50 | 1-day retention, ~1 GB ingested |
| Secrets Manager | ~$0.40 | 1 secret for GHCR auth |
| S3 (Terraform) | ~$0.05 | State file storage only |
| **Total Other** | **~$1** | Negligible compared to compute |

### Cost Optimization Strategies Applied

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| **90% Spot** | ~70% savings vs On-Demand | Capacity provider weights |
| **0.5 vCPU** | ~50% savings vs 1 vCPU | Task definition CPU units |
| **ARM64 Graviton** | ~20% savings vs x86 | Runtime platform config |
| **No NAT Gateway** | ~$32/month saved | Public subnets with IGW |
| **Container Insights off** | ~$3/container saved | Cluster setting |
| **1-day log retention** | Minimal log costs | CloudWatch config |

### Scaling Considerations

#### Linear Scaling
Cost scales linearly with usage:
- 1,000 bots/day → ~$242/month
- 2,000 bots/day → ~$484/month
- 5,000 bots/day → ~$1,210/month

#### Concurrency Limits
- Default concurrent deployments: 4
- AWS_BOT_LIMIT environment variable controls max active tasks
- No inherent Fargate limit (soft limit: 1,000 tasks/region)

### Docker Image Requirements

For ARM64 Graviton support, images must be built for `linux/arm64`:

```bash
# Single-arch build
docker buildx build --platform linux/arm64 \
  -t ghcr.io/org/meeboter-google-meet-bot:latest \
  --push .

# Multi-arch build (recommended for flexibility)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/org/meeboter-google-meet-bot:latest \
  --push .
```

### Terraform Infrastructure Location

All AWS infrastructure is defined in:
```
terraform/bots/
├── main.tf          # Provider, backend, locals
├── variables.tf     # Input variables
├── ecs.tf           # Cluster, capacity providers, task definitions
├── vpc.tf           # VPC, subnets, IGW, routes
├── iam.tf           # Roles and policies
├── security.tf      # Security groups
├── logs.tf          # CloudWatch log group
└── outputs.tf       # Environment variable outputs
```

### Cost Monitoring

Monitor costs via:
- **AWS Cost Explorer**: Filter by ECS service
- **CloudWatch**: Track task count and duration metrics
- **Application logs**: Bot duration logged per session

### Future Optimization Opportunities

| Opportunity | Potential Savings | Complexity |
|-------------|-------------------|------------|
| Graviton3 (when available) | ~5-10% | Low |
| Savings Plans (1-year) | ~30% | Medium |
| Reduce memory to 1 GB | ~50% on RAM | High risk |
| Batch short meetings | Variable | High |
