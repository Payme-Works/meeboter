# Workers OOP Refactoring Design

**Date:** 2025-12-27
**Status:** Approved

## Problem

The `BotRecoveryWorker` is a 700+ line monolithic class with mixed platform logic for K8s, AWS, and Coolify. This makes it:
- Hard to maintain and understand
- Difficult to test individual recovery scenarios
- Complex to extend with new platforms

## Solution

Apply the **Strategy Pattern** to extract platform-specific recovery logic into separate, focused classes.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Base pattern | Strategy Pattern | Clean isolation, easy to test, easy to extend |
| BaseWorker | Keep as-is | Already lean and focused on lifecycle |
| Strategy scope | Platform responsibility | One strategy handles all recovery for its platform |
| Interface | Simple (no isEnabled) | Strategy handles availability internally |
| File organization | Nested `recovery/` folder | Keeps related code together |
| Results | Platform-specific | Each strategy returns its own metrics |

## File Structure

```
workers/
├── base-worker.ts              # Keep as-is
├── bot-health-worker.ts        # Keep as-is
├── coolify-pool-slot-sync-worker.ts  # Keep as-is
├── index.ts                    # Updated exports
└── recovery/
    ├── index.ts                # Exports BotRecoveryWorker
    ├── bot-recovery-worker.ts  # Orchestrator + interface
    └── strategies/
        ├── index.ts
        ├── k8s-recovery-strategy.ts
        ├── aws-recovery-strategy.ts
        ├── coolify-recovery-strategy.ts
        └── orphaned-deploying-strategy.ts
```

## Interface

```typescript
// bot-recovery-worker.ts

export interface RecoveryStrategy {
  readonly name: string;
  recover(): Promise<RecoveryResult>;
}

export interface RecoveryResult {
  recovered: number;
  failed: number;
  [key: string]: number;
}
```

## Strategy Implementation Pattern

```typescript
class K8sRecoveryStrategy implements RecoveryStrategy {
  readonly name = "K8sRecovery";

  constructor(
    private db: Database,
    private k8sService: KubernetesPlatformService | undefined
  ) {}

  async recover(): Promise<RecoveryResult> {
    if (!this.k8sService) {
      return { recovered: 0, failed: 0 };
    }

    // All K8s recovery logic:
    // - cleanupStuckDeployingBots()
    // - cleanupOrphanedJobs()
  }
}
```

## Orchestrator

```typescript
class BotRecoveryWorker extends BaseWorker<AggregatedResult> {
  private strategies: RecoveryStrategy[];

  constructor(db, services, options) {
    super(db, services, options);
    this.strategies = [
      new OrphanedDeployingStrategy(db),
      new K8sRecoveryStrategy(db, services.k8s),
      new AWSRecoveryStrategy(db, services.aws),
      new CoolifyRecoveryStrategy(db, services.coolify, services.pool),
    ];
  }

  async execute(): Promise<AggregatedResult> {
    const results: Record<string, RecoveryResult> = {};

    for (const strategy of this.strategies) {
      results[strategy.name] = await strategy.recover();
    }

    return this.aggregate(results);
  }
}
```

## Benefits

1. **Testability** - Test each strategy in isolation with mocked dependencies
2. **Extensibility** - Add new platform = add new strategy class
3. **Maintainability** - Each file is focused and small (~100-150 lines)
4. **Single Responsibility** - Each strategy owns one platform's recovery
