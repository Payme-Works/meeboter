# Bot Logging System Design

## Overview

Comprehensive logging system for meeting bots that supports real-time debugging, post-mortem analysis, and operational monitoring.

## Requirements

- **Output**: Console only (colored text), designed for future extensibility
- **Context per log**: Log level + bot ID + bot state + message + file/function + elapsed time (no timestamp, container adds it)
- **Log levels**: TRACE, DEBUG, INFO, WARN, ERROR, FATAL (6 levels, all enabled by default)
- **Configuration**: Dynamic via API, can change at runtime without redeployment
- **Errors**: Rich context with stack trace, breadcrumbs (last 20 actions), automatic screenshot
- **Screenshots**: Viewable in app bot details dialog

## Architecture

### BotLogger Class

```
BotLogger
├── Configuration
│   ├── botId: number
│   ├── logLevel: LogLevel (runtime adjustable)
│   └── maxBreadcrumbs: number (default: 20)
│
├── State (auto-tracked)
│   ├── currentState: BotState (e.g., "IN_WAITING_ROOM")
│   ├── startTime: Date (for elapsed time)
│   └── breadcrumbs: Array<{timestamp, level, message}>
│
├── Methods
│   ├── trace(message, context?)
│   ├── debug(message, context?)
│   ├── info(message, context?)
│   ├── warn(message, context?)
│   ├── error(message, error?, context?)
│   ├── fatal(message, error?, context?)
│   ├── setState(newState)
│   ├── setLogLevel(level)
│   └── captureScreenshot()
│
└── Output Format (colored)
    [LEVEL] [bot:ID] [STATE] [file:func] [+elapsed] message
```

### Log Levels

| Level | Color | Use Case |
|-------|-------|----------|
| TRACE | Gray | Ultra-verbose: selector lookups, DOM queries |
| DEBUG | Cyan | Detailed flow: function entries, API responses |
| INFO | Green | Key milestones: state changes, joined call |
| WARN | Yellow | Recoverable issues: mic already off |
| ERROR | Red | Failures that don't stop bot: API retry |
| FATAL | Red+Bold | Bot-stopping errors: crash, kicked |

Level filtering: `TRACE=0 < DEBUG=1 < INFO=2 < WARN=3 < ERROR=4 < FATAL=5`

### Error Output Format

```
[FATAL] [bot:190] [IN_WAITING_ROOM] [bot.ts:joinMeeting] [+33s] Bot crashed
  ├── Error: Execution context was destroyed
  ├── Stack: at joinMeeting (bot.ts:676)
  │          at run (bot.ts:331)
  ├── Breadcrumbs (last 5):
  │   [+32s] INFO: Clicked 'Ask to join'
  │   [+33s] INFO: Reported IN_WAITING_ROOM
  │   [+33s] ERROR: waitForFunction failed
  └── Screenshot: s3://bucket/screenshots/bot-190-error-1702994179.png
```

### Screenshot Storage Flow

```
Bot Container                    Backend (Milo)                 UI
─────────────                    ──────────────                 ──
1. Capture screenshot
2. Upload to S3 (screenshots/)
3. Report via API ───────────────> 4. Append to screenshots
                                      array in database
                                                                 5. Display in
                                                                    bot details
                                                                    (list + carousel)
```

### Database Schema Addition

```typescript
// In botsTable, add:
screenshots: jsonb("screenshots").$type<Array<{
  url: string;
  capturedAt: Date;
  type: "error" | "fatal" | "manual" | "state_change";
  state: string;        // Bot state when captured (e.g., "IN_WAITING_ROOM")
  trigger?: string;     // What triggered capture (e.g., "WaitingRoomTimeoutError")
}>>().default([])
```

### Screenshot UI Design

**Bot Details Dialog - Screenshots Section:**

```
┌─────────────────────────────────────────────────────────────┐
│  Screenshots (3)                                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │              [Full-size carousel image]              │   │
│  │                                                      │   │
│  │    ◀                                          ▶     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ thumb 1 │  │ thumb 2 │  │ thumb 3 │  ← clickable list   │
│  │ [ERROR] │  │ [FATAL] │  │ [STATE] │                     │
│  │ 12:36pm │  │ 12:37pm │  │ 12:38pm │                     │
│  └─────────┘  └─────────┘  └─────────┘                     │
│                    ▲                                        │
│              (selected)                                     │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Thumbnail list at bottom, scrollable if many screenshots
- Click thumbnail to view in carousel above
- Badge shows screenshot type (ERROR, FATAL, STATE)
- Timestamp and bot state shown on each thumbnail
- Arrow buttons or swipe to navigate carousel
- Click carousel image to open full-size in modal/new tab

## File Structure

```
apps/bots/src/
├── logger/
│   ├── index.ts           # BotLogger class + LogLevel enum + types
│   ├── colors.ts          # Color formatting utilities
│   └── screenshot.ts      # Screenshot capture + S3 upload
```

## Integration Points

1. **Bot constructor**: Create logger instance
2. **State changes**: Update logger state via `setState()`
3. **Heartbeat**: Check for log level changes in response
4. **Backend API**: Endpoints for log level and screenshot URL
5. **UI**: Screenshot viewer in bot details dialog

## Implementation Phases

### Phase 1: Core Logger
- Create BotLogger class with all methods
- Add to Google Meet bot only
- Replace ~100 console calls in meet/src/bot.ts

### Phase 2: Screenshot Integration
- Add S3 upload for screenshots
- Add screenshots JSONB array to database schema
- Create backend endpoint to append screenshot to array
- Build screenshot carousel UI component (list + carousel)
- Integrate into bot details dialog

### Phase 3: Dynamic Log Level
- Extend heartbeat response with logLevel field
- Add UI control to change log level per bot
- Add API endpoint for log level changes

### Phase 4: Other Providers
- Migrate Zoom bot (~28 console calls)
- Migrate Teams bot (~22 console calls)
- Migrate shared code (index.ts, monitoring.ts)
