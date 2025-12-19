# Table Pagination URL State Persistence

**Date:** 2025-12-19
**Status:** Approved

## Problem

All tables in the app lose their current page when the user refreshes the browser. This happens because pagination state is stored in React state, which resets on page reload.

## Solution

Persist pagination state to URL search parameters using nuqs library. This makes table state shareable, bookmarkable, and persistent across refreshes.

## Design

### Dependencies

```bash
bun add nuqs --filter=@meeboter/milo
```

### Per-Page Search Params Configuration

Each page defines its own search params file:

```typescript
// apps/milo/src/app/bots/search-params.ts
import { createSearchParamsCache, parseAsInteger } from "nuqs/server";

export const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(10),
});
```

### DataTable Component Updates

Add external pagination control props (backward compatible):

```typescript
interface DataTableProps<TData, TValue> {
  // ... existing props ...

  // External pagination control
  pageIndex?: number;
  pageSize?: number;
  onPageIndexChange?: (pageIndex: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageCount?: number;
}
```

### Parent Component Integration

**Server Component:**
```typescript
// apps/milo/src/app/bots/page.tsx
import { searchParamsCache } from "./search-params";

export default async function BotsPage({ searchParams }) {
  const { page, pageSize } = await searchParamsCache.parse(searchParams);
  return <BotsClient page={page} pageSize={pageSize} />;
}
```

**Client Component:**
```typescript
// apps/milo/src/app/bots/_components/bots-client.tsx
"use client";
import { useQueryState, parseAsInteger } from "nuqs";

export function BotsClient({ page: _page, pageSize: _pageSize }) {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(_page));
  const [pageSize, setPageSize] = useQueryState("pageSize", parseAsInteger.withDefault(_pageSize));

  return (
    <DataTable
      pageIndex={page - 1}
      pageSize={pageSize}
      onPageIndexChange={(idx) => setPage(idx + 1)}
      onPageSizeChange={setPageSize}
      pageCount={Math.ceil(totalCount / pageSize)}
    />
  );
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `apps/milo/src/app/bots/search-params.ts` | Bots page URL params |
| `apps/milo/src/app/pool/search-params.ts` | Pool page URL params |
| `apps/milo/src/app/api-keys/search-params.ts` | API Keys page URL params |
| `apps/milo/src/app/templates/search-params.ts` | Templates page URL params |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/milo/src/components/custom/data-table.tsx` | Add external pagination props |
| `apps/milo/src/app/bots/page.tsx` | Parse search params |
| `apps/milo/src/app/bots/_components/*.tsx` | Use nuqs for pagination |
| `apps/milo/src/app/pool/page.tsx` | Parse search params |
| `apps/milo/src/app/pool/_components/pool-slots-table.tsx` | Use nuqs |
| `apps/milo/src/app/api-keys/page.tsx` | Parse search params |
| `apps/milo/src/app/templates/page.tsx` | Parse search params |
| Dialog components with tables | Use nuqs for URL-based pagination |

## Key Decisions

- **1-indexed URLs** - More user-friendly (`?page=1` not `?page=0`)
- **Per-page config** - Each page can customize defaults
- **Backward compatible** - Existing usages continue working
- **URL state everywhere** - Including dialogs for full shareability

## Risks & Mitigations

- **Hydration mismatch:** Server parses params and passes to client
- **Multiple tables conflict:** Use prefixed params if needed (e.g., `botsPage`, `eventsPage`)
