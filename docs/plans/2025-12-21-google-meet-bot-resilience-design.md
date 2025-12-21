# Google Meet Bot Resilience Design

**Date**: 2025-12-21
**Status**: Approved for Implementation
**Author**: Claude (via brainstorming session)

## Problem Statement

When deploying 10+ bots to the same Google Meet meeting simultaneously, we observe >20% failure rate with two distinct failure modes:

1. **Name Input Fill Failure** (4 out of 5 crash logs): Bot finds the name input field but fails to fill it after 3 retries due to element visibility/detachment issues
2. **False Removal During Network Loss** (1 out of 5 crash logs): Bot successfully joins but gets marked as "removed" during temporary network disconnection

## Root Cause Analysis

### Issue 1: Name Input Fill Failure

**Evidence from logs** (bots 749, 751, 761, 765):
```
fill: Timeout 30000ms exceeded.
- element is not visible
- element was detached from the DOM, retrying
```

**Root cause**:
- Multiple bots hitting Google Meet's join screen simultaneously
- Google's reactive UI re-renders, causing elements to detach/become invisible
- Current retry logic waits full 30s timeout before retrying (90s total wasted)
- Element is located once and reused across retries (stale reference)

### Issue 2: False Removal During Network Loss

**Evidence from screenshot**: Shows "You lost your network connection. Trying to reconnect."

**Evidence from logs** (bot 754):
```
[RemovalDetector] No indicators found, starting grace period
[RemovalDetector] REMOVED: Indicators missing for 30+ seconds
```

**Root cause**:
- When network drops, all UI buttons disappear
- 30-second grace period isn't enough for reconnection
- Detector can't distinguish "kicked by host" vs "temporary network issue"

## Design

### Fix 1: Improved Name Input Fill Logic

**File**: `apps/bots/providers/google-meet/src/bot.ts`

#### Changes

| Setting | Current | New |
|---------|---------|-----|
| Timeout per attempt | 30s | 5s |
| Max retries | 3 | 8 |
| Total max time | ~90s | ~60s |
| Stabilization delay | None | Adaptive (200ms → 500ms → 1000ms) |
| Element re-location | No | Yes (fresh locator each attempt) |

#### New Method: `fillNameInputWithStability`

```typescript
/**
 * Fill the bot name input with stability checks.
 *
 * Key improvements over direct fill:
 * 1. Re-locates the element fresh each attempt (avoids stale references)
 * 2. Waits for element to be visible before interacting
 * 3. Adds adaptive stabilization delay based on retry count
 * 4. Clears any existing text before filling
 * 5. Uses shorter timeout (5s) for faster failure detection
 */
private async fillNameInputWithStability(
  botName: string,
  retryCount: number,
): Promise<void> {
  if (!this.page) throw new Error("Page not initialized");

  // 1. Re-find the name input element (fresh reference)
  const nameInputSelector = await this.findNameInput();
  if (!nameInputSelector) {
    throw new Error("Name input not found");
  }

  // 2. Wait for element to be visible
  await this.page.waitForSelector(nameInputSelector, {
    state: "visible",
    timeout: 5000,
  });

  // 3. Adaptive stabilization delay: 200ms → 500ms → 1000ms
  const stabilizationMs = Math.min(200 * Math.pow(2, retryCount), 1000);
  await setTimeout(stabilizationMs);

  // 4. Clear any existing text (triple-click selects all, then delete)
  const input = this.page.locator(nameInputSelector);
  await input.click({ clickCount: 3, timeout: 2000 });
  await this.page.keyboard.press("Backspace");

  // 5. Fill with shorter timeout
  await input.fill(botName, { timeout: 5000 });
}
```

#### Updated `joinCall` Usage

```typescript
// In joinCall(), replace the current fill logic:
let retryCount = 0;

await withRetry(
  async () => {
    await this.fillNameInputWithStability(botName, retryCount);
    retryCount++;
  },
  {
    maxRetries: 8,
    minDelayMs: 500,
    maxDelayMs: 5000,
    exponentialBase: 1.5,
    logger: this.logger,
    operationName: "Fill bot name",
    isRetryable: (e) =>
      FILL_RETRYABLE_ERRORS.some((err) => e.message.includes(err)),
  },
);
```

### Fix 2: Connection Lost Recovery

**File**: `apps/bots/providers/google-meet/src/selectors.ts`

#### New Selectors

```typescript
// Add to SELECTORS object:
connectionLostIndicators: [
  '//*[contains(text(), "lost your network connection")]',
  '//*[contains(text(), "Trying to reconnect")]',
  '//*[contains(text(), "Lost connection")]',
],
```

**File**: `apps/bots/providers/google-meet/src/detection/removal-detector.ts`

#### Updated Logic

```typescript
// Add new property
private reconnectingDetectedTime: number | null = null;

// Add new method
private async isReconnecting(): Promise<boolean> {
  if (!this.page) return false;

  for (const selector of SELECTORS.connectionLostIndicators) {
    if (await elementExists(this.page, selector, 1000)) {
      return true;
    }
  }
  return false;
}

// Update checkIndicatorsWithDebounce() to handle reconnection:
private async checkIndicatorsWithDebounce(): Promise<RemovalResult> {
  // ... existing indicator checks ...

  // No indicators found - check if we're reconnecting
  const reconnecting = await this.isReconnecting();

  if (reconnecting) {
    if (this.reconnectingDetectedTime === null) {
      this.reconnectingDetectedTime = Date.now();
      this.logger.info("[RemovalDetector] Network reconnection in progress, extending grace period");
    }

    const reconnectingDuration = Date.now() - this.reconnectingDetectedTime;

    if (reconnectingDuration < GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS) {
      this.logger.debug("[RemovalDetector] Waiting for reconnection", {
        reconnectingDurationMs: reconnectingDuration,
        maxWaitMs: GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS,
      });

      return { removed: false, immediate: false, reconnecting: true };
    }

    // Exceeded reconnection timeout
    this.logger.warn("[RemovalDetector] REMOVED: Reconnection timeout exceeded", {
      reconnectingDurationMs: reconnectingDuration,
    });

    return { removed: true, reason: "reconnection_timeout", immediate: false };
  }

  // Not reconnecting - reset reconnection timer
  if (this.reconnectingDetectedTime !== null) {
    this.logger.info("[RemovalDetector] Network reconnected successfully");
    this.reconnectingDetectedTime = null;
  }

  // ... rest of existing logic (sustained absence check) ...
}
```

### Fix 3: Constants Update

**File**: `apps/bots/providers/google-meet/src/constants.ts`

```typescript
export const GOOGLE_MEET_CONFIG = {
  DOMAIN: "meet.google.com",

  // Removal detection
  SUSTAINED_ABSENCE_THRESHOLD_MS: 30_000,      // Normal grace period: 30s
  RECONNECTION_GRACE_PERIOD_MS: 300_000,       // Reconnecting grace: 5 min

  // Name fill improvements
  NAME_FILL_TIMEOUT_MS: 5_000,                 // Per-attempt timeout: 5s
  NAME_FILL_MAX_RETRIES: 8,                    // Max attempts
  NAME_FILL_STABILIZATION_BASE_MS: 200,        // Adaptive base: 200ms
  NAME_FILL_STABILIZATION_MAX_MS: 1000,        // Adaptive max: 1000ms
};
```

### Fix 4: Type Updates

**File**: `apps/bots/src/detection/types.ts`

```typescript
export interface RemovalResult {
  removed: boolean;
  reason?: string;
  immediate: boolean;
  reconnecting?: boolean;  // NEW: indicates bot is waiting for reconnection
}
```

## Implementation Order

1. **Phase 1**: Update constants in `constants.ts`
2. **Phase 2**: Add connection lost selectors to `selectors.ts`
3. **Phase 3**: Implement `fillNameInputWithStability` in `bot.ts`
4. **Phase 4**: Update `RemovalDetector` with reconnection logic
5. **Phase 5**: Update types if needed
6. **Phase 6**: Run existing e2e tests to verify no regressions
7. **Phase 7**: Add new e2e tests for reconnection scenarios (optional)

## Testing Plan

### Manual Testing

1. Deploy single bot to meeting - verify successful join
2. Deploy 5 bots simultaneously - verify improved success rate
3. Deploy 10+ bots simultaneously - measure failure rate
4. Simulate network loss during call - verify bot waits for reconnection

### E2E Tests

Existing tests in `apps/bots/providers/google-meet/e2e/`:
- `admission.spec.ts` - Bot admission flow
- `lifecycle.spec.ts` - Full bot lifecycle
- `no-waiting-room.spec.ts` - Direct join scenarios

New tests to add:
- `resilience.spec.ts` - Name fill retry scenarios
- `network-recovery.spec.ts` - Connection loss recovery (requires network simulation)

## Metrics to Track

After deployment, monitor:
- Bot join success rate (target: >95%)
- Average time to join
- Reconnection events vs removal events
- Name fill retry counts

## Rollback Plan

If issues arise:
1. Revert constants to original values
2. All changes are backward-compatible
3. No database migrations required

## Appendix: Log Analysis

### Analyzed Files

| File | Bot ID | Failure Mode | Root Cause |
|------|--------|--------------|------------|
| `bot-749-logs-*.log` | 749 | Name fill timeout | Element detached |
| `bot-751-logs-*.log` | 751 | Name fill timeout | Element not visible |
| `bot-761-logs-*.log` | 761 | Name fill timeout | Element detached |
| `bot-765-logs-*.log` | 765 | Name fill timeout | Element not visible |
| `lost-connection-bot-754-*.log` | 754 | False removal | Network disconnection |

### Screenshot Evidence

`lost-connection-*.png`: Shows Google Meet UI with "You lost your network connection. Trying to reconnect." message, proving bot was still in call but network dropped.
