# AWS ECS Task Stop Feature Design

**Date**: 2025-12-27
**Status**: Approved

## Overview

Add the ability to stop AWS ECS tasks from the infrastructure page table, including bulk action support. This mirrors the existing K8s job stop functionality.

## Requirements

1. **Immediate action** - No confirmation dialog (matches K8s behavior)
2. **Stoppable statuses** - RUNNING and PROVISIONING tasks can be stopped
3. **Feedback** - Toast with details: "Stopped 3 tasks (1 failed)"

## API Design

### tRPC Router Mutations

**File**: `apps/milo/src/server/api/routers/infrastructure/aws.ts`

```typescript
// Single task stop
stopTask: protectedProcedure
  .input(z.object({ taskArn: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .mutation(...)

// Bulk task stop
stopTasks: protectedProcedure
  .input(z.object({ taskArns: z.array(z.string()) }))
  .output(z.object({ succeeded: z.number(), failed: z.number() }))
  .mutation(...)
```

Both leverage existing `AWSPlatformService.stopBot()` which handles "task not found" gracefully.

## UI Design

### AWSTable Component Updates

**File**: `apps/milo/src/app/infrastructure/_components/infrastructure-table.tsx`

1. **State**: Add `rowSelection` state
2. **Mutations**: Add `stopTaskMutation` and `stopTasksMutation`
3. **Table meta**: Add `onStop` handler for individual row actions
4. **Bulk button**: Show when items selected, disabled when none stoppable

### Selection Logic

```typescript
const stoppableSelectedTasks = selectedItems
  .filter((item) => item.status === "ACTIVE" || item.status === "PENDING")
  .map((item) => item.platformId);
```

### Toast Feedback

- Success: "Stopped 3 tasks"
- Partial: "Stopped 2 tasks (1 failed)"

## Files Modified

| File | Changes |
|------|---------|
| `apps/milo/src/server/api/routers/infrastructure/aws.ts` | Add `stopTask` and `stopTasks` mutations |
| `apps/milo/src/app/infrastructure/_components/infrastructure-table.tsx` | Add row selection, mutations, bulk button to `AWSTable()` |

## Files Unchanged

- `infrastructure-columns.tsx` - Already has `onStop` in `InfrastructureTableMeta`
- `aws-platform-service.ts` - Already has `stopBot()` method

## Pattern Reference

Follows K8s table implementation exactly (lines 119-327 in infrastructure-table.tsx).
