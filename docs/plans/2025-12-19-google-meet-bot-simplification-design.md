# Google Meet Bot Simplification Design

## Problem

The Google Meet bot (`apps/bots/providers/meet/src/bot.ts`) has grown to 1830 lines with complex detection logic that causes mystery exits. The bot unexpectedly leaves calls at various times with no clear pattern, and lack of log visibility makes debugging nearly impossible.

## Goals

1. Simplify the codebase from ~1830 lines to ~600-700 lines
2. Add clear logging at every state transition
3. Remove over-engineered detection logic that causes false positives
4. Extract reusable helpers for other bot providers

## Design

### 1. Simplified State Flow

```
LAUNCHING → NAVIGATING → JOINING → IN_CALL → LEAVING → ENDED
```

Every state transition will be logged with:
```typescript
this.logger.info("State: JOINING → IN_CALL", {
  reason: "Leave button detected",
  elapsed: "12.5s"
});
```

### 2. Simplified Join Flow

**Current:** ~400 lines with complex detection strategies, text parsing, blocking screen detection, multiple retry mechanisms.

**New:** ~150 lines with simple flow:
1. Navigate to URL (with retry for network errors)
2. Wait for name field (simple waitForSelector, max 30s)
3. Fill name, turn off mic/camera
4. Click "Join now" OR "Ask to join" (whichever appears)
5. Wait for leave button to appear (respects waitingRoomTimeout)
6. Done - we're in call

**Removed:**
- `waitForJoinScreen()` method with retry logic
- `detectBlockingScreen()` method
- Complex polling loop `checkIfInCall()` with 4 detection strategies
- Anti-detection mouse movements
- `admissionConfirmationIndicators` text matching

### 3. Simplified Meeting Loop

**Current:** ~400 lines with participant monitoring, MutationObservers, speaker tracking, popup handling.

**New:** ~100 lines:
```typescript
async monitorCall(): Promise<void> {
  if (this.settings.recordingEnabled) {
    await this.startRecording();
  }

  if (this.chatEnabled) {
    await this.ensureChatPanelOpen();
  }

  while (true) {
    if (this.leaveRequested) {
      this.logger.info("Leaving: User requested via API");
      break;
    }

    if (await this.hasBeenRemovedFromCall()) {
      this.logger.info("Leaving: Removed from meeting");
      break;
    }

    if (this.chatEnabled) {
      await this.processChatQueue();
    }

    await setTimeout(5000);
  }

  await this.leaveCall();
}
```

**Removed:**
- `handleInfoPopup()` calls
- Participant panel opening
- All participant monitoring via MutationObserver
- Speaker activity tracking (`registeredActivityTimestamps`)
- The disabled "everyone left" detection

### 4. Simplified Kick Detection

**Current:** 3 conditions with multiple selector checks.

**New:** 2 simple checks:
```typescript
private async hasBeenRemovedFromCall(): Promise<boolean> {
  // Check 1: Explicit kick dialog
  const hasKickDialog = await elementExists(
    this.page,
    '//button[.//span[text()="Return to home screen"]]'
  );

  if (hasKickDialog) {
    this.logger.info("Kick detected: Return to home screen dialog");
    return true;
  }

  // Check 2: Leave button gone
  const hasLeaveButton = await elementExists(
    this.page,
    'button[aria-label="Leave call"]'
  );

  if (!hasLeaveButton) {
    this.logger.info("Kick detected: Leave button no longer visible");
    return true;
  }

  return false;
}
```

### 5. Shared Helpers

Extract reusable browser utilities to `apps/bots/src/helpers/`:

```
apps/bots/src/helpers/
├── index.ts                  # Re-exports all helpers
├── element-exists.ts         # elementExists(page, selector)
├── wait-for-element.ts       # waitForElement(page, selector, options)
├── click-if-exists.ts        # clickIfExists(page, selector, options)
└── navigate-with-retry.ts    # navigateWithRetry(page, url, options)
```

Each helper is one file with a single function, reusable by Zoom and Teams bots.

### 6. Method Nomenclature

| Current Name | New Name |
|--------------|----------|
| `run()` | `start()` |
| `joinMeeting()` | `joinCall()` |
| `meetingActions()` | `monitorCall()` |
| `checkKicked()` | `hasBeenRemovedFromCall()` |
| `leaveMeeting()` | `leaveCall()` |
| `endLife()` | `cleanup()` |
| `launchBrowser()` | `initializeBrowser()` |
| `getFFmpegParams()` | `buildFFmpegArgs()` |
| `screenshot()` | `captureScreenshot()` |
| `openChatPanel()` | `ensureChatPanelOpen()` |
| `getNextQueuedMessage()` | `dequeueNextMessage()` |

**New private helper methods:**
- `disableMediaDevices()` - Turn off mic/camera
- `clickJoinButton()` - Find and click Join/Ask to join button
- `waitForCallEntry()` - Wait until we're actually in the call

### 7. Code Organization

Group methods by responsibility:

```typescript
// ============================================
// SECTION 1: SELECTORS (constants at top)
// ============================================
const SELECTORS = {
  nameInput: 'input[type="text"][aria-label="Your name"]',
  joinNowButton: '//button[.//span[text()="Join now"]]',
  askToJoinButton: '//button[.//span[text()="Ask to join"]]',
  leaveButton: 'button[aria-label="Leave call"]',
  kickDialog: '//button[.//span[text()="Return to home screen"]]',
  muteButton: '[aria-label*="Turn off microphone"]',
  cameraOffButton: '[aria-label*="Turn off camera"]',
  chatInput: '//input[@aria-label="Send a message to everyone"]',
  chatButton: '//button[@aria-label="Chat with everyone"]',
} as const;

// ============================================
// SECTION 2: LIFECYCLE (public entry points)
// ============================================
// - start()
// - joinCall()
// - leaveCall()
// - cleanup()

// ============================================
// SECTION 3: MEETING ACTIONS (in-call behavior)
// ============================================
// - monitorCall()
// - hasBeenRemovedFromCall()
// - processChatQueue()
// - sendChatMessage()
// - ensureChatPanelOpen()

// ============================================
// SECTION 4: RECORDING (FFmpeg management)
// ============================================
// - startRecording()
// - stopRecording()
// - getRecordingPath()
// - buildFFmpegArgs()
// - getSpeakerTimeframes()

// ============================================
// SECTION 5: BROWSER UTILITIES (private helpers)
// ============================================
// - initializeBrowser()
// - captureScreenshot()
// - disableMediaDevices()
// - clickJoinButton()
// - waitForCallEntry()
```

## Expected Outcome

- **Lines of code:** ~600-700 (down from 1830)
- **Clearer flow:** Simple state machine with logged transitions
- **Better debugging:** Every decision point logged
- **Fewer mystery exits:** Removed fragile detection logic
- **Reusable code:** Shared helpers for other bot providers

## Implementation Plan

1. Create shared helpers in `apps/bots/src/helpers/`
2. Rewrite `GoogleMeetBot` class with new structure
3. Update base `Bot` interface for renamed methods
4. Run lint and typecheck
5. Test with real meetings
