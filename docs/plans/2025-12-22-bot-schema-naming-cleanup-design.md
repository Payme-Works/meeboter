# Bot Schema Naming Cleanup Design

## Date: 2025-12-22

## Summary

Clean up bot schema by applying naming conventions, removing redundant columns, and simplifying the data model.

## Changes

### Column Renames

| Old Name | New Name | Database Column |
|----------|----------|-----------------|
| `botDisplayName` | `displayName` | `bot_display_name` → `display_name` |
| `botImage` | `imageUrl` | `bot_image` → `image_url` |
| `meetingInfo` | `meeting` | `meeting_info` → `meeting` |

### Column Deletions

| Column | Reason |
|--------|--------|
| `meetingTitle` | Removed entirely |
| `chatEnabled` | Bots always support chat messaging |
| `deploymentError` | Removed entirely |
| `heartbeatInterval` | Static value (10000ms) |

### New Constants

```typescript
export const HEARTBEAT_INTERVAL = 10_000; // 10 seconds
```

## Affected Files

- `database/schema/bots.ts` - Schema definitions
- All routers and services using bot fields
- Frontend components displaying bot data

## Migration Required

Database migration needed for column renames and deletions.
