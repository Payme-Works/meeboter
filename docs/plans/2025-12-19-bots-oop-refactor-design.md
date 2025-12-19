# Apps/Bots OOP Refactoring Design

**Date:** 2025-12-19
**Status:** Approved
**Goal:** Refactor apps/bots to use OOP patterns similar to apps/milo

## Objectives

1. **Improve testability** - Make it easier to mock dependencies and write unit tests
2. **Improve extensibility** - Make it easier to add new meeting platforms or features
3. **Improve maintainability** - Better code organization and separation of concerns

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bot inheritance | Keep existing `Bot` base class + services around it | Safest approach, minimal changes to working code |
| Types organization | Colocate with modules (no `*-types.ts` files) | Types defined where they're used |
| File naming | Kebab-case | Consistency (e.g., `bot-service.ts`) |
| Workers | Separate `workers/` folder | Clear separation from services |
| Service folders | Flatten single-file services | Only create folder if 2+ files |
| Screenshots | Part of BotService | Tightly coupled to bot operations |
| Providers | Keep root structure, refactor `src/` only | Preserve Docker/build configuration |

## Target Architecture

### Directory Structure

```
apps/bots/src/
├── services/
│   ├── index.ts                     # Service container (DI)
│   ├── bot-service.ts               # Bot orchestration + screenshots
│   ├── trpc-service.ts              # Backend API client
│   ├── logger-service.ts            # Structured logging
│   └── s3-service.ts                # S3/MinIO storage
├── workers/
│   ├── heartbeat-worker.ts          # Polls backend for commands
│   ├── duration-monitor-worker.ts   # Enforces max runtime
│   └── message-queue-worker.ts      # Processes chat messages
├── providers/
│   ├── meet/
│   │   └── src/
│   │       ├── bot.ts               # GoogleMeetBot class
│   │       ├── selectors.ts         # CSS/XPath selectors
│   │       └── recording.ts         # FFmpeg recording logic
│   ├── teams/
│   │   └── src/
│   │       ├── bot.ts
│   │       ├── selectors.ts
│   │       └── recording.ts
│   └── zoom/
│       └── src/
│           ├── bot.ts
│           ├── selectors.ts
│           └── recording.ts
├── errors/
│   ├── bot-errors.ts
│   ├── meeting-errors.ts
│   └── storage-errors.ts
├── config/
│   └── env.ts
└── index.ts                         # Clean entry point
```

## Component Designs

### 1. Service Container (Dependency Injection)

```typescript
// services/index.ts
export interface Services {
  logger: LoggerService;
  trpc: TrpcService;
  s3: S3Service;
  bot: BotService;
  workers: {
    heartbeat: HeartbeatWorker;
    durationMonitor: DurationMonitorWorker;
    messageQueue: MessageQueueWorker;
  };
}

export function createServices(): Services {
  // Create in dependency order
  const logger = new LoggerService(env.LOG_LEVEL);
  const trpc = new TrpcService(env.MILO_URL, env.MILO_AUTH_TOKEN);
  const s3 = new S3Service(env);

  const bot = new BotService(logger, trpc, s3);

  const workers = {
    heartbeat: new HeartbeatWorker(trpc, logger),
    durationMonitor: new DurationMonitorWorker(logger),
    messageQueue: new MessageQueueWorker(trpc, bot, logger),
  };

  return { logger, trpc, s3, bot, workers };
}

export const services = createServices();
```

**Key principles:**
- Explicit dependency graph
- Easy to test by passing mocks
- All services created in one place

### 2. BotService (Main Orchestration)

```typescript
// services/bot-service.ts
export interface BotConfig {
  poolSlotUuid: string;
  meetingInfo: MeetingInfo;
  // ... config fields defined here
}

export interface ScreenshotData {
  key: string;
  timestamp: Date;
  type: "error" | "fatal" | "manual" | "state_change";
}

export class BotService {
  private bot: Bot | null = null;
  private leaveRequested = false;

  constructor(
    private readonly logger: LoggerService,
    private readonly trpc: TrpcService,
    private readonly s3: S3Service,
  ) {}

  async createBot(config: BotConfig): Promise<Bot> {
    const platform = config.meetingInfo.platform;
    const { default: BotClass } = await import(`../providers/${platform}/src/bot`);
    this.bot = new BotClass(config, this.handleEvent.bind(this), this.logger);
    return this.bot;
  }

  async captureScreenshot(type: ScreenshotData["type"]): Promise<ScreenshotData> {
    if (!this.bot) throw new BotNotInitializedError();
    const buffer = await this.bot.screenshot();
    const key = `screenshots/${Date.now()}-${type}.png`;
    await this.s3.uploadScreenshot(key, buffer);
    return { key, timestamp: new Date(), type };
  }

  async uploadRecording(filePath: string): Promise<string> {
    return this.s3.uploadRecording(filePath);
  }

  requestLeave(): void {
    this.leaveRequested = true;
    this.bot?.requestLeave();
  }

  isLeaveRequested(): boolean {
    return this.leaveRequested;
  }

  private async handleEvent(event: BotEvent): Promise<void> {
    await this.trpc.reportEvent(event);
    if (event.type === "state_change" || event.type === "error") {
      await this.captureScreenshot(event.type);
    }
  }
}
```

**Key principles:**
- Wraps existing Bot inheritance
- Centralizes screenshot logic
- Event handling triggers automatic screenshots

### 3. Worker Classes

```typescript
// workers/heartbeat-worker.ts
export interface HeartbeatCallbacks {
  onLeaveRequested: () => void;
  onLogLevelChange: (level: LogLevel) => void;
}

export class HeartbeatWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly trpc: TrpcService,
    private readonly logger: LoggerService,
    private readonly intervalMs = 5000,
  ) {}

  start(botId: number, callbacks: HeartbeatCallbacks): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(async () => {
      try {
        const response = await this.trpc.sendHeartbeat(botId);
        if (response.leaveRequested) callbacks.onLeaveRequested();
        if (response.logLevel !== this.logger.getLevel()) {
          callbacks.onLogLevelChange(response.logLevel);
        }
      } catch (error) {
        this.logger.warn("Heartbeat failed, will retry", { error });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }
}
```

```typescript
// workers/duration-monitor-worker.ts
export class DurationMonitorWorker {
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: LoggerService,
    private readonly maxDurationMs = 60 * 60 * 1000,
  ) {}

  start(onMaxDurationReached: () => void): void {
    this.timeoutId = setTimeout(() => {
      this.logger.warn("Max bot duration reached, requesting leave");
      onMaxDurationReached();
    }, this.maxDurationMs);
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

```typescript
// workers/message-queue-worker.ts
export class MessageQueueWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly trpc: TrpcService,
    private readonly bot: BotService,
    private readonly logger: LoggerService,
    private readonly intervalMs = 5000,
  ) {}

  start(botId: number): void {
    if (this.running) return;
    this.running = true;
    this.intervalId = setInterval(async () => {
      try {
        const messages = await this.trpc.getQueuedMessages(botId);
        for (const message of messages) {
          await this.bot.sendChatMessage(message.content);
          await this.trpc.markMessageSent(message.id);
        }
      } catch (error) {
        this.logger.warn("Message queue processing failed", { error });
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
  }
}
```

**Key principles:**
- Each worker independently startable/stoppable
- Clear lifecycle methods (`start`, `stop`)
- Callback-based communication
- Graceful error handling

### 4. Custom Error Hierarchy

```typescript
// errors/bot-errors.ts
export class BotError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BotError";
  }
}

export class BotNotInitializedError extends BotError {
  constructor() {
    super("Bot has not been initialized", "BOT_NOT_INITIALIZED");
    this.name = "BotNotInitializedError";
  }
}

export class BotCreationError extends BotError {
  constructor(platform: string, cause?: Error) {
    super(`Failed to create bot for platform: ${platform}`, "BOT_CREATION_FAILED", { platform });
    this.name = "BotCreationError";
    this.cause = cause;
  }
}
```

```typescript
// errors/meeting-errors.ts
export class MeetingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MeetingError";
  }
}

export class MeetingJoinError extends MeetingError {
  constructor(reason: string, meetingUrl?: string) {
    super(`Failed to join meeting: ${reason}`, "MEETING_JOIN_FAILED", { meetingUrl });
    this.name = "MeetingJoinError";
  }
}

export class WaitingRoomTimeoutError extends MeetingError {
  constructor(timeoutMs: number) {
    super(`Waiting room timeout after ${timeoutMs}ms`, "WAITING_ROOM_TIMEOUT", { timeoutMs });
    this.name = "WaitingRoomTimeoutError";
  }
}

export class MeetingEndedError extends MeetingError {
  constructor() {
    super("Meeting has ended", "MEETING_ENDED");
    this.name = "MeetingEndedError";
  }
}
```

```typescript
// errors/storage-errors.ts
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export class ScreenshotUploadError extends StorageError {
  constructor(key: string, cause?: Error) {
    super(`Failed to upload screenshot: ${key}`, "SCREENSHOT_UPLOAD_FAILED", { key });
    this.name = "ScreenshotUploadError";
    this.cause = cause;
  }
}

export class RecordingUploadError extends StorageError {
  constructor(filePath: string, cause?: Error) {
    super(`Failed to upload recording: ${filePath}`, "RECORDING_UPLOAD_FAILED", { filePath });
    this.name = "RecordingUploadError";
    this.cause = cause;
  }
}
```

**Key principles:**
- Base error class per domain with `code` and `context`
- Specific error classes for each failure scenario
- Uses native `cause` property for error chaining

### 5. Provider Refactoring

Each provider's `src/` folder will be refactored:

```typescript
// providers/meet/src/selectors.ts
export const SELECTORS = {
  enterNameField: 'input[type="text"][aria-label="Your name"]',
  askToJoinButton: '//button[.//span[text()="Ask to join"]]',
  joinNowButton: '//button[.//span[text()="Join now"]]',
  gotKickedDetector: '//button[.//span[text()="Return to home screen"]]',
  leaveButton: '//button[@aria-label="Leave call"]',
  peopleButton: '//button[@aria-label="People"]',
  chatButton: '//button[@aria-label="Chat with everyone"]',
  chatToggleButton: '//button[@aria-label="Toggle chat"]',
  chatInput: '//input[@aria-label="Send a message to everyone"]',
  chatSendButton: '//button[@aria-label="Send message"]',
  muteButton: '[aria-label*="Turn off microphone"]',
  cameraOffButton: '[aria-label*="Turn off camera"]',
  infoPopupClick: '//button[.//span[text()="Got it"]]',
  // Blocking screens
  signInButton: '//button[.//span[text()="Sign in"]]',
  signInPrompt: '[data-identifier="signInButton"], [aria-label="Sign in"]',
  captchaFrame: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
  captchaChallenge: '[class*="captcha"], #captcha',
  meetingNotFound: '//*[contains(text(), "Check your meeting code")]',
  meetingInvalid: '//*[contains(text(), "Invalid video call name")]',
  meetingEnded: '//*[contains(text(), "This meeting has ended")]',
  meetingUnavailable: '//*[contains(text(), "not available")]',
  permissionDenied: '//*[contains(text(), "denied access")]',
  notAllowedToJoin: '//*[contains(text(), "not allowed to join")]',
} as const;

export const WAITING_ROOM_INDICATORS = [
  "Asking to be let in",
  "Someone will let you in",
  "waiting for the host",
  "Wait for the host",
] as const;

export const SCREEN_DIMENSIONS = {
  WIDTH: 1920,
  HEIGHT: 1080,
} as const;
```

```typescript
// providers/meet/src/recording.ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import { SCREEN_DIMENSIONS } from "./selectors";

export interface RecordingConfig {
  outputPath: string;
  isTestEnvironment?: boolean;
}

export class MeetRecording {
  private ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
  private started = false;
  private startedAt = 0;

  constructor(private readonly config: RecordingConfig) {}

  getFFmpegParams(): string[] {
    // Test environment params vs production params
    if (this.config.isTestEnvironment || !fs.existsSync("/tmp/.X11-unix")) {
      return this.getTestParams();
    }
    return this.getProductionParams();
  }

  async start(): Promise<void> {
    if (this.ffmpegProcess) return;

    this.ffmpegProcess = spawn("ffmpeg", this.getFFmpegParams());
    this.startedAt = Date.now();

    this.ffmpegProcess.stderr.on("data", () => {
      if (!this.started) this.started = true;
    });

    this.ffmpegProcess.on("exit", () => {
      this.ffmpegProcess = null;
    });
  }

  async stop(): Promise<number> {
    return new Promise((resolve) => {
      if (!this.ffmpegProcess) {
        resolve(1);
        return;
      }

      this.ffmpegProcess.kill("SIGINT");
      this.ffmpegProcess.on("exit", (code) => resolve(code === 0 ? 0 : 1));
      this.ffmpegProcess.on("error", () => resolve(1));
    });
  }

  getStartedAt(): number {
    return this.startedAt;
  }

  private getTestParams(): string[] { /* ... */ }
  private getProductionParams(): string[] { /* ... */ }
}
```

## Implementation Plan

### Phase 1: Create Service Layer
1. Create `services/` folder structure
2. Implement `LoggerService` (extract from `src/logger/`)
3. Implement `TrpcService` (extract from `src/trpc.ts`)
4. Implement `S3Service` (extract from `src/s3.ts`)
5. Implement `BotService` (new orchestration layer)
6. Create service container `services/index.ts`

### Phase 2: Create Workers
1. Create `workers/` folder
2. Implement `HeartbeatWorker` (extract from `src/monitoring.ts`)
3. Implement `DurationMonitorWorker` (extract from `src/monitoring.ts`)
4. Implement `MessageQueueWorker` (extract from `src/index.ts`)

### Phase 3: Create Error Hierarchy
1. Create `errors/` folder
2. Implement `BotError` and subclasses
3. Implement `MeetingError` and subclasses
4. Implement `StorageError` and subclasses
5. Update existing code to use new errors

### Phase 4: Refactor Providers
1. Extract selectors to `selectors.ts` for each provider
2. Extract recording logic to `recording.ts` for each provider
3. Refactor `bot.ts` to use extracted modules
4. Update imports to use new structure

### Phase 5: Refactor Entry Point
1. Refactor `src/index.ts` to use service container
2. Wire up workers with callbacks
3. Simplify main() function
4. Update tests

### Phase 6: Cleanup
1. Remove old files (`src/types.ts`, `src/monitoring.ts`, etc.)
2. Update imports throughout codebase
3. Run lint and typecheck
4. Run tests
5. Manual testing

## Migration Notes

- Types will be moved from centralized `src/types.ts` to their respective modules
- Existing `Bot` base class and inheritance hierarchy preserved
- Provider Dockerfile/entrypoint/package.json remain unchanged
- Tests may need updates for new service structure
