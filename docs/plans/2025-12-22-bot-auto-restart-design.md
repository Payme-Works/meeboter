# Bot Auto-Restart on Fatal Error

## Overview

When deploying 10-20+ bots concurrently, resource contention can cause transient failures (navigation timeouts, browser crashes). Instead of immediately marking bots as FATAL, the system now automatically retries the entire bot lifecycle up to 3 times before giving up.

## Design Decisions

### Trigger: Any Fatal Error During `run()`
- Catches all unhandled exceptions in the bot's `run()` method
- Includes navigation timeouts, browser crashes, and unexpected errors
- Does NOT retry configuration/bootstrap failures (those fail immediately)

### Max Retries: 3 (4 Total Attempts)
- Initial attempt + 3 restart attempts
- Balances recovery potential with resource usage
- Configurable via `MAX_RESTART_ATTEMPTS` constant

### Location: Entrypoint Wrapper
- Clean separation from bot logic
- Works for all provider implementations
- Fresh bot instance created for each attempt

### Milo Notification: RESTARTING Event
- New event code `RESTARTING` added to track restart attempts
- Not a status change (bot remains in its last status)
- Includes attempt number and error message for debugging

## Implementation

### Files Changed

| File | Change |
|------|--------|
| `apps/bots/src/helpers/with-auto-restart.ts` | New helper function for retry logic |
| `apps/bots/src/index.ts` | Refactored to use `withAutoRestart` wrapper |
| `apps/bots/src/trpc.ts` | Added `RESTARTING` event code |
| `apps/milo/src/server/database/schema.ts` | Added `RESTARTING` to event codes and descriptions |

### Execution Flow

```
┌─────────────────────────────────────────────────────────┐
│                    main() entry point                    │
│  1. Fetch bot config (once, outside retry loop)          │
│  2. Create services (reused across retries)              │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│               withAutoRestart() wrapper                  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Attempt 1: createBot() → bot.run()             │    │
│  │  ❌ Error (timeout)                              │    │
│  └─────────────────────────────────────────────────┘    │
│  ↓ Report RESTARTING event, cleanup, delay 5s           │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Attempt 2: createBot() → bot.run()             │    │
│  │  ❌ Error (timeout)                              │    │
│  └─────────────────────────────────────────────────┘    │
│  ↓ Report RESTARTING event, cleanup, delay 5s           │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Attempt 3: createBot() → bot.run()             │    │
│  │  ✅ Success → DONE                               │    │
│  └─────────────────────────────────────────────────┘    │
│  OR after 4 failures → Report FATAL, exit(1)            │
└─────────────────────────────────────────────────────────┘
```

### Key Behaviors

1. **Fresh Bot Instance Per Attempt**: Each retry creates a completely new bot instance with fresh browser state

2. **Cleanup Between Retries**: Workers are stopped, event listeners removed, browser resources released

3. **Services Reused**: The logger, tRPC client, and other services persist across retries for consistent logging

4. **RESTARTING Event**: Logged to Milo with attempt number and error message for debugging

5. **FATAL Only After Exhaustion**: Only reported after all 4 attempts fail

## Configuration

```typescript
// apps/bots/src/index.ts
const MAX_RESTART_ATTEMPTS = 3;      // Number of restart attempts (total = 4)
const RESTART_DELAY_MS = 5000;       // Delay between attempts (5 seconds)
```

## Monitoring

### Events in Milo

| Event | Description |
|-------|-------------|
| `RESTARTING` | Bot is restarting after error. `data.description` contains attempt number and error. |
| `FATAL` | All attempts exhausted. `data.description` includes total attempts and final error. |

### Screenshots

- `restart.png` - Captured before each restart attempt
- `fatal.png` - Captured after all attempts fail

## Future Improvements

1. **Exponential Backoff**: Increase delay between retries
2. **Per-Error Retry Limits**: Different retry counts for different error types
3. **Circuit Breaker**: Stop retrying if too many bots are failing simultaneously
4. **Configurable Per-Bot**: Allow caller to specify retry behavior
