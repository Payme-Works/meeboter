# Google Meet Bot Pre-Join Screen Detection

**Date:** 2025-12-19
**Status:** Approved

## Problem

The Google Meet bot crashes when attempting to join meetings that show blocking screens before the name input field. The error `2 × locator resolved to hidden` indicates the element exists but is not visible due to overlaying screens (sign-in prompts, captcha, meeting errors, etc.).

## Solution

Add comprehensive detection for blocking screens with an incremental retry mechanism that reports specific error codes to the backend.

## Design

### New Event Codes

Add to `apps/bots/src/types.ts`:

```typescript
export enum EventCode {
  // ... existing codes ...

  SIGN_IN_REQUIRED = "SIGN_IN_REQUIRED",
  CAPTCHA_DETECTED = "CAPTCHA_DETECTED",
  MEETING_NOT_FOUND = "MEETING_NOT_FOUND",
  MEETING_ENDED = "MEETING_ENDED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  JOIN_BLOCKED = "JOIN_BLOCKED",
}
```

### Blocking Screen Selectors

Add to `apps/bots/providers/meet/src/bot.ts`:

```typescript
// Blocking screen selectors
const signInButton = '//button[.//span[text()="Sign in"]]';
const signInPrompt = '[data-identifier="signInButton"], [aria-label="Sign in"]';
const useWithoutAccountButton = '//button[.//span[text()="Use without an account"]]';

const captchaFrame = 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]';
const captchaChallenge = '[class*="captcha"], #captcha';

const meetingNotFound = '//div[contains(text(), "Check your meeting code")]';
const meetingInvalid = '//div[contains(text(), "Invalid video call name")]';
const meetingEnded = '//div[contains(text(), "This meeting has ended")]';
const meetingUnavailable = '//div[contains(text(), "not available")]';

const permissionDenied = '//div[contains(text(), "denied access")]';
const notAllowedToJoin = '//div[contains(text(), "not allowed to join")]';
```

### Detection Logic

New method `detectBlockingScreen()`:
- Iterates through blocking screen categories
- Checks multiple selectors per category
- Returns specific `EventCode` or `null`

### Retry Mechanism

New method `waitForJoinScreen(maxAttempts = 3, attemptTimeout = 10000)`:
- 3 attempts with 10s timeout each (30s total vs current 15s)
- Checks for blocking screens between retries
- Reports specific event code when detected
- Falls back to `JOIN_BLOCKED` if no specific blocker found

### Integration

Replace in `joinMeeting()`:

```typescript
// Before
await this.page.waitForSelector(enterNameField, { timeout: 15000 });

// After
await this.waitForJoinScreen();
```

## File Changes

| File | Changes |
|------|---------|
| `apps/bots/src/types.ts` | Add 6 new `EventCode` values |
| `apps/bots/providers/meet/src/bot.ts` | Add selectors, detection methods, update `joinMeeting()` |

## Risks & Mitigations

- **Google UI changes:** Multiple selectors per category, retry fallback
- **False positives:** Only report after visibility check fails

## Future Work

- User agent update (separate concern)
- Backend handling of new event codes
- Attempt "Use without account" button click
