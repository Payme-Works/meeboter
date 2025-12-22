# Database Schema Reorganization Design

## Date: 2025-12-22

## Summary

Reorganize the Milo app's database folder to follow Drizzle ORM best practices:
1. Split monolithic `schema.ts` into domain-based files
2. Migrate deprecated pgTable object syntax to array syntax
3. Colocate types and Zod schemas with their respective tables

## Current State

- Single `schema.ts` file (978 lines) containing all tables, types, Zod schemas, and constants
- 27 files depend on imports from this schema
- 6 tables use deprecated pgTable third parameter object syntax

## Target Structure

```
database/
├── schema/
│   ├── users.ts          # Auth-related tables (users, sessions, accounts, verification)
│   ├── bots.ts           # Bot tables (bots, events) + Status, EventCode, MeetingInfo types
│   ├── messaging.ts      # Chat tables (messageTemplates, botChatMessages)
│   ├── pool.ts           # Pool tables (botPoolSlots, botPoolQueue)
│   ├── api.ts            # API tables (apiKeys, apiRequestLogs, subscriptions)
│   └── index.ts          # Barrel export for backward compatibility
├── helpers/
│   └── columns.ts        # Shared pgTableCreator and timestamp columns
└── db.ts                 # Drizzle instance (unchanged import path)
```

## pgTable Migration

Convert from deprecated object syntax to array syntax:

```typescript
// BEFORE (deprecated)
export const botsTable = pgTable("bots", { ... }, (table) => ({
  userIdIdx: index("bots_user_id_idx").on(table.userId),
}));

// AFTER (new array syntax)
export const botsTable = pgTable("bots", { ... }, (table) => [
  index("bots_user_id_idx").on(table.userId),
]);
```

## Domain Groupings

### users.ts
- `usersTable`
- `sessionsTable`
- `accountsTable`
- `verificationTable`

### bots.ts
- `botsTable` (with array index syntax)
- `events` table (with array index syntax)
- `subscriptionEnum`, `Status`, `EventCode` types
- `MeetingInfo`, `AutomaticLeave`, `SpeakerTimeframe` schemas
- `ScreenshotData`, `LogEntry`, `LogLevel` schemas
- `EVENT_DESCRIPTIONS` constant
- All related insert/select Zod schemas

### messaging.ts
- `messageTemplatesTable` (with array index syntax)
- `botChatMessagesTable` (with array index syntax)
- Related insert/select schemas

### pool.ts
- `botPoolSlotsTable` (with array index syntax)
- `botPoolQueueTable` (with array index syntax)
- `PoolSlotStatus` type
- Related insert/select schemas

### api.ts
- `apiKeysTable`
- `apiRequestLogsTable`
- `subscriptionsTable`
- Related insert/select schemas

## Backward Compatibility

The barrel export (`schema/index.ts`) re-exports all symbols, maintaining existing import paths:
```typescript
// These imports continue to work unchanged
import { botsTable, Status, insertBotSchema } from "@/server/database/schema";
```

## References

- [Drizzle ORM Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration)
- [Drizzle Best Practices 2025](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)
