# Graceful Job Stop for Infrastructure Page

**Date:** 2025-12-23
**Status:** Approved

## Problem

When stopping a K8s job from the infrastructure page, the job is deleted directly, causing the bot container to receive SIGTERM without a chance to gracefully disconnect from the meeting. This results in fatal errors in the bot.

## Solution

The backend `deleteJob` and `deleteJobs` mutations will first attempt to gracefully terminate the associated bot session by setting its status to `LEAVING`. The bot will detect this via its heartbeat mechanism and gracefully exit.

## Flow

```
User clicks "Stop job"
        ↓
Frontend calls deleteJob({ jobName })
        ↓
Backend looks up bot by platformIdentifier = jobName
        ↓
    ┌───────────────────────────────────────┐
    │ Bot found with active status?         │
    │ (IN_CALL, IN_WAITING_ROOM,            │
    │  JOINING_CALL, RECORDING)             │
    └───────────────────────────────────────┘
        │                    │
       YES                   NO
        ↓                    ↓
  Set status to          Delete K8s job
  "LEAVING"              directly
        ↓                    ↓
  Return success         Return success
  (fire & forget)
        ↓
  Bot detects LEAVING via heartbeat (~10s)
        ↓
  Bot gracefully exits meeting
        ↓
  Container exits → Job completes naturally
```

## Key Decisions

1. **Frontend unchanged** - Still calls same `deleteJob`/`deleteJobs` endpoints
2. **Fire and forget** - No waiting, immediate response to user
3. **Orphaned jobs** - Deleted directly if no bot found
4. **Bulk operations** - Same graceful logic applies to each job
5. **Active states only** - Graceful shutdown for `IN_CALL`, `IN_WAITING_ROOM`, `JOINING_CALL`, `RECORDING`

## Files to Modify

- `apps/milo/src/server/api/routers/infrastructure/k8s.ts` - Update `deleteJob` and `deleteJobs` mutations

## Implementation Details

### Active Statuses (Require Graceful Shutdown)
- `IN_CALL`
- `IN_WAITING_ROOM`
- `JOINING_CALL`
- `RECORDING`

### Non-Active Statuses (Direct Job Deletion)
- `DEPLOYING`
- `DONE`
- `FATAL`
- `CALL_ENDED`
- `LEAVING` (already being handled)
