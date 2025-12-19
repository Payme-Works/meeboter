# Remove from Call Feature Design

**Status**: ✅ Implemented

## Overview

Add a "Remove from Call" action allowing users to manually remove bots from meetings. This addresses three user scenarios:

1. **Early meeting end** - Meeting finished earlier than expected
2. **Changed mind** - User deployed a bot but no longer wants it
3. **Resource management** - Free up pool slots for other bots

## Nomenclature

**Action name**: "Remove from Call"

Chosen for clarity, it describes exactly what happens: the bot is removed from the call.

## Feature Scope

### Eligible Bot Statuses

The "Remove from Call" action is available only for bots in meeting states:

| Status | Shows Button |
|--------|--------------|
| QUEUED | No |
| DEPLOYING | No |
| JOINING_CALL | No |
| IN_WAITING_ROOM | **Yes** |
| IN_CALL | **Yes** |
| RECORDING | **Yes** |
| CALL_ENDED | No |
| DONE | No |
| FATAL | No |

### Confirmation

Always show a confirmation dialog before removing a bot:

```
┌─────────────────────────────────────────────┐
│  Remove Bot from Call?                      │
│                                             │
│  This will immediately disconnect "{name}"  │
│  from the meeting. Any ongoing recording    │
│  will be stopped.                           │
│                                             │
│  This action cannot be undone.              │
│                                             │
│              [Cancel]  [Remove from Call]   │
└─────────────────────────────────────────────┘
```

## Backend Design

### New tRPC Procedure

**Procedure**: `bots.removeFromCall`

```typescript
removeFromCall: protectedProcedure
  .input(z.object({ botId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // 1. Validate bot exists and belongs to user
    const bot = await db.query.botsTable.findFirst({
      where: and(
        eq(botsTable.id, input.botId),
        eq(botsTable.userId, ctx.session.user.id)
      ),
    });

    if (!bot) throw new TRPCError({ code: "NOT_FOUND" });

    // 2. Validate bot is in eligible status
    const eligibleStatuses = ["IN_WAITING_ROOM", "IN_CALL", "RECORDING"];
    if (!eligibleStatuses.includes(bot.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Bot is not in an active call"
      });
    }

    // 3. Log event for audit trail
    await services.events.report(bot.id, [{
      eventType: "USER_REMOVED_FROM_CALL",
      description: "Bot manually removed from call by user"
    }]);

    // 4. Update status and release resources
    await db.update(botsTable)
      .set({ status: "DONE" })
      .where(eq(botsTable.id, input.botId));

    // 5. Release pool slot (fire and forget)
    void services.deployment.release(input.botId);

    return { success: true };
  });
```

### Status After Removal

Use existing `DONE` status to avoid schema migration. The `USER_REMOVED_FROM_CALL` event provides audit trail to distinguish user-initiated removal from natural endings.

## Frontend Design

### Bots Page Table

**Location**: `apps/milo/src/app/bots/page.tsx`

Modify Actions column to show two buttons for active bots:

```
| Actions                        |
|--------------------------------|
| [Details] [Remove from Call]   |  ← IN_WAITING_ROOM, IN_CALL, RECORDING
| [Details]                      |  ← all other statuses
```

**Button styling**:
- Details: Secondary/outline variant
- Remove from Call: Destructive variant (red)

### Recent Bots Widget

**Location**: `apps/milo/src/app/_components/recent-bots.tsx`

#### Sorting Change

Sort active bots first, then by creation date descending.

Active statuses (priority order):
1. IN_CALL
2. RECORDING
3. IN_WAITING_ROOM
4. JOINING_CALL
5. DEPLOYING
6. QUEUED

Then terminal statuses by recency: DONE, FATAL, CALL_ENDED

#### Hover Action

On hover over eligible bot rows, show a small X icon button:

```
│  🟢 Bot 1        Zoom     IN_CALL    2m    [✕]  │  ← hover reveals button
```

- Tooltip: "Remove from Call"
- Only for IN_WAITING_ROOM, IN_CALL, RECORDING
- Clicking opens same confirmation dialog

### Confirmation Dialog Component

**Location**: `apps/milo/src/app/bots/_components/remove-from-call-dialog.tsx`

Reusable AlertDialog component accepting:
- `botId: string`
- `botName: string`
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `onSuccess?: () => void`

## Files to Modify

### Backend
1. `apps/milo/src/server/api/routers/bots.ts` - Add removeFromCall procedure

### Frontend
2. `apps/milo/src/app/bots/page.tsx` - Add button to Actions column
3. `apps/milo/src/app/bots/_components/remove-from-call-dialog.tsx` - New confirmation dialog
4. `apps/milo/src/app/_components/recent-bots.tsx` - Add sorting + hover action

### i18n
5. Add keys to all locale files (en, pt-BR, es)

## i18n Keys

```json
{
  "bots": {
    "actions": {
      "removeFromCall": "Remove from Call"
    },
    "removeDialog": {
      "title": "Remove Bot from Call?",
      "description": "This will immediately disconnect \"{name}\" from the meeting. Any ongoing recording will be stopped.",
      "warning": "This action cannot be undone.",
      "confirm": "Remove from Call"
    }
  }
}
```

## Implementation Order

1. Backend: Add tRPC procedure
2. Frontend: Create confirmation dialog component
3. Frontend: Add button to Bots Page table
4. Frontend: Update Recent Bots sorting
5. Frontend: Add hover action to Recent Bots
6. i18n: Add all translation keys
7. Testing: Manual verification with Playwright MCP
