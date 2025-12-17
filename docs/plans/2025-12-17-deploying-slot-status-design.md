# Deploying Slot Status Design

## Summary

Add a new `deploying` status to pool slots for better visibility in Coolify dashboard and monitoring. This distinguishes slots that are starting up from those actively running a bot.

## Status Lifecycle

**Current:**
```
idle → busy (on acquire) → idle (on release)
         ↓
       error
```

**New:**
```
idle → deploying (on acquire) → busy (when container running) → idle (on release)
              ↓                        ↓
           error                    error
```

**Transitions:**
| From | To | Trigger |
|------|-----|---------|
| `idle` | `deploying` | `acquireIdleSlot` / `createAndAcquireNewSlot` |
| `deploying` | `busy` | `configureAndStartSlot` after container starts |
| `busy` | `idle` | `releaseSlot` |
| any | `error` | Failures |

## Implementation

### Files to Modify

1. **`schema.ts`**
   ```typescript
   export const poolSlotStatus = z.enum(["idle", "deploying", "busy", "error"]);
   ```

2. **`bot-pool-service.ts`**
   - Update `PoolSlot.status` type to include `"deploying"`
   - `acquireIdleSlot`: Set status to `deploying` instead of `busy`
   - `createAndAcquireNewSlot`: Set initial status to `deploying`
   - `configureAndStartSlot`: Transition to `busy` after successful start
   - `updateSlotDescription`: Add case for `deploying`
   - `getPoolStats`: Add `deploying` count

3. **`slot-recovery.ts`**
   - Add `deploying` slots older than 5 minutes to recovery candidates

4. **`ARCHITECTURE.md`**
   - Update Pool Slot States table
   - Update diagrams showing slot lifecycle

### Pool Stats Update

```typescript
export interface PoolStats {
  total: number;
  idle: number;
  deploying: number;  // NEW
  busy: number;
  error: number;
  maxSize: number;
}
```

### Coolify Description Format

```
[DEPLOYING] Bot #123 - Starting container...
[BUSY] Bot #123 - 2025-12-17T22:30:00Z
[IDLE] Available - Last used: 2025-12-17T22:30:00Z
[ERROR] Container crashed - 2025-12-17T22:30:00Z
```

## Edge Cases

1. **Slot creation fails mid-deploy** - Slot stays `deploying`, recovery job catches it after 5 min timeout
2. **Container fails to start** - `configureAndStartSlot` throws, slot marked as `error`
3. **Queue processing** - `deploying` slots are NOT available (same as `busy`)
4. **Recovery job** - Treats stale `deploying` slots (>5 min) as error candidates

## Database Migration

Not required - the status column is a text field, just need to update Zod enum validation.
