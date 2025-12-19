# Bot Logs S3 Streaming Design

**Date**: 2025-12-19
**Status**: Approved

## Overview

Implement real-time log streaming from bot instances to S3 with a terminal-like viewer in the bot details page.

## Requirements

- **Log Types**: All process logs in structured JSON format
- **Upload Timing**: Real-time streaming to S3
- **Viewer Features**: Full terminal (live tail, search, download, timestamps, auto-scroll)
- **Retention**: 7 days via S3 lifecycle policy
- **UI Location**: New "Logs" tab on bot details dialog

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Bot Process   │         │   Milo Backend  │         │    Frontend     │
│   (Container)   │         │   (NestJS)      │         │    (React)      │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         │  1. Stream logs via       │                           │
         │     tRPC mutation         │                           │
         │  ─────────────────────►   │                           │
         │     (2s batches)          │                           │
         │                           │                           │
         │                           │  2. Broadcast via         │
         │                           │     tRPC subscription     │
         │                           │  ─────────────────────►   │
         │                           │                           │
         │                           │  3. Archive to S3         │
         │                           │     (every 30s + on exit) │
         │                           │  ─────────────────────►   │
         │                           │         S3 Bucket         │
```

**Key Decisions**:
- tRPC subscriptions for real-time frontend updates
- tRPC mutations for bot → backend communication (reuses existing auth)
- Batched S3 archival (30s intervals) reduces API costs
- 7-day S3 lifecycle policy for automatic cleanup

## Data Model

### Log Entry Schema

```typescript
interface LogEntry {
  id: string;              // UUID for deduplication
  botId: number;           // Bot instance ID
  timestamp: Date;         // When log was generated
  level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;         // Log message
  state?: string;          // Bot state (e.g., 'IN_CALL')
  location?: string;       // Source file:line (e.g., 'caller.ts:120')
  context?: JsonObject;    // Additional structured data
  elapsed?: string;        // Time since bot start (e.g., '+5m30s')
}
```

### S3 Storage Structure

```
s3://bucket/
└── logs/
    └── {botId}/
        └── {YYYY-MM-DD}/
            ├── {start-timestamp}.jsonl  # Initial chunk
            ├── {timestamp}.jsonl        # Every 30s
            └── final.jsonl              # On bot exit
```

**Storage Strategy**:
1. **In-Memory Buffer** (backend): Last 1000 entries per active bot for instant delivery
2. **S3 Archival**: JSON-lines format for historical access
3. **No database storage**: Logs are ephemeral, S3 is source of truth

## Backend Implementation

### New tRPC Procedures

Location: `/apps/milo/src/server/api/routers/bots.ts`

```typescript
logs: {
  // Bot → Backend: Stream logs (public, from containers)
  stream: publicProcedure
    .input(z.object({
      botId: z.number(),
      entries: z.array(logEntrySchema),
    }))
    .mutation(async ({ input }) => {
      // Add to in-memory buffer
      // Broadcast to SSE subscribers
      // Trigger S3 archival if buffer threshold reached
    }),

  // Frontend → Backend: Subscribe to live logs
  subscribe: protectedProcedure
    .input(z.object({ botId: z.number() }))
    .subscription(async function* ({ input }) {
      // Yield logs from in-memory buffer
      // Keep connection open for new logs
    }),

  // Frontend → Backend: Fetch historical logs from S3
  getHistorical: protectedProcedure
    .input(z.object({
      botId: z.number(),
      cursor: z.string().optional(),  // S3 continuation token
    }))
    .query(async ({ input }) => {
      // List S3 objects, fetch and parse JSONL
      // Return paginated log entries
    }),
}
```

### In-Memory Log Buffer Service

```typescript
class LogBufferService {
  private buffers = new Map<number, LogEntry[]>();
  private subscribers = new Map<number, Set<(entry: LogEntry) => void>>();
  private readonly MAX_ENTRIES = 1000;

  append(botId: number, entries: LogEntry[]) {
    // Add to buffer, trim to MAX_ENTRIES
    // Notify subscribers
  }

  subscribe(botId: number, callback: (entry: LogEntry) => void) {
    // Add subscriber, return unsubscribe function
  }

  getBuffer(botId: number): LogEntry[] {
    // Return current buffer for initial load
  }

  clear(botId: number) {
    // Cleanup on bot termination
  }
}
```

### S3 Archival Worker

- Flushes buffer to S3 every 30 seconds
- Forces flush on bot exit event (STATUS → DONE/FATAL)
- Uses existing `S3Service` upload patterns
- Creates JSONL files with timestamp naming

## Frontend Implementation

### Terminal UI Component

Location: `/apps/milo/src/app/bots/_components/logs-tab.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─ Toolbar ───────────────────────────────────────────────────┐ │
│ │ 🔍 [Search...        ]  Level: [All ▼]  [⏸ Pause] [⬇ Download]│ │
│ │ [x] Auto-scroll  [x] Show timestamps  [x] Wrap lines        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─ Terminal ──────────────────────────────────────────────────┐ │
│ │ 2024-01-15 10:30:45 INFO  [IN_CALL] Joining meeting...      │ │
│ │ 2024-01-15 10:30:46 DEBUG [IN_CALL] Participant count: 3    │ │
│ │ 2024-01-15 10:30:47 WARN  [IN_CALL] Network latency high    │ │
│ │ 2024-01-15 10:30:48 ERROR [IN_CALL] Failed to capture frame │ │
│ │ ▌                                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ Connected • 1,234 entries • Last update: 2s ago                 │
└─────────────────────────────────────────────────────────────────┘
```

**Features**:
- Monospace font with dark theme (zinc-900 background)
- ANSI color support (INFO=blue, WARN=yellow, ERROR=red, FATAL=red bold)
- Virtualized scrolling via `@tanstack/react-virtual`
- Real-time search with highlighting
- Level filter dropdown
- Auto-scroll toggle (stick to bottom)
- Timestamps toggle
- Download as `.log` file
- Connection status indicator

### Component Structure

```
logs-tab/
├── logs-tab.tsx           # Main container, subscription logic
├── logs-toolbar.tsx       # Search, filters, controls
├── logs-terminal.tsx      # Virtualized log display
├── log-entry.tsx          # Single log line with color coding
└── use-log-stream.ts      # Custom hook for subscription
```

## Bot-Side Implementation

### BotLogger Modifications

Location: `/apps/bots/src/logger/index.ts`

```typescript
class BotLogger {
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timer;

  constructor() {
    // Stream logs every 2 seconds
    this.flushInterval = setInterval(() => this.flushToBackend(), 2000);
  }

  private formatLogEntry(level, message, context): LogEntry {
    return {
      id: randomUUID(),
      botId: this.botId,
      timestamp: new Date(),
      level,
      message,
      state: this.currentState,
      location: this.getCallerLocation(),
      context,
      elapsed: this.getElapsed(),
    };
  }

  private async flushToBackend() {
    if (this.logBuffer.length === 0) return;

    const entries = [...this.logBuffer];
    this.logBuffer = [];

    try {
      await trpc.bots.logs.stream.mutate({
        botId: this.botId,
        entries,
      });
    } catch (error) {
      // Re-queue on failure (max 500 to prevent memory issues)
      this.logBuffer = [...entries.slice(-250), ...this.logBuffer.slice(-250)];
    }
  }

  async shutdown() {
    clearInterval(this.flushInterval);
    await this.flushToBackend(); // Final flush
  }
}
```

## Implementation Plan

### Phase 1: Backend Infrastructure
1. Create `LogEntry` Zod schema and types
2. Implement `LogBufferService` for in-memory buffering
3. Add `logs.stream` tRPC mutation (bot → backend)
4. Add `logs.subscribe` tRPC subscription (frontend)
5. Add `logs.getHistorical` tRPC query (S3 fetch)
6. Implement S3 archival worker (30s flush + on exit)
7. Configure S3 lifecycle policy (7-day expiration)

### Phase 2: Bot Integration
1. Modify `BotLogger` to buffer and stream logs
2. Add 2-second flush interval
3. Implement graceful shutdown flush
4. Add retry logic for failed streams

### Phase 3: Frontend UI
1. Create `LogsTab` component with subscription
2. Implement `LogsToolbar` with search/filter controls
3. Build virtualized `LogsTerminal` display
4. Add `LogEntry` component with color coding
5. Integrate into bot details dialog tabs
6. Add download functionality

### Phase 4: Polish
1. Add connection status indicator
2. Implement pause/resume streaming
3. Add keyboard shortcuts (Ctrl+F for search)
4. Handle edge cases (bot not found, no logs)
5. Performance testing with 10k+ logs

## Files to Create/Modify

### New Files
- `/apps/milo/src/server/api/services/log-buffer-service.ts`
- `/apps/milo/src/server/api/services/log-archival-service.ts`
- `/apps/milo/src/app/bots/_components/logs-tab/logs-tab.tsx`
- `/apps/milo/src/app/bots/_components/logs-tab/logs-toolbar.tsx`
- `/apps/milo/src/app/bots/_components/logs-tab/logs-terminal.tsx`
- `/apps/milo/src/app/bots/_components/logs-tab/log-entry.tsx`
- `/apps/milo/src/app/bots/_components/logs-tab/use-log-stream.ts`

### Modified Files
- `/apps/milo/src/server/api/routers/bots.ts` - Add logs sub-router
- `/apps/bots/src/logger/index.ts` - Add streaming capability
- `/apps/milo/src/app/bots/_components/bot-details-dialog.tsx` - Add Logs tab

## Success Criteria

1. Logs stream from bot to frontend with < 3 second latency
2. Terminal displays 10k+ logs without performance degradation
3. Search filters logs in real-time
4. Download exports visible logs
5. Historical logs retrievable from S3 for 7 days
6. No memory leaks from long-running subscriptions
