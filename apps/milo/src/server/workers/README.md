# Workers

Background workers that monitor bot health and recover stuck resources.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           startWorkers() (every 60s)                         │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
│  BotHealthWorker  │      │ BotRecoveryWorker │      │PoolSlotSyncWorker │
│                   │      │                   │      │                   │
│  ACTIVE bots      │      │  DEPLOYING bots   │      │  Coolify ↔ DB     │
│  heartbeat check  │      │  + stuck slots    │      │  consistency      │
└─────────┬─────────┘      └─────────┬─────────┘      └─────────┬─────────┘
          │                          │                          │
          ▼                          ▼                          ▼
   ┌─────────────┐    ┌──────────────────────────────┐   ┌─────────────┐
   │ Stale >5min │    │        4 Strategies          │   │ Delete      │
   │ → FATAL     │    │                              │   │ orphans     │
   │ + release   │    │  ┌────────────────────────┐  │   │ both sides  │
   └─────────────┘    │  │  OrphanedDeploying     │  │   └─────────────┘
                      │  │  ALL DEPLOYING >15min  │  │
                      │  │  → FATAL               │  │
                      │  └────────────────────────┘  │
                      │  ┌────────────────────────┐  │
                      │  │  CoolifyRecovery       │  │
                      │  │  Stuck slots → IDLE    │  │
                      │  └────────────────────────┘  │
                      │  ┌────────────────────────┐  │
                      │  │  K8sRecovery           │  │
                      │  │  Orphaned Jobs         │  │
                      │  └────────────────────────┘  │
                      │  ┌────────────────────────┐  │
                      │  │  AWSRecovery           │  │
                      │  │  Orphaned Tasks        │  │
                      │  └────────────────────────┘  │
                      └──────────────────────────────┘
```

## Bot Status Flow

```
DEPLOYING ──► JOINING_CALL ──► IN_WAITING_ROOM ──► IN_CALL ──► LEAVING ──► DONE
    │              │                  │                │           │
    │              └──────────────────┴────────────────┴───────────┘
    │                                 │
    ▼                                 ▼
  FATAL ◄───────────────────────── FATAL
(>15min stuck)                   (heartbeat >5min stale)
```

## Worker Responsibilities

| Worker | Monitors | Timeout | Action |
|--------|----------|---------|--------|
| **BotHealthWorker** | JOINING_CALL, IN_WAITING_ROOM, IN_CALL, LEAVING | 5 min | Mark FATAL, release resources |
| **OrphanedDeployingStrategy** | DEPLOYING (all platforms) | 15 min | Mark FATAL |
| **CoolifyRecoveryStrategy** | Pool slots (ERROR, stale, orphaned) | 15 min | Reset slot to IDLE |
| **K8sRecoveryStrategy** | K8s Jobs for active bots | — | Delete orphaned Jobs |
| **AWSRecoveryStrategy** | ECS Tasks for active bots | — | Stop orphaned Tasks |
| **CoolifyPoolSlotSyncWorker** | Slot ↔ Coolify API | — | Sync status, fix drift |

## Recovery Decision Tree

```
Bot issue?
│
├─► Status = DEPLOYING >15min
│   └─► OrphanedDeployingStrategy → Mark FATAL
│
├─► Status = ACTIVE, heartbeat stale >5min
│   └─► BotHealthWorker → Mark FATAL + release resources
│
├─► Coolify slot stuck (ERROR/DEPLOYING/orphaned)
│   └─► CoolifyRecoveryStrategy → Reset to IDLE
│
├─► K8s Job missing for active bot
│   └─► K8sRecoveryStrategy → Mark FATAL
│
├─► ECS Task FAILED/STOPPED for active bot
│   └─► AWSRecoveryStrategy → Mark FATAL
│
└─► Coolify ↔ Database drift
    └─► CoolifyPoolSlotSyncWorker → Delete orphans
```

## Files

```
workers/
├── index.ts                 # Starts all workers
├── base-worker.ts           # Abstract base class
├── bot-health-worker.ts     # Active bot monitoring
├── coolify-pool-slot-sync-worker.ts
└── recovery/
    ├── bot-recovery-worker.ts   # Orchestrates strategies
    └── strategies/
        ├── orphaned-deploying-strategy.ts
        ├── coolify-recovery-strategy.ts
        ├── k8s-recovery-strategy.ts
        └── aws-recovery-strategy.ts
```
