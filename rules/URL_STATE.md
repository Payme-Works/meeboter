# URL State Management

This document contains patterns for URL-based state management using nuqs.

> **Library:** [nuqs](https://nuqs.47ng.com/)
> **GitHub:** https://github.com/47ng/nuqs

## Server-Side Search Params with nuqs

**Use nuqs `createSearchParamsCache` for URL-based state.** Create a `search-params.ts` file in the route folder.

### File Structure

```
app/
  infrastructure/
    search-params.ts    ← Define search params here
    page.tsx            ← Parse in server component
    _components/
      table.tsx         ← Use parsed params
```

### Search Params Definition

```typescript
// app/infrastructure/search-params.ts
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsString,
} from "nuqs/server";

export const searchParamsCache = createSearchParamsCache({
  // Status filter - array of UPPERCASE status values
  status: parseAsArrayOf(parseAsString).withDefault([]),

  // Sort - format: field.asc or field.desc
  sort: parseAsString.withDefault("age.desc"),
});
```

### Usage in Server Component

```typescript
// app/infrastructure/page.tsx
import { searchParamsCache } from "./search-params";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const { status, sort } = searchParamsCache.parse(await searchParams);

  // Use parsed values for prefetching
  prefetch(trpc.infrastructure.k8s.getJobs.queryOptions({
    status,
    sort,
  }));

  return <InfrastructureTable />;
}
```

## Sort URL Format

**Sort params use format `?sort=field.desc` or `?sort=field.asc`.**

```
# ✅ CORRECT: field.direction format
?sort=age.desc
?sort=botId.asc
?sort=createdAt.desc

# ❌ WRONG: Other formats
?sortBy=age&sortOrder=desc   ← Two params
?sort=-age                    ← Minus prefix
?sort=age:desc                ← Colon separator
?order=age_desc               ← Underscore
```

### Parsing Sort Values

```typescript
// Helper to parse sort string
function parseSort(sort: string): { field: string; direction: "asc" | "desc" } {
  const [field, direction] = sort.split(".");
  return {
    field,
    direction: direction === "asc" ? "asc" : "desc",
  };
}

// Usage
const { field, direction } = parseSort("age.desc");
// { field: "age", direction: "desc" }
```

### Sortable Columns

```typescript
// Column definition with sort
{
  id: "age",
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title="Age" />
  ),
  enableSorting: true,
}
```

## Status Filter Format

**Status values in URLs must be UPPERCASE to match enum values.**

```
# ✅ CORRECT: UPPERCASE status values
?status=ACTIVE
?status=HEALTHY&status=DEPLOYING
?status=PENDING&status=ACTIVE&sort=age.desc

# ❌ WRONG: lowercase status values
?status=active
?status=healthy&status=deploying
```

### Multi-Select Status Filter

```typescript
// search-params.ts
status: parseAsArrayOf(parseAsString).withDefault([]),

// URL: ?status=ACTIVE&status=PENDING
// Parsed: ["ACTIVE", "PENDING"]
```

## Combined Example

```typescript
// search-params.ts
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

export const searchParamsCache = createSearchParamsCache({
  status: parseAsArrayOf(parseAsString).withDefault([]),
  sort: parseAsString.withDefault("age.desc"),
  page: parseAsInteger.withDefault(1),
  size: parseAsInteger.withDefault(10),
});

// URL: ?status=ACTIVE&status=PENDING&sort=botId.asc&page=2&size=20
// Parsed: {
//   status: ["ACTIVE", "PENDING"],
//   sort: "botId.asc",
//   page: 2,
//   size: 20,
// }
```
