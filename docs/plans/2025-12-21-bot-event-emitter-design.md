# BotEventEmitter Design

## Overview

Abstract the `onEvent` callback into a `BotEventEmitter` class that centralizes event reporting and state management. The `BotLogger` subscribes to state changes from this emitter.

## Goals

1. **Centralized event emission** with listener pattern (extends EventEmitter)
2. **Single source of truth for state** (replaces `logger.setState`)
3. **tRPC reporting as built-in listener** (events and status updates)
4. **Shared reference** pattern, both Bot and BotLogger receive same instance

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    BotEventEmitter                            │
│  - state: string                                              │
│  - emitEvent(eventCode, data)                                 │
│  - setState(state)                                            │
│  - on('event', cb) / on('stateChange', cb)                   │
│  - Built-in: tRPC reporting listener                          │
└──────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│     Bot         │         │   BotLogger     │
│  emitEvent()    │         │  subscribes to  │
│  setState()     │         │  'stateChange'  │
└─────────────────┘         └─────────────────┘
```

## File Structure

```
apps/bots/src/events/
├── index.ts                # Exports
└── bot-event-emitter.ts    # BotEventEmitter class
```

## BotEventEmitter Interface

```typescript
import { EventEmitter } from "events";
import type { EventCode, TrpcClient, Status } from "../trpc";
import { STATUS_EVENT_CODES } from "../trpc";

interface BotEventEmitterOptions {
  botId: number;
  trpc: TrpcClient;
  onStatusChange?: (eventCode: EventCode) => Promise<void>;
}

export class BotEventEmitter extends EventEmitter {
  private state: string = "INITIALIZING";
  private readonly botId: number;
  private readonly trpc: TrpcClient;
  private readonly onStatusChange?: (eventCode: EventCode) => Promise<void>;

  constructor(options: BotEventEmitterOptions);

  // State management
  getState(): string;
  setState(state: string): void;  // Emits 'stateChange'

  // Event emission
  async emitEvent(eventCode: EventCode, data?: Record<string, unknown>): Promise<void>;

  // Event types
  on(event: 'event', listener: (code: EventCode, data?: Record<string, unknown>) => void): this;
  on(event: 'stateChange', listener: (newState: string, oldState: string) => void): this;
}
```

## Implementation Details

### BotEventEmitter

```typescript
export class BotEventEmitter extends EventEmitter {
  private state: string = "INITIALIZING";
  private readonly botId: number;
  private readonly trpc: TrpcClient;
  private readonly onStatusChange?: (eventCode: EventCode) => Promise<void>;

  constructor(options: BotEventEmitterOptions) {
    super();
    this.botId = options.botId;
    this.trpc = options.trpc;
    this.onStatusChange = options.onStatusChange;
  }

  getState(): string {
    return this.state;
  }

  setState(newState: string): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', newState, oldState);
  }

  async emitEvent(
    eventCode: EventCode,
    data?: Record<string, unknown>
  ): Promise<void> {
    // Emit to listeners
    this.emit('event', eventCode, data);

    // Report to backend
    await this.trpc.bots.events.report.mutate({
      id: String(this.botId),
      event: {
        eventType: eventCode,
        eventTime: new Date(),
        data: data
          ? {
              description: (data.message as string) || (data.description as string),
              sub_code: data.sub_code as string | undefined,
            }
          : null,
      },
    });

    // Update status if applicable
    if (STATUS_EVENT_CODES.includes(eventCode)) {
      await this.trpc.bots.updateStatus.mutate({
        id: String(this.botId),
        status: eventCode as unknown as Status,
      });

      // Trigger onStatusChange callback
      if (this.onStatusChange) {
        this.onStatusChange(eventCode).catch(() => {
          // Ignore errors from status change callback
        });
      }
    }
  }
}
```

### BotLogger Changes

1. Remove `setState()` method
2. Remove `currentState` property
3. Accept `BotEventEmitter` via constructor
4. Get state from emitter via `eventEmitter.getState()`

```typescript
export class BotLogger {
  private readonly eventEmitter: BotEventEmitter;

  constructor(
    botId: number,
    eventEmitter: BotEventEmitter,
    options?: { ... }
  ) {
    this.eventEmitter = eventEmitter;

    // Subscribe to state changes
    eventEmitter.on('stateChange', (newState, oldState) => {
      this.debug(`State changed: ${oldState} → ${newState}`);
    });
  }

  private get currentState(): string {
    return this.eventEmitter.getState();
  }

  // Remove: setState(state: string): void
  // Remove: getState(): string (delegate to emitter)
}
```

### Bot Changes

1. Remove `onEvent` property from constructor
2. Add `eventEmitter` property
3. Replace `this.onEvent(code)` with `this.eventEmitter.emitEvent(code)`
4. Replace `this.logger.setState(s)` with `this.eventEmitter.setState(s)`

### bot-factory.ts Changes

1. Create `BotEventEmitter` instance first
2. Create `BotLogger` with emitter via constructor
3. Create `Bot` with emitter via constructor
4. Remove `createEventHandler` function (logic moves to BotEventEmitter)

```typescript
export async function createBot(
  config: BotConfig,
  options: CreateBotOptions,
): Promise<Bot> {
  const { trpcClient, onStatusChange } = options;

  // 1. Create shared event emitter first
  const eventEmitter = new BotEventEmitter({
    botId: config.id,
    trpc: trpcClient,
    onStatusChange,
  });

  // 2. Create logger with emitter
  const logger = new BotLogger(config.id, eventEmitter);
  logger.enableStreaming({ trpcClient });

  // 3. Create bot with emitter and logger
  const bot = new GoogleMeetBot(config, eventEmitter, trpcClient, logger);

  return bot;
}
```

## Migration Path

1. Create `BotEventEmitter` class
2. Update `BotLogger` to accept and use emitter
3. Update `Bot` base class to use emitter instead of `onEvent`
4. Update `bot-factory.ts` to create and wire the emitter
5. Update all platform bots (Google Meet, Teams, Zoom)
6. Remove old `onEvent` callback pattern

## Benefits

1. **Single source of truth** for bot state
2. **Extensible** via listener pattern
3. **Decoupled** logger from event reporting
4. **Testable** via mock emitters
5. **Cleaner API** for bots (no callback passing through constructors)
