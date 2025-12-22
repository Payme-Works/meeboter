# Infrastructure Card Design

**Date**: 2025-12-22
**Status**: Approved
**Replaces**: Pool Card (`pool-card.tsx`)

## Overview

Replace the Coolify-specific Pool Card with a platform-agnostic Infrastructure Card that works across all deployment platforms (K8s, AWS ECS, Coolify).

## Design Decisions

1. **Component Strategy**: Abstracted "Activity Card" focusing on bot activity
2. **Visualization**: Stacked bars/segments showing proportional bot status
3. **Platform Details**: Collapsed by default, expandable for platform-specific info
4. **Naming**: "Infrastructure" → Links to `/infrastructure` (migrated from `/pool`)
5. **Migration**: Full replacement, no gradual transition

## Visual Design

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Infrastructure                                  ● Live  │
│                                                             │
│  ┌──┬───┬─────────────────────────────────────┐            │
│  │▓▓│███│█████████████████████████████████████│            │
│  └──┴───┴─────────────────────────────────────┘            │
│                                                             │
│  ○ 2 deploying  ·  ○ 3 joining  ·  ● 8 in call             │
│                                                             │
│  ─────────────────────────────────────────────             │
│  25 today  ·  12 completed  ·  0 failed                    │
│                                                             │
│  ▾ Platform details                    ⎈ Kubernetes        │
│  ┌─────────────────────────────────────────────┐           │
│  │ 5 jobs active · 0 pending · 12 completed    │           │
│  │ Cluster: k3s-0 · Namespace: meeboter        │           │
│  └─────────────────────────────────────────────┘           │
│                                                             │
│  View Infrastructure                                    →   │
└─────────────────────────────────────────────────────────────┘
```

## Component Elements

| Element | Description |
|---------|-------------|
| **Header** | "Infrastructure" with lightning/zap icon, live indicator top-right |
| **Stacked Bar** | Proportional segments by status: deploying (blue), joining (amber), in-call (green) |
| **Stats Line** | Active bot counts by status with colored indicators |
| **Daily Summary** | Today's totals: bots run, completed, failed |
| **Platform Section** | Collapsed by default, chevron toggle, shows platform-specific metrics |
| **Platform Badge** | Small badge showing current platform icon + name |
| **Footer** | "View Infrastructure →" links to `/infrastructure` |

## Color Scheme

| Status | Color | Tailwind Class |
|--------|-------|----------------|
| Deploying | Blue | `bg-blue-500` |
| Joining | Amber (pulse) | `bg-amber-500 animate-pulse` |
| In Call | Green | `bg-green-500` |
| Completed | Muted | `bg-muted` |
| Failed | Red | `bg-red-500` |

## Platform-Specific Details

### Kubernetes
```
⎈ 5 jobs active · 0 pending · 12 completed
Cluster: k3s-0 · Namespace: meeboter
```
- Icon: `⎈` (helm wheel) or Kubernetes logo
- Metrics: active jobs, pending jobs, completed jobs
- Details: cluster name, namespace

### AWS ECS
```
◈ 5 tasks running · Cluster: meeboter-prod
Region: us-east-1
```
- Icon: `◈` or AWS icon
- Metrics: running tasks
- Details: cluster name, region

### Coolify
```
⬡ 8/16 slots · 5 idle · 3 busy
Queue: 0 pending
```
- Icon: `⬡` (hexagon)
- Metrics: slots used/total, idle, busy
- Details: queue depth

## Data Requirements

### Bot Activity (Platform-Agnostic)
```typescript
interface BotActivityStats {
  deploying: number;
  joiningCall: number;
  inWaitingRoom: number;
  inCall: number;
  callEnded: number;
  // Daily stats
  todayTotal: number;
  todayCompleted: number;
  todayFailed: number;
}
```

### Platform Details (Union Type)
```typescript
type PlatformDetails =
  | { platform: 'k8s'; activeJobs: number; pendingJobs: number; completedJobs: number; cluster: string; namespace: string }
  | { platform: 'aws'; runningTasks: number; cluster: string; region: string }
  | { platform: 'coolify'; slotsUsed: number; slotsTotal: number; idle: number; busy: number; queueDepth: number };
```

## Migration Plan

1. Create new `infrastructure-card.tsx` component
2. Create tRPC endpoint for unified bot activity stats
3. Rename `/pool` route to `/infrastructure`
4. Update dashboard to use `<InfrastructureCard />` instead of `<PoolCard />`
5. Update navigation links
6. Delete old `pool-card.tsx`

## Files to Create/Modify

| Action | File |
|--------|------|
| Create | `apps/milo/src/app/_components/infrastructure-card.tsx` |
| Create | `apps/milo/src/server/api/routers/infrastructure.ts` |
| Rename | `apps/milo/src/app/pool/` → `apps/milo/src/app/infrastructure/` |
| Modify | `apps/milo/src/app/page.tsx` (use new card) |
| Delete | `apps/milo/src/app/_components/pool-card.tsx` |

## Animation & Interactions

- **Live Indicator**: Pulsing green dot
- **Stacked Bar**: Segments animate width changes smoothly
- **Platform Toggle**: Chevron rotates, section slides down
- **Hover**: Subtle ambient glow effect (matching existing cards)
- **Link Hover**: Arrow slides right slightly
