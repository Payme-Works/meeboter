# Server-Side Pagination Design

## Overview

Refactor all tables (Bots, Pool slots, Templates, API Keys) to use server-side pagination for consistency and performance.

## Decisions

- **Scope**: All tables in the app
- **Pagination style**: Hybrid (offset-based for display, cursors for future infinite scroll)
- **Response metadata**: Standard (`data`, `total`, `pageCount`, `hasNextPage`, `hasPreviousPage`, `nextCursor`)
- **Filtering/sorting**: Client-side for now, server-side later if needed
- **Component approach**: Extend existing DataTable with backward compatibility

## Paginated Response Type

```typescript
// apps/milo/src/lib/pagination.ts
import { z } from "zod";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor: string | null;
}

export const paginationInput = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(10),
});

export type PaginationInput = z.infer<typeof paginationInput>;

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
  getCursor: (item: T) => string
): PaginatedResponse<T> {
  return {
    data,
    total,
    pageCount: Math.ceil(total / pageSize),
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
    nextCursor: data.length > 0 ? getCursor(data[data.length - 1]) : null,
  };
}
```

## DataTable Props Extension

New props added to support server-side pagination:

```typescript
type DataTableProps<TData, TValue> = {
  // ... existing props ...

  /** Total item count for server-side pagination */
  totalCount?: number;

  /** Total page count for server-side pagination */
  pageCount?: number;

  /** Has next page (server-side) */
  hasNextPage?: boolean;

  /** Has previous page (server-side) */
  hasPreviousPage?: boolean;
};
```

**Detection logic:**
- If `totalCount` is provided → server-side pagination mode
- If `totalCount` is undefined → client-side pagination (backward compatible)

## Page Component Usage Pattern

```typescript
export default function BotsPage() {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [pageSize, setPageSize] = useQueryState("pageSize", parseAsInteger.withDefault(10));

  const { data, isLoading, error } = api.bots.getBots.useQuery(
    { page, pageSize },
    {
      refetchInterval: REFRESH_INTERVAL,
      placeholderData: keepPreviousData,
    }
  );

  return (
    <DataTable
      columns={columns}
      data={data?.data}
      isLoading={isLoading}
      errorMessage={error?.message}
      totalCount={data?.total}
      pageCount={data?.pageCount}
      hasNextPage={data?.hasNextPage}
      hasPreviousPage={data?.hasPreviousPage}
      pageIndex={page - 1}
      pageSize={pageSize}
      onPageIndexChange={(idx) => setPage(idx + 1)}
      onPageSizeChange={setPageSize}
    />
  );
}
```

## Backend tRPC Procedure Pattern

```typescript
export const botsRouter = router({
  getBots: protectedProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const { page = 1, pageSize = 10 } = input;
      const skip = (page - 1) * pageSize;

      const [data, total] = await Promise.all([
        ctx.db.bot.findMany({
          skip,
          take: pageSize,
          orderBy: { createdAt: "desc" },
        }),
        ctx.db.bot.count(),
      ]);

      return buildPaginatedResponse(data, total, page, pageSize, (item) => String(item.id));
    }),
});
```

## Implementation Order

1. Create `apps/milo/src/lib/pagination.ts` with shared types and helpers
2. Update DataTable component with new props and server-side mode detection
3. Update each table (one at a time):
   - Bots (has auto-refresh)
   - Pool slots (has auto-refresh)
   - Templates
   - API Keys
4. Run lint and typecheck after each table
