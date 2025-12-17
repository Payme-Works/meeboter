# TanStack React Table Best Practices

> **Official Docs:** https://tanstack.com/table/latest
> **GitHub:** https://github.com/TanStack/table

This document covers all TanStack React Table patterns, type safety, and best practices for the Gate monorepo.

---

## Global Type Declarations

The project uses module augmentation to extend TanStack React Table types. The global declaration file is located at `apps/tera/src/react-table.d.ts`.

### Global TableMeta Interface

**ONLY add properties to the global `TableMeta` interface that are used across ALL tables:**

```typescript
// apps/tera/src/react-table.d.ts
import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<TData> {
    getRowClassName?: (row: Row<TData>) => string;
  }
}
```

**DO NOT add table-specific properties** (like `organizationId`, `onDelete`, `currentUser`) to the global declaration. These should be handled locally per table.

---

## Custom Table Meta Properties (MANDATORY)

When a table needs custom meta properties, define them locally in the table component file using interface extension and type assertion.

### Pattern for Custom Meta

```typescript
// index.tsx
import { type TableMeta, useReactTable } from "@tanstack/react-table";
import { type Member, getColumns } from "./columns";

// 1. Define local interface extending TableMeta
interface MembersTableMeta extends TableMeta<Member> {
  organizationId: string;
  currentUser: Member | undefined;
  totalOwners: number;
}

// 2. Use type assertion when passing meta
const table = useReactTable({
  data: members,
  columns,
  getCoreRowModel: getCoreRowModel(),
  meta: {
    organizationId,
    currentUser: members.find((m) => m.user?.id === currentUserId),
    totalOwners: members.filter((m) => m.role === "owner").length,
  } as MembersTableMeta, // Type assertion
});
```

### Accessing Custom Meta in Columns

In column definitions, access the custom meta using type casting:

```typescript
// columns.tsx
function ActionsCell({ row, table, t }: ActionsCellProps) {
  const meta = (
    table as {
      options: {
        meta?: {
          organizationId?: string;
          currentUser?: Member;
          totalOwners?: number;
        };
      };
    }
  ).options.meta;

  const organizationId = meta?.organizationId ?? "";
  // ... use meta properties
}
```

### Alternative: Declare Module in Column File

For simpler cases, you can declare the module augmentation directly in the column file:

```typescript
// columns.tsx
declare module "@tanstack/react-table" {
  interface TableMeta<TData> {
    onDelete?: (id: string) => void;
    onReveal?: (id: string) => void;
  }
}
```

**Note:** This approach pollutes the global type but is acceptable for simpler meta structures.

---

## Column Meta Properties

The global `ColumnMeta` interface supports these properties:

```typescript
interface ColumnMeta<TData, TValue> {
  headerClassName?: string;
  cellClassName?: string;
  label?: string;
  className?: string;
}
```

### Usage in Column Definitions

```typescript
export function getColumns(t: TranslationFunction): ColumnDef<Data>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: t("columns.name"),
      meta: {
        className: "min-w-[200px]",
      },
    },
    {
      id: "actions",
      header: t("columns.actions"),
      meta: {
        className: "text-right border-r-0",
      },
    },
  ];
}
```

### Applying Meta Classes in Table Component

```typescript
// In table rendering
<TableHead className={header.column.columnDef.meta?.className}>
  {flexRender(header.column.columnDef.header, header.getContext())}
</TableHead>

<TableCell className={cell.column.columnDef.meta?.className}>
  {flexRender(cell.column.columnDef.cell, cell.getContext())}
</TableCell>
```

---

## Column Definition Files

### DO NOT Use "use client" in Column Files

Column definition files (`columns.tsx`) should **NOT** have the `"use client"` directive unless they use hooks directly.

```typescript
// columns.tsx - NO "use client" needed
import type { ColumnDef } from "@tanstack/react-table";

export function getColumns(t: TranslationFunction): ColumnDef<Data>[] {
  return [/* ... */];
}
```

### When "use client" IS Required

Only add `"use client"` when the column file:
- Uses React hooks (useState, useEffect, etc.)
- Uses mutations (trpc.*.useMutation)
- Contains interactive components with hooks

```typescript
// columns.tsx - "use client" required because of useMutation
"use client";

import { trpc } from "@/lib/trpc/client";

function ActionsCell({ row }: { row: Row<Data> }) {
  const mutation = trpc.items.delete.useMutation(); // Hook usage
  // ...
}
```

---

## Type Inference from tRPC

### Deriving Types from Router Output

```typescript
import type { AppRouter } from "@gate/mesh/infra/http/trpc/trpc.router";
import type { inferRouterOutputs } from "@trpc/server";

type RouterOutput = inferRouterOutputs<AppRouter>;

type Member = RouterOutput["organizations"]["members"]["members"][number];
```

### Handling Date Serialization

tRPC serializes dates as strings. Override the type accordingly:

```typescript
type MembersOutput =
  AppRouter["organizations"]["members"]["members"]["_def"]["$types"]["output"];

// tRPC serializes dates as strings
export type Member = Omit<MembersOutput[number], "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
```

**Always export types** that are needed in other files (like index.tsx).

---

## Custom Filter Functions

### Defining Filter Functions

```typescript
import type { FilterFn } from "@tanstack/react-table";

const userFilterFn: FilterFn<Member> = (row, _, filterValue) => {
  const memberName = row.original.user?.name?.toLowerCase();
  return memberName?.includes(filterValue.toLowerCase()) ?? false;
};

export function getColumns(t: TranslationFunction): ColumnDef<Member>[] {
  return [
    {
      id: "user",
      accessorKey: "user.name",
      filterFn: userFilterFn, // Apply custom filter
      // ...
    },
  ];
}
```

### Global Filter Functions

Register global filter functions in the type declaration:

```typescript
// react-table.d.ts
declare module "@tanstack/react-table" {
  interface FilterFns {
    isTableColumnInDateRange?: FilterFn<unknown>;
    isTableColumnInArray?: FilterFn<unknown>;
  }
}
```

---

## Table Structure Patterns

### Standard Table Component Structure

```typescript
"use client";

export function DataTable() {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data = [], isPending, isFetching } = trpc.items.list.useQuery();

  const columns = getColumns(t);

  const table = useReactTable({
    getRowId: (row) => row.id,
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    state: { columnFilters, rowSelection },
  });

  const isInitialLoading = isPending;
  const isRefetching = isFetching && !isPending;

  // Render logic...
}
```

### Loading States Pattern

```typescript
function renderContent() {
  if (isInitialLoading) {
    return <TableSkeleton />;
  }

  return (
    <div className="relative">
      <TableLoadingOverlay isLoading={isRefetching} />

      <div className={cn(
        isRefetching && "pointer-events-none opacity-50 transition-opacity"
      )}>
        <Table>
          {/* Table content */}
        </Table>
      </div>
    </div>
  );
}
```

---

## Row Selection

### Checkbox Column

```typescript
{
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={
        table.getIsAllPageRowsSelected() ||
        (table.getIsSomePageRowsSelected() && "indeterminate")
      }
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="Select all"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label="Select row"
    />
  ),
  enableSorting: false,
  enableHiding: false,
  meta: {
    className: "min-w-12",
  },
}
```

### Bulk Actions

```typescript
const selectedRows = table.getFilteredSelectedRowModel().rows;
const hasSelection = selectedRows.length > 0;

function handleClearSelection() {
  setRowSelection({});
}

// In JSX
{hasSelection && (
  <div className="flex items-center gap-2">
    <span>{t("selectedCount", { count: selectedRows.length })}</span>
    <Button variant="outline" onClick={handleClearSelection}>
      {t("clearSelection")}
    </Button>
    <Button variant="destructive" onClick={handleDeleteBulk}>
      {t("deleteSelected")}
    </Button>
  </div>
)}
```

---

## Common Patterns

### Always Use getRowId

```typescript
const table = useReactTable({
  getRowId: (row) => row.id, // ALWAYS provide this
  // ...
});
```

### Fallback for Empty Data

```typescript
const table = useReactTable({
  data: data ?? [], // Always provide fallback
  // ...
});
```

### Translation Function Type

```typescript
type TranslationFunction = (key: string) => string;

// Or use next-intl type
export function getColumns(
  t: ReturnType<typeof useTranslations>
): ColumnDef<Data>[] {
  // ...
}
```

---

## Anti-Patterns

### DO NOT

1. **Add table-specific meta to global `react-table.d.ts`**
   ```typescript
   // ❌ BAD: Global declaration with table-specific properties
   interface TableMeta<TData> {
     organizationId?: string; // Table-specific!
     onDelete?: (id: string) => void; // Table-specific!
   }
   ```

2. **Use `as never` for meta type assertion**
   ```typescript
   // ❌ BAD: Using `as never` loses type safety
   meta: { organizationId } as never,

   // ✅ GOOD: Use proper interface extension
   meta: { organizationId } as MyTableMeta,
   ```

3. **Forget to export types from columns.tsx**
   ```typescript
   // ❌ BAD: Type is not exported
   type Member = RouterOutput["members"][number];

   // ✅ GOOD: Export for use in index.tsx
   export type Member = RouterOutput["members"][number];
   ```

---

## References

- **TanStack Table Docs:** https://tanstack.com/table/latest
- **Column Defs Guide:** https://tanstack.com/table/latest/docs/guide/column-defs
- **Row Selection:** https://tanstack.com/table/latest/docs/guide/row-selection
- **Filtering:** https://tanstack.com/table/latest/docs/guide/column-filtering
- **TypeScript Guide:** https://tanstack.com/table/latest/docs/guide/typescript
