# Bots Package Architecture

This document describes the architecture of the `@meeboter/bots` package, which provides automated meeting bot capabilities for Google Meet, Microsoft Teams, and Zoom.

## Overview

The bots package implements a **strategy pattern** for platform-specific meeting bots, with shared infrastructure for logging, monitoring, and recording. Each bot runs as an isolated Docker container that joins meetings, records audio/video, and reports status to the backend.

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Entry Point                                │
│                          (src/index.ts)                              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Bot Factory                                 │
│                       (src/bot-factory.ts)                           │
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
                        │   (src/bot.ts)   │
                        └──────────────────┘
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
