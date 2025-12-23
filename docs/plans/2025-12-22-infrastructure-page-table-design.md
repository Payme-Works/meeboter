# Infrastructure Page Table-Based Redesign

## Overview

Redesign the infrastructure page to use table-based layouts with platform-specific status cards aligned to official platform nomenclatures.

## Design Decisions

### Stats Cards - Platform-Specific Statuses

Each platform displays 4 status cards using official nomenclature:

| Platform | Status 1 | Status 2 | Status 3 | Status 4 |
|----------|----------|----------|----------|----------|
| **Coolify** | Idle | Deploying | Healthy | Error |
| **Kubernetes** | Pending | Active | Succeeded | Failed |
| **AWS ECS** | Provisioning | Running | Stopped | Failed |

### Table Component

| Column | Type | Sortable | Notes |
|--------|------|----------|-------|
| Bot ID | `#123` format | ✓ | |
| Status | Colored badge | ✗ | Platform-specific status values |
| Name | Truncated text | ✗ | Bot display name |
| Platform ID | Mono, truncated | ✗ | K8s: "Job Name", AWS: "Task ARN", Coolify: "Slot ID" |
| Age | Relative time | ✓ | Default sort: newest first |
| Actions | Icon button | ✗ | Opens bot dialog |

### Status Filter

Multi-select dropdown with platform-specific statuses:
- **Coolify**: Idle, Deploying, Healthy, Error
- **K8s**: Pending, Active, Succeeded, Failed
- **AWS**: Provisioning, Running, Stopped, Failed

### URL State (nuqs)

Server-side search params using nuqs `createSearchParamsCache`:

**File:** `infrastructure/search-params.ts`

```typescript
import { createSearchParamsCache, parseAsArrayOf, parseAsString } from "nuqs/server";

export const searchParamsCache = createSearchParamsCache({
  // Status filter - array of platform-specific statuses
  status: parseAsArrayOf(parseAsString).withDefault([]),

  // Sort - format: field.asc or field.desc
  sort: parseAsString.withDefault("age.desc"),
});
```

**URL Examples:**
- `?status=HEALTHY&status=DEPLOYING` - Filter by multiple statuses
- `?sort=age.desc` - Sort by age descending
- `?sort=botId.asc` - Sort by bot ID ascending
- `?status=ACTIVE&sort=age.asc` - Combined filter and sort

### Environment Variable

Rename existing `DEPLOYMENT_PLATFORM` to `NEXT_PUBLIC_DEPLOYMENT_PLATFORM` for client-side access.

### API Structure

```typescript
infrastructure
  ├── coolify
  │   ├── getStats()      // { IDLE, DEPLOYING, HEALTHY, ERROR }
  │   └── getSlots()      // List of pool slots (status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR")
  ├── k8s
  │   ├── getStats()      // { PENDING, ACTIVE, SUCCEEDED, FAILED }
  │   └── getJobs()       // List of K8s jobs (status: "PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED")
  └── aws
      ├── getStats()      // { PROVISIONING, RUNNING, STOPPED, FAILED }
      └── getTasks()      // List of ECS tasks (status: "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED")
```

## Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `env.ts` | Rename `DEPLOYMENT_PLATFORM` → `NEXT_PUBLIC_DEPLOYMENT_PLATFORM` |
| `routers/infrastructure.ts` | Restructure with platform sub-routers |
| `bot-pool-service.ts` | Rename slot status `busy` → `healthy` |
| `kubernetes-platform-service.ts` | Add `succeeded`/`failed` to metrics |
| `aws-platform-service.ts` | Add `getClusterMetrics()` method |
| `infrastructure-stats-cards.tsx` | Platform-specific status cards |
| `k8s-jobs-section.tsx` | Convert to shared table component |
| `page.tsx` | Update to use new API structure |

### New Files

| File | Purpose |
|------|---------|
| `infrastructure/search-params.ts` | nuqs server-side search params cache |
| `infrastructure/_components/infrastructure-table.tsx` | Shared table component for all platforms |
| `infrastructure/_components/infrastructure-columns.tsx` | Column definitions with platform-specific labels |

### Database Migration

Rename `bot_pool_slots.status` value `busy` → `healthy`:
- Update enum/check constraint
- Update existing rows
- Update all code references

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: Infrastructure [Platform Badge]     [Live] [Refresh]│
├─────────────────────────────────────────────────────────────┤
│  Stats Cards (platform-specific)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │[STATUS 1]│ │[STATUS 2]│ │[STATUS 3]│ │[STATUS 4]│        │
│  │    5     │ │    2     │ │    8     │ │    0     │        │
│  │subtext   │ │subtext   │ │subtext   │ │subtext   │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────────────────┤
│  Active Jobs                              [Status Filter ▼]  │
├─────────┬───────────┬────────────┬─────────────┬─────┬──────┤
│ Bot ID ↕│ Status    │ Name       │ Platform ID │ Age↕│Action│
├─────────┼───────────┼────────────┼─────────────┼─────┼──────┤
│ #142    │ [HEALTHY] │ Daily St...│ slot-1      │ 5m  │  👁  │
│ #138    │ [DEPLOYING]│ Weekly M..│ slot-2      │ 12m │  👁  │
└─────────┴───────────┴────────────┴─────────────┴─────┴──────┘
```

## References

- [Coolify Health Checks](https://coolify.io/docs/knowledge-base/health-checks)
- [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [AWS ECS Task Lifecycle](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-lifecycle-explanation.html)
