# API Patterns

This document contains API design patterns and conventions.

## Platform-Specific tRPC Routers

**When an API serves multiple platforms, structure as `domain.<platform>.<procedure>` with platform-specific nomenclature.**

Each platform should use its official terminology for resources and operations.

```typescript
// ✅ CORRECT: Platform-specific sub-routers with official nomenclature
infrastructure
  ├── coolify
  │   ├── getStats()      // Coolify pool statistics
  │   └── getSlots()      // Coolify uses "slots" for pool containers
  ├── k8s
  │   ├── getStats()      // Kubernetes cluster statistics
  │   └── getJobs()       // Kubernetes uses "Jobs"
  └── aws
      ├── getStats()      // AWS ECS statistics
      └── getTasks()      // AWS ECS uses "Tasks"

// ❌ WRONG: Generic naming that ignores platform terminology
infrastructure
  ├── getStats()          // Which platform?
  └── getResources()      // Generic, not platform-specific
```

### Implementation Pattern

```typescript
// routers/infrastructure.ts
export const infrastructureRouter = router({
  coolify: coolifyRouter,
  k8s: k8sRouter,
  aws: awsRouter,
});

// routers/infrastructure/coolify.ts
export const coolifyRouter = router({
  getStats: procedure.query(async () => {
    // Returns { IDLE, DEPLOYING, HEALTHY, ERROR }
  }),
  getSlots: procedure.query(async () => {
    // Returns list of pool slots
  }),
});

// routers/infrastructure/k8s.ts
export const k8sRouter = router({
  getStats: procedure.query(async () => {
    // Returns { PENDING, ACTIVE, SUCCEEDED, FAILED }
  }),
  getJobs: procedure.query(async () => {
    // Returns list of K8s Jobs
  }),
});
```

### Frontend Usage

The frontend queries all enabled platforms and displays them in the infrastructure UI:

```typescript
// Query all platform-specific endpoints
const coolifyStats = api.infrastructure.coolify.getStats.useQuery();
const k8sStats = api.infrastructure.k8s.getStats.useQuery();
const awsStats = api.infrastructure.aws.getStats.useQuery();

// Display enabled platforms based on query results
// Backend determines which platforms are active via PLATFORM_PRIORITY env var
```

### Key Principles

1. **Use official platform terminology** - Coolify has "slots", K8s has "Jobs", AWS has "Tasks"
2. **Separate routers per platform** - Don't mix platform logic in a single procedure
3. **Consistent response structure** - Each platform returns status counts in UPPERCASE
4. **Type safety** - Each platform has its own typed response interface
