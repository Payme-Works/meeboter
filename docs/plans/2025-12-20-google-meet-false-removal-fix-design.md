# Google Meet Bot False Removal Detection Fix

## Problem Statement

When deploying 10+ Google Meet bots simultaneously on the same Coolify host, bots incorrectly detect removal from calls and exit prematurely. The meeting is still active with participants, but the bot exits with `removed_from_call` status.

### Root Cause Analysis

1. **Resource contention**: Multiple browser instances compete for CPU/memory on the same host
2. **Page unresponsiveness**: Under load, Playwright page operations become slow (checks take 5-55 seconds instead of <1 second)
3. **Google Meet reconnection events**: Internal reconnections add URL params like `?arjcm=1&arra=4&hma=1&hmv=1&pplid=...`
4. **DOM transitional state**: During reconnections, the page briefly loses all UI indicators
5. **False positive trigger**: If `hasBeenRemovedFromCall` runs during this transition AND completes quickly, it triggers exit

### Evidence from Logs

All 4 bots in the test showed the same pattern:
- Indicator checks timing out (5-55 seconds) indicating page unresponsiveness
- URL suddenly gains query parameters (reconnection event)
- Immediately after, all 6 indicators return `exists: false` in 1-100ms each
- Bot exits with `REMOVED: No in-call indicators found`

### Current Protection (Insufficient)

The existing code has one protection:
- If ALL indicator checks timeout → assumes still in call

But this doesn't protect against:
- Checks completing quickly during DOM transitional states

## Solution Design

### Exit Condition Logic (Hybrid Approach)

**Immediate Exit (no delay):**
1. Kick dialog visible ("Return to home screen" button)
2. Domain changed (no longer on `meet.google.com`)
3. URL path changed (different meeting code, redirect to homepage)

**Delayed Exit (sustained absence):**
4. All 6 indicators missing for 30+ consecutive seconds while still on the correct meeting URL

### Why 30 Seconds?

- Google Meet reconnections/re-renders typically complete in 5-15 seconds
- Provides buffer for slow page recovery under heavy load
- Still detects actual meeting-end scenarios where host ends without kick dialog

### Implementation

#### New State Properties

```typescript
// In GoogleMeetBot class
private indicatorsMissingStartTime: number | null = null;
private originalMeetingPath: string | null = null;

private static readonly SUSTAINED_ABSENCE_THRESHOLD_MS = 30000;
```

#### Updated hasBeenRemovedFromCall Logic

```
1. Check kick dialog → if found, return REMOVED immediately
2. Check domain → if not meet.google.com, return REMOVED immediately
3. Check URL path → if different from original meeting, return REMOVED immediately
4. Check indicators:
   - If ANY indicator found:
     - Reset indicatorsMissingStartTime to null
     - Return NOT_REMOVED
   - If NO indicators found:
     - If indicatorsMissingStartTime is null:
       - Set it to Date.now()
       - Return NOT_REMOVED (start grace period)
     - If elapsed time < 30s:
       - Return NOT_REMOVED (still in grace period)
     - If elapsed time >= 30s:
       - Return REMOVED (sustained absence confirmed)
```

#### Capture Original Meeting Path

After successful navigation in `joinCall()`:
```typescript
this.originalMeetingPath = new URL(this.page.url()).pathname;
```

### Files to Modify

1. `apps/bots/providers/google-meet/src/bot.ts`
   - Add new state properties
   - Capture original meeting path after navigation
   - Refactor `hasBeenRemovedFromCall` with debounce logic
   - Add logging for grace period tracking

### Testing Strategy

1. Deploy 10+ bots to same meeting simultaneously
2. Verify bots stay in call for full meeting duration
3. Verify bots still exit properly when:
   - Host kicks the bot (kick dialog)
   - Host ends the meeting (indicators gone for 30+ seconds)
   - Bot is redirected away from meeting

### Rollback Plan

If issues arise, the change is isolated to `hasBeenRemovedFromCall` method and can be reverted by removing the time-based debounce logic.
