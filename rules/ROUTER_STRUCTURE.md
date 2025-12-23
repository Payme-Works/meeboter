# Router Structure

tRPC router organization should mirror the folder structure. Nested/child routers must be extracted to separate files within a folder.

## Principle

**Folder structure = Router structure**

When a router has sub-routers (nested routers), the folder structure must reflect this hierarchy.

## Structure

### Single Router (No Sub-routers)

```
routers/
  bots.ts          → botsRouter
  api-keys.ts      → apiKeysRouter
  events.ts        → eventsRouter
```

### Router with Sub-routers

```
routers/
  infrastructure/
    index.ts       → infrastructureRouter (main, imports sub-routers)
    coolify.ts     → coolifyRouter
    k8s.ts         → k8sRouter
    aws.ts         → awsRouter
```

## Implementation

### Main Router (index.ts)

```typescript
import { createTRPCRouter } from "@/server/api/trpc";
import { coolifyRouter } from "./coolify";
import { k8sRouter } from "./k8s";
import { awsRouter } from "./aws";

export const infrastructureRouter = createTRPCRouter({
	coolify: coolifyRouter,
	k8s: k8sRouter,
	aws: awsRouter,

	// Direct procedures on the main router are allowed
	getActivityStats: protectedProcedure.query(...),
});
```

### Sub-router File

```typescript
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const coolifyRouter = createTRPCRouter({
	getStats: protectedProcedure.query(...),
	getSlots: protectedProcedure.query(...),
});
```

## Anti-patterns

### ❌ Inline Sub-routers

Do NOT define sub-routers inline in the same file:

```typescript
// BAD - sub-routers defined inline
const coolifyRouter = createTRPCRouter({ ... });
const k8sRouter = createTRPCRouter({ ... });

export const infrastructureRouter = createTRPCRouter({
	coolify: coolifyRouter,
	k8s: k8sRouter,
});
```

### ✅ Extracted Sub-routers

```typescript
// GOOD - sub-routers in separate files
import { coolifyRouter } from "./coolify";
import { k8sRouter } from "./k8s";

export const infrastructureRouter = createTRPCRouter({
	coolify: coolifyRouter,
	k8s: k8sRouter,
});
```

## When to Extract

Extract to folder structure when:
- Router has 2+ sub-routers
- Sub-router has 2+ procedures
- Sub-router has its own schemas/types

## File Naming

- Use kebab-case for multi-word names: `api-keys.ts`
- Use lowercase for single words: `bots.ts`, `pool.ts`
- Main router file is always `index.ts`
