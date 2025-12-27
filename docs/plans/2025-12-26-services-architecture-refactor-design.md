# Services Architecture Refactor Design

**Date**: 2025-12-26
**Status**: Implemented

## Overview

Refactor the services layer to improve organization, reduce file sizes, and consolidate queuing systems into a unified global queue.

## Goals

1. **File size reduction** - Split large files into focused modules
2. **Platform-specific folders** - Each platform in its own folder
3. **Unified global queue** - Single queue for all platforms instead of Coolify-specific
4. **Interface alignment** - Simplified, consistent platform service interface

---

## 1. Folder Structure

```
services/
├── index.ts                          # DI container
├── bot-deployment-service.ts         # High-level orchestration
├── deployment-queue-service.ts       # In-memory concurrency limiter (Coolify)
├── image-pull-lock-service.ts        # Image pull coordination
│
└── platform/
    ├── index.ts                      # Exports
    ├── platform-service.ts           # Base interface
    ├── hybrid-platform-service.ts    # Multi-platform coordinator + global queue
    │
    ├── mappers/
    │   ├── coolify-status-mapper.ts
    │   ├── k8s-status-mapper.ts
    │   └── aws-status-mapper.ts
    │
    ├── coolify/
    │   ├── coolify-platform-service.ts
    │   ├── coolify-api-client.ts     # HTTP client (renamed from coolify-service.ts)
    │   ├── pool-slot-service.ts      # Slot acquisition/release
    │   ├── pool-queue-service.ts     # REMOVE - use global queue
    │   └── slot-lifecycle-service.ts # Slot config and startup
    │
    ├── kubernetes/
    │   └── kubernetes-platform-service.ts
    │
    ├── aws/
    │   └── aws-platform-service.ts
    │
    └── local/
        └── local-platform-service.ts
```

**Key decisions:**
- No `index.ts` inside platform folders (import directly from source)
- Mappers stay in shared `platform/mappers/` folder
- Coolify-specific services encapsulated in `coolify/` folder

---

## 2. File Splitting - bot-pool-service.ts (1,263 lines)

Split into 3 focused modules inside `coolify/`:

### pool-slot-service.ts (~400 lines)
Slot acquisition, release, and state transitions.

```typescript
class PoolSlotService {
  // Centralized slot assignment/release
  assignBotToSlot(slotId, botId, coolifyUuid, slotName, previousState): Promise<void>
  releaseBotFromSlot(slotId): Promise<{ slotName, coolifyUuid, previousBotId } | null>

  // Pool management
  acquireOrCreateSlot(botId): Promise<PoolSlot | null>
  releaseSlot(botId): Promise<void>
  markSlotError(slotId, errorMessage): Promise<void>

  // Stats
  getPoolStats(): Promise<PoolStats>
  getAllSlots(): Promise<PoolSlot[]>
}
```

### slot-lifecycle-service.ts (~400 lines)
Slot configuration, startup, and Coolify application lifecycle.

```typescript
class SlotLifecycleService {
  configureAndStartSlot(slot, botConfig): Promise<PoolSlot>
  deployAndTransitionStatus(slot, botId, platform, imageTag): Promise<void>
  createAndAcquireNewSlot(botId): Promise<PoolSlot>
  recreateSlotApplication(slot, botConfig): Promise<PoolSlot>
  updateSlotDescription(applicationUuid, status, botId?, errorMessage?): Promise<void>
}
```

### pool-queue-service.ts - REMOVE
Queue functionality moves to global `HybridPlatformService`.

---

## 3. Unified Global Queue

### Remove
- `botPoolQueueTable` (database) - Coolify-specific queue
- Queue methods in `BotPoolService` (`addToQueue`, `waitForSlot`, `processQueueOnSlotRelease`, etc.)

### Keep & Enhance
- `deploymentQueueTable` (database) - Global queue for all platforms

### Flow

```
┌─────────────────┐
│  Bot Deployment │
│     Request     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Success    ┌──────────────────┐
│ HybridPlatform  │ ─────────────► │ Bot Deployed on  │
│   deployBot()   │                │ K8s/AWS/Coolify  │
└────────┬────────┘                └──────────────────┘
         │
         │ All platforms at capacity
         ▼
┌─────────────────┐
│ deploymentQueue │  ◄── Single global queue
│     Table       │
└────────┬────────┘
         │
         │ Platform releases capacity
         ▼
┌─────────────────┐
│  processQueue() │  ◄── Tries all platforms again
└─────────────────┘
```

### Implementation
1. `CoolifyPlatformService.deployBot()` throws `PlatformDeployError` when pool exhausted (already does)
2. `HybridPlatformService` catches exhaustion from ALL platforms
3. If all platforms fail with capacity errors → add to `deploymentQueueTable`
4. `HybridPlatformService.processQueue()` processes global queue when any platform has capacity

---

## 4. Interface Alignment

### Updated PlatformService Interface

```typescript
interface PlatformService<TStatus extends string = string> {
  readonly platformName: "coolify" | "aws" | "k8s" | "local";

  // Core operations (required)
  deployBot(botConfig: BotConfig): Promise<PlatformDeployResult>;
  stopBot(identifier: string): Promise<void>;
  getBotStatus(identifier: string): Promise<TStatus>;

  // Optional - only Coolify implements (pool-based)
  releaseBot?(botId: number): Promise<void>;

  // REMOVED: processQueue() - now global in HybridPlatformService
}
```

### Error Handling (Already Consistent)
- All platforms throw `PlatformDeployError` on deployment failure
- `HybridPlatformService` catches and tries next platform in priority order

---

## 5. Database Changes

### Remove Table
- `bot_pool_queue` - Coolify-specific queue (replaced by global queue)

### Keep Table
- `deployment_queue` - Global queue for hybrid infrastructure
- `bot_pool_slots` - Coolify pool slots (unchanged)

### Migration Required
- Drop `bot_pool_queue` table
- Migrate any pending entries to `deployment_queue` (if needed)

---

## 6. Implementation Order

1. **Create folder structure** - Move files to platform-specific folders
2. **Split bot-pool-service.ts** - Extract into focused modules
3. **Rename coolify-service.ts** - To `coolify-api-client.ts`
4. **Remove Coolify queue** - Delete `botPoolQueueTable` usage
5. **Enhance global queue** - Implement in `HybridPlatformService`
6. **Update interface** - Remove `processQueue()` from per-platform services
7. **Database migration** - Drop `bot_pool_queue` table
8. **Update DI container** - Wire new services in `index.ts`
9. **Run tests** - Verify all functionality works
10. **Update documentation** - Search and update all `.md` files referencing changed services

---

## 7. Files to Modify

### Create
- `services/platform/coolify/coolify-platform-service.ts`
- `services/platform/coolify/coolify-api-client.ts`
- `services/platform/coolify/pool-slot-service.ts`
- `services/platform/coolify/slot-lifecycle-service.ts`
- `services/platform/kubernetes/kubernetes-platform-service.ts`
- `services/platform/aws/aws-platform-service.ts`
- `services/platform/local/local-platform-service.ts`

### Move
- `mappers/*.ts` → `platform/mappers/*.ts` (already there)

### Delete
- `services/bot-pool-service.ts` (after splitting)
- `services/coolify-service.ts` (after renaming/moving)

### Modify
- `services/index.ts` - Update imports and wiring
- `services/platform/index.ts` - Update exports
- `services/platform/hybrid-platform-service.ts` - Add global queue
- `services/platform/platform-service.ts` - Update interface
- Database schema - Remove `bot_pool_queue` table

---

## 8. Documentation Updates

After implementation, investigate and update all relevant `.md` files to reflect the new architecture.

### Files to Review

#### Rules
- `rules/PLATFORM_NOMENCLATURE.md` - Update service references, queue terminology
- `rules/API_PATTERNS.md` - Update platform service patterns if mentioned

#### Root Documentation
- `CLAUDE.md` - Update any service references in Quick Reference
- `README.md` - Update architecture section if present

#### Search for References
Run these searches to find documentation mentioning affected services:

```bash
# Find docs mentioning bot-pool-service
Grep pattern="bot-pool-service|BotPoolService" path="." glob="*.md"

# Find docs mentioning coolify-service
Grep pattern="coolify-service|CoolifyService" path="." glob="*.md"

# Find docs mentioning queue tables
Grep pattern="botPoolQueue|bot_pool_queue|deploymentQueue" path="." glob="*.md"

# Find docs mentioning platform services structure
Grep pattern="platform/.*service" path="." glob="*.md"
```

### Documentation Checklist
- [x] Update any architecture diagrams
- [x] Update service layer descriptions
- [x] Update queue system documentation
- [x] Update folder structure references
- [x] Remove references to deleted files/tables
- [x] Add references to new files/services

---

## Implementation Notes

**Completed**: 2025-12-26

### Changes Made

1. **Folder structure created**:
   - `platform/coolify/` - Coolify platform service, API client, bot pool service
   - `platform/kubernetes/` - Kubernetes platform service
   - `platform/aws/` - AWS ECS platform service
   - `platform/mappers/` - Status mappers (unchanged location)

2. **Files renamed/moved**:
   - `coolify-service.ts` → `coolify-api-client.ts`
   - All platform services moved to respective folders

3. **Queue consolidation**:
   - Removed `botPoolQueueTable` from schema
   - Removed queue-related methods from `BotPoolService`
   - Removed `getQueueStats` from routers
   - Global queue managed by `HybridPlatformService` via `deploymentQueueTable`

4. **Interface updates**:
   - Removed `processQueue()` from `PlatformService` interface
   - Made `releaseBot()` optional (only Coolify implements it)
   - Removed queue-related fields from `PlatformDeployResult`

5. **Database migration**:
   - Created `0020_drop_bot_pool_queue_table.sql` to drop deprecated table

6. **Documentation updated**:
   - `apps/milo/README.md` - Updated service descriptions and folder structure
