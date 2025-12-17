# Component Patterns

This document contains React component organization rules, patterns, and UI standards.

## Component Organization Rules

### Core Principles
- **Page-specific components go in `_components` folder** - Components used exclusively by a single page/route group belong in a `_components` folder at the same level as the `page.tsx` or `layout.tsx` file
- **Layout-specific components go in route group `_components`** - Components used by a layout (like header/sidebar) belong in the route group's `_components` folder (e.g., `(sidebar)/_components/`)
- **Generic reusable components stay in `@/components`** - Components that are generic, potentially reusable across multiple contexts belong in `@/components`
- **UI library components in `@/components/ui`** - Standard UI library components (shadcn/ui) always belong in `@/components/ui`

### Decision Criteria
When deciding where to place a component, ask:
1. **Is it page-specific logic?** → `page/_components/`
2. **Is it layout-specific (header/sidebar)?** → `(route-group)/_components/`
3. **Is it generic and potentially reusable?** → `@/components/`
4. **Is it a UI library component?** → `@/components/ui/`

Examples of generic components that belong in `@/components`:
- `animated-number.tsx` - Generic animation utility
- `format-amount.tsx` - Generic formatting utility
- `area-chart.tsx` - Generic chart component
- `language-switch.tsx` - Generic language switcher
- `theme-switch.tsx` - Generic theme switcher

### Example Structure
```
app/
  [locale]/
    (sidebar)/                    # Route group with layout
      layout.tsx                  # Uses header and sidebar
      _components/
        header/                   # Layout-specific
          header.tsx
          user-menu.tsx
        sidebar/                  # Layout-specific
          sidebar.tsx
          main-menu.tsx
          organization-dropdown.tsx
      page.tsx                    # Dashboard page
      _components/
        chart-selectors.tsx       # Page-specific
        charts.tsx                # Page-specific

components/
  ui/                             # UI library components
  animated-number.tsx             # Generic reusable component
  format-amount.tsx               # Generic reusable component
  icons.tsx                       # Shared icon definitions
```

## Component Standards

- **Use standard UI components** - Always use the correct, standardized components from the design system (e.g., `Sheet` instead of custom drawers)
- **Delete unnecessary custom components** - Remove custom implementations when standard alternatives exist in the UI library
- **Maintain consistency with design system** - Prefer established UI patterns over custom implementations for better maintainability and accessibility
- **Refactor deprecated components** - When removing custom components, refactor all usages to use proper standard components
- **Use icons from @/components/icons.tsx** - Always use icon components from `@/components/icons.tsx` instead of raw characters (e.g., use `<Icons.Check />` instead of `✓`)

## Sheet vs Dialog Usage

- **Use Sheet for create and edit forms** - Sheet components provide better UX for form-heavy operations with side-panel layout
- **Use Dialog for confirmations and alerts** - Dialog components are appropriate for delete confirmations, warnings, and simple alerts
- **Consistent pattern** - Always use Sheet for CRUD create/edit operations across the application
- **Example** - Create/Edit bank providers use Sheet, Delete confirmation uses Dialog

## Z-Index Layering System

Maintain proper z-index hierarchy to ensure components overlay each other in the correct order.

**Z-index levels** (configured in `globals.css`):
- Header/Navigation: `z-50` (standard UI elements)
- Sheet/Dialog overlay: `z-100` (modal overlays and side panels)
- Sheet/Dialog content: `z-100` (modal content)
- Select/Dropdown popovers: `z-150` (dropdowns inside modals must be above modal content)
- Tooltips/Toasts: `z-200` or higher as needed for top-most elements

**Rules:**
- Popovers and dropdowns inside sheets/dialogs must have z-index > 100 to appear above the sheet
- Select component inside Sheet uses `z-150` to overlay the Sheet's `z-100`

**Available z-index utilities**: `z-10`, `z-20`, `z-30`, `z-40`, `z-50`, `z-60`, `z-70`, `z-100`, `z-150`, `z-200`

## Table Implementation Standards

- **ALWAYS use TanStack Table** (`@tanstack/react-table`) for all table implementations
- **Descriptive table component names** - Name table components after their content (e.g., `FeeRulesTable`, `ApiKeysTable`, not just `DataTable`)
- **Consistent table patterns** - Follow patterns from existing tables (settings pages)
- **Type-safe columns** - Use `ColumnDef<T>` with proper TypeScript types from tRPC router outputs
- **Standard UI components** - Use shadcn/ui Table components (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`)
- **Empty states** - Always provide empty state components when no data available
- **Column definitions** - Create separate `columns.tsx` file with `getColumns()` function that accepts translation function
- **Client components** - Table implementations must be client components (`"use client"`)
- **Data fetching** - Use tRPC hooks for data: `trpc.*.*.useQuery()`

**File structure pattern:**
```
_components/
  └── table/
      ├── index.tsx               # Exports {FeatureName}Table component
      ├── columns.tsx             # Column definitions
      ├── empty-state.tsx         # Empty state component (if needed)
      └── {other-components}.tsx  # Other table-related components
```

## Import Path Standards

- **Use absolute imports with path aliases** - Always use configured path aliases instead of relative imports for better maintainability
- **Source code imports** - Use `@/*` for importing from the `src/` directory: `import { Example } from "@/module/example"`
- **Test imports** - Use `@test/*` for importing from the `test/` directory: `import { webhookContext } from "@test/webhook-context"`
- **Workspace package imports** - Use workspace package names: `import { Entity } from "@gate/core/domain/entities/entity"`
- **Avoid relative paths** - Never use relative paths like `../../../test/file` when an absolute import alias is available

```typescript
// ✅ CORRECT: Use absolute imports with aliases
import { Service } from "@/services/my-service";
import { webhookContext } from "@test/webhook-context";
import { Entity } from "@gate/core/domain/entities/entity";

// ❌ WRONG: Relative imports
import { Service } from "../../../services/my-service";
```

### Relative vs Absolute Import Guidelines
- **Use absolute imports for types** - When importing types from shared locations, prefer absolute imports using `@/` alias
- **Use absolute imports for cross-directory dependencies** - When importing from distant directories (3+ levels up), use absolute imports
- **Relative imports for siblings** - Use relative imports only for files in the same directory or one level up/down

## Utility File Organization

- **Separate utility functions into individual files** - Never create monolithic utility files with multiple unrelated functions
- **One main function per file** - Each utility file should contain one main exported function with any helper functions it needs
- **Use kebab-case for filenames** - Utility filenames must use kebab-case matching the main function name (e.g., `get-field-options.ts` for `getFieldOptions` function)
- **Group related utilities in subdirectories** - Create a `utils/` subdirectory when you have multiple related utility functions
- **Include helper functions in the same file** - Helper functions used only by the main function should be co-located in the same file

**Example structure:**
```typescript
// ✅ CORRECT: utils/get-field-options.ts
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
  return value !== null && value !== undefined;
}

export function getFieldOptions<TData>({ field }: { field: DataTableFilterField<TData> }) {
  // Main function implementation using notEmpty helper
}

// ❌ WRONG: utils.ts with multiple unrelated functions
export function getFieldOptions() { ... }
export function getFilterValue() { ... }
export function replaceInput() { ... }
```

## Formatters and Validators Organization

### Formatters Structure
- **Location** - All formatter utilities must be in `utils/formatters/` directory
- **Locale support** - All formatting functions must accept locale through an options object parameter
- **Options pattern** - Use `options: { locale?: string, ...otherOptions }` with default `locale = "en-US"`
- **No barrel exports** - Import directly from individual files (e.g., `@/utils/formatters/format-amount`)
- **Subdirectory organization** - Group related formatters (credit-card, document, phone, postal-code) into subdirectories
- **One main function per file** - Each formatter should be in its own file

**Example structure:**
```
utils/formatters/
├── format-amount.ts
├── format-currency.ts
├── format-date.ts
├── credit-card/
│   ├── format-card-number.ts
│   ├── format-cvv.ts
│   └── format-expiry-date.ts
├── document/
│   ├── format-cpf.ts
│   └── format-cnpj.ts
└── phone/
    └── format-phone.ts
```

### Validators Structure
- **Location** - All validator utilities must be in `utils/validators/` directory
- **Subdirectory organization** - Group related validators (array validations) into subdirectories
- **One validator per file** - Each validation function in its own file
- **Type guard pattern** - Use TypeScript type guards (`arr is number[]`) for proper type narrowing
- **No barrel exports** - Import directly from individual files

**Example structure:**
```
utils/validators/
├── is-valid-card-number.ts
└── array/
    ├── is-array-of-numbers.ts
    ├── is-array-of-dates.ts
    └── is-array-of-strings.ts
```

**Key principles:**
- ✅ Formatters in `utils/formatters/`, validators in `utils/validators/`
- ✅ All formatters accept locale through options object
- ✅ Group related functions in subdirectories
- ✅ One main function per file with descriptive names
- ✅ No barrel exports, direct imports only
- ✅ Type guards for validation functions
- ✅ Keep validation separate from formatting
