# Google Meet Provider E2E Tests Design

## Overview

End-to-end tests for the Google Meet bot provider, testing the full bot lifecycle using Playwright to orchestrate multiple browser contexts (host, bot, participants).

## Directory Structure

```
apps/bots/
├── providers/
│   └── google-meet/
│       ├── src/                      # Existing provider implementation
│       ├── e2e/
│       │   ├── fixtures/
│       │   │   ├── host.fixture.ts         # Host browser, meet creation
│       │   │   └── browser-auth.fixture.ts # Persistent auth state
│       │   ├── admission.spec.ts           # Waiting room → admit → in-call
│       │   ├── no-waiting-room.spec.ts     # Direct join
│       │   ├── lifecycle.spec.ts           # Full lifecycle with participants
│       │   └── .auth/                      # Git-ignored auth state
│       └── playwright.config.ts            # Provider-specific E2E config
├── package.json                            # Add @playwright/test
```

## Dependencies

- `@playwright/test` - Test runner with fixtures (new)
- `playwright` - Already installed for bot providers

## Fixtures

### `browser-auth.fixture.ts`

Handles persistent Google authentication:

- Checks for existing auth state in `.auth/google-state.json`
- If missing, opens browser for manual login (first run only)
- Saves state after successful login for reuse
- Provides `authenticatedContext` fixture to tests

### `host.fixture.ts`

Creates and manages Google Meet sessions:

- Extends browser-auth fixture
- `hostPage`: Authenticated page ready to create/control meets
- `meetUrl`: Created meet URL
- `createMeet()`: Navigates to meet.google.com, creates instant meet
- `admitParticipant(name)`: Clicks admit for waiting room participant
- `toggleWaitingRoom(enabled)`: Enables/disables waiting room in settings
- `addParticipant()`: Opens new browser context, joins as participant
- `cleanup()`: Ends meet, closes all contexts

## Test Scenarios

### `admission.spec.ts` - Waiting Room Flow

1. **Bot enters waiting room and gets admitted by host**
   - Bot joins meet URL
   - Assert bot emits IN_WAITING_ROOM event
   - Host admits bot
   - Assert bot emits IN_CALL event
   - Assert bot.getState() === "IN_CALL"

2. **Bot times out in waiting room when not admitted**
   - Bot joins with short waitingRoomTimeout
   - Host does NOT admit
   - Assert bot emits appropriate timeout/error event

### `no-waiting-room.spec.ts` - Direct Join

1. **Bot joins directly when waiting room disabled**
   - Host disables waiting room
   - Bot joins meet URL
   - Assert bot skips IN_WAITING_ROOM, goes straight to IN_CALL

### `lifecycle.spec.ts` - Full Flow with Participants

1. **Complete bot lifecycle with participant events**
   - Bot joins, gets admitted
   - addParticipant() joins → assert PARTICIPANT_JOIN event
   - Participant leaves → assert PARTICIPANT_LEAVE event
   - Host ends meet → assert CALL_ENDED event
   - Assert final state is DONE

## Configuration

### `playwright.config.ts`

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    headless: false,
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

### Package Scripts

```json
{
  "scripts": {
    "test:e2e": "playwright test --config=providers/google-meet/playwright.config.ts"
  }
}
```

**Usage:**
```bash
bun run test:e2e                    # Default run
bun run test:e2e -- --headed        # Headed mode
bun run test:e2e -- --debug         # Debug mode
bun run test:e2e -- --ui            # Playwright UI
```

## First-Time Setup

1. Run `bun run test:e2e`
2. Browser opens for manual Google login (one-time)
3. Auth state saved to `.auth/`
4. Subsequent runs use saved state automatically

## Test Scope

- **Full lifecycle**: Join → Wait room → In-call → Participant events → Leave
- **Both admission scenarios**: With waiting room (auto-admit) and without waiting room
- **Multiple participants**: Spin up additional browser contexts to simulate participants
