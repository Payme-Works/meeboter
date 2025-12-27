# Code Style Guidelines

This document contains comprehensive code style patterns and formatting rules for the codebase.

## Inline Function Results

Prefer using function results directly inline instead of creating separate variables when the value is only used once. Only create separate variables when the value needs to be reused or when it significantly improves readability.

```typescript
// ✅ CORRECT: Use mapper directly inline (single use)
await this.prisma.notification.create({
    data: PrismaNotificationMapper.toPrisma(notification),
});

// ❌ WRONG: Unnecessary variable for single use
const prismaData = PrismaNotificationMapper.toPrisma(notification);
await this.prisma.notification.create({
    data: prismaData,
});

// ✅ CORRECT: Variable is acceptable when reused
const mappedData = PrismaEntityMapper.toPrisma(entity);
await this.prisma.entity.create({ data: mappedData });
await this.cache.set(entity.id, mappedData);
```

## Variable Block Separation

Always separate variable blocks by context with blank lines between statement blocks. Group related variables together and add blank lines to separate different contextual groups for better readability.

```typescript
// ❌ WRONG: Variables grouped without blank lines
const periodSelectId = useId();
const { params, setParams } = useStatisticsParams();
const t = useTranslations("overview.statisticsPeriod");
const locale = useLocale();
const bcp47Locale = LOCALE_TO_BCP47_MAP[locale] || "en-US";
const dateFnsLocale = DATE_FNS_LOCALE_MAP[bcp47Locale];

// ✅ CORRECT: Variable blocks separated by context
const periodSelectId = useId();

const { params, setParams } = useStatisticsParams();

const t = useTranslations("overview.statisticsPeriod");

const locale = useLocale();

const bcp47Locale = LOCALE_TO_BCP47_MAP[locale] || "en-US";
const dateFnsLocale = DATE_FNS_LOCALE_MAP[bcp47Locale];
```

## JSDoc Comment Spacing in Interfaces (CRITICAL)

Always add a blank line before multi-line JSDoc comments within interface or type definitions. This visually separates documented properties and improves readability. Single-line JSDoc comments (`/** text */`) do not require a blank line before them when they are the first property.

```typescript
// ✅ CORRECT: Blank lines before multi-line JSDoc comments
interface TargetConfig {
	/** Glob patterns to find class files */
	searchPaths: string[];

	/**
	 * Glob patterns to exclude files/folders from search
	 * @example ["**/.next/**", "**/coverage/**"]
	 */
	ignorePaths: string[];

	/**
	 * Class name patterns to exclude from unused detection
	 * @example ["*Mock*", "*Test*", "*Stub*"]
	 */
	excludePatterns: string[];

	/**
	 * Custom regex patterns to detect framework-specific usage
	 * @example [(name) => new RegExp(`@Inject\\(${name}\\)`, "g")]
	 */
	usagePatterns: ((className: string) => RegExp)[];
}

// ❌ WRONG: No blank lines between JSDoc-documented properties
interface TargetConfig {
	/** Glob patterns to find class files */
	searchPaths: string[];
	/**
	 * Glob patterns to exclude files/folders from search
	 * @example ["**/.next/**", "**/coverage/**"]
	 */
	ignorePaths: string[];
	/**
	 * Class name patterns to exclude from unused detection
	 * @example ["*Mock*", "*Test*", "*Stub*"]
	 */
	excludePatterns: string[];
	/**
	 * Custom regex patterns to detect framework-specific usage
	 * @example [(name) => new RegExp(`@Inject\\(${name}\\)`, "g")]
	 */
	usagePatterns: ((className: string) => RegExp)[];
}
```

**Why this matters:**
- Multi-line JSDoc blocks contain important documentation (descriptions, examples, types)
- Without blank lines, documentation becomes a wall of text that's hard to scan
- Visual separation helps developers quickly identify property boundaries
- Consistent formatting makes interfaces easier to maintain

## Statement Separation Within Functions

Always add a blank line between consecutive statements that perform distinct operations, even when they are closely related. This improves readability by visually separating each logical step.

```typescript
// ❌ WRONG: Consecutive statements without blank lines
const updateSpinner = throttle((step: string, message: string) => {
    if (step !== lastStatus.step || message !== lastStatus.message) {
        lastStatus = { step, message };
        deploySpinner.text = chalk.gray(`${step}: ${message}`);
    }
}, 100);

// ✅ CORRECT: Blank lines between distinct statements
const updateSpinner = throttle((step: string, message: string) => {
    if (step !== lastStatus.step || message !== lastStatus.message) {
        lastStatus = { step, message };

        deploySpinner.text = chalk.gray(`${step}: ${message}`);
    }
}, 100);

// ❌ WRONG: Related but distinct operations without separation
restoreGitFolder();
gitRestored = true;
deploySpinner.succeed(chalk.gray("Upload complete"));

// ✅ CORRECT: Blank lines between each distinct operation
restoreGitFolder();

gitRestored = true;

deploySpinner.succeed(chalk.gray("Upload complete"));

// ❌ WRONG: Await and result handling without separation
try {
    await subprocess;
    deploySpinner.succeed(chalk.green("Deployed"));
} catch (error) {
    deploySpinner.fail(chalk.red("Failed"));
    deployError = error as Error;
}

// ✅ CORRECT: Blank lines after await and before assignment
try {
    await subprocess;

    deploySpinner.succeed(chalk.green("Deployed"));
} catch (error) {
    deploySpinner.fail(chalk.red("Failed"));

    deployError = error as Error;
}
```

**When to add blank lines:**
- Between variable assignments and function calls
- Between state mutations and side effects
- Between any two statements that perform different logical operations
- Before and after conditional blocks
- Between console output statements and process control (exit, return, throw)

**Exception:** Directly related statements that form a single logical unit may stay together (e.g., getting a value and immediately returning it).

### CLI Script Pattern (console.error + process.exit)

In CLI scripts, always add a blank line between `console.error()` (or `console.log()`) and `process.exit()`. This improves readability by visually separating the error message from the process termination.

```typescript
// ❌ WRONG: No blank line between console output and process.exit
if (matchingPackages.length > 1) {
    console.error(chalk.red("Multiple packages match pattern"));
    process.exit(1);
}

// ✅ CORRECT: Blank line separates message from exit
if (matchingPackages.length > 1) {
    console.error(chalk.red("Multiple packages match pattern"));

    process.exit(1);
}

// ❌ WRONG: No separation in multi-line error output
for (const pkg of matchingPackages) {
    console.error(chalk.gray(`  - ${pkg.name}`));
}
console.error(chalk.red("\nPlease use a more specific pattern."));
process.exit(1);

// ✅ CORRECT: Blank lines for visual separation
for (const pkg of matchingPackages) {
    console.error(chalk.gray(`  - ${pkg.name}`));
}

console.error(chalk.red("\nPlease use a more specific pattern."));

process.exit(1);
```

## Class Property Spacing

Always separate class properties by context/purpose with blank lines. Group related properties together and separate different contextual groups for better visual organization.

```typescript
// ❌ WRONG: No contextual separation between property groups
export class CoinMarketCapProvider implements CurrencyProviderContract {
    public readonly name = "CoinMarketCapProvider";
    private readonly apiUrl = "https://pro-api.coinmarketcap.com/";
    private readonly apiKey: string;
}

// ✅ CORRECT: Blank line separating different contextual groups
export class CoinMarketCapProvider implements CurrencyProviderContract {
    public readonly name = "CoinMarketCapProvider";

    private readonly apiUrl = "https://pro-api.coinmarketcap.com/";
    private readonly apiKey: string;
}
```

**Context groups:**
- **Identity/Name**: Public identifier properties (e.g., `name`)
- **Configuration**: API-related properties grouped together (e.g., `apiUrl`, `apiKey`)
- **State**: Instance state properties (if any)
- **Dependencies**: Injected dependencies from constructor

## JSX Element Spacing

Always add blank lines between adjacent JSX elements to improve code readability. This applies to all JSX elements including self-closing tags, component wrappers, nested structures, and repeated components like skeleton loaders.

```jsx
// ✅ CORRECT: Blank lines between JSX elements
<div className="container">
	<Header />

	<main>
		<Sidebar />

		<Content>
			<Title />

			<Description />

			<ActionButtons />
		</Content>
	</main>

	<Footer />
</div>

// ✅ CORRECT: Blank lines between repeated components
<TransactionSheetSectionsContainer>
	<TransactionSheetSectionSkeleton />

	<TransactionSheetSectionSkeleton />

	<TransactionSheetSectionSkeleton />
</TransactionSheetSectionsContainer>

// ❌ WRONG: No spacing between elements
<div className="container">
	<Header />
	<main>
		<Sidebar />
		<Content>
			<Title />
			<Description />
			<ActionButtons />
		</Content>
	</main>
	<Footer />
</div>

// ❌ WRONG: No spacing between repeated components
<TransactionSheetSectionsContainer>
	<TransactionSheetSectionSkeleton />
	<TransactionSheetSectionSkeleton />
	<TransactionSheetSectionSkeleton />
</TransactionSheetSectionsContainer>
```

**Exception:** Elements that are logically grouped as a single unit (like a label with its input) may stay together without blank lines.

## Function Declaration Style

Prefer using named function declarations instead of arrow functions, except when passing a function as a parameter or argument.

```javascript
// Correct
function myFunction() {
  // ...
}
```

## Statement Padding

Ensure there is a blank line before and after major code blocks to improve readability and code separation. This includes `if` statements, `functions`, `classes`, `interfaces`, `types`, `try/catch` blocks, and `multiline` declarations.

## Comment Block Separation in Objects

Always separate comment-annotated blocks in object literals with blank lines. When objects contain multiple sections marked with comments (e.g., `// Filters`, `// Pagination`, `// Sorting`), add a blank line before each comment to clearly separate the contextual groups.

```typescript
// ❌ WRONG: Comment blocks without blank line separation
{
    // Filters
    level: search.level || [],
    type: search.type || [],
    // Pagination
    take: search.size,
    // Sorting
    orderBy: search.sort ? [...] : [...],
}

// ✅ CORRECT: Blank lines before each comment block
{
    // Filters
    level: search.level || [],
    type: search.type || [],

    // Pagination
    take: search.size,

    // Sorting
    orderBy: search.sort ? [...] : [...],
}
```

## Section Comment Headings (MANDATORY)

When adding section separators/headings in code to organize logical sections, use the box-drawing line character (`─`) format. Never use equals signs (`=`) or other characters for section headings.

```typescript
// ✅ CORRECT: Box-drawing line format with blank lines above and below
// ─── Sub-routers ────────────────────────────────────────────────

const poolSubRouter = createTRPCRouter({ ... });

// ─── Main Router ────────────────────────────────────────────────

export const botsRouter = createTRPCRouter({ ... });

// ─── Helper Functions ───────────────────────────────────────────

function processData() { ... }

// ❌ WRONG: No blank lines around heading
// ─── Sub-routers ────────────────────────────────────────────────
const poolSubRouter = createTRPCRouter({ ... });

// ❌ WRONG: Equals signs (single or multi-line)
// ============================================================================
// Sub-routers
// ============================================================================

// ❌ WRONG: Other separator characters
// ====================================
// Sub-routers
// ====================================

// ❌ WRONG: Dashes
// ---------------------------------
// Sub-routers
// ---------------------------------
```

**Format requirements:**
- Start with `// ─── ` (two slashes, space, three box-drawing lines, space)
- Section title in sentence case
- End with space followed by box-drawing lines to fill ~70 characters total
- **Always add a blank line above AND below the heading**
- Single line only, never multi-line section headers
- The box-drawing character is `─` (U+2500), NOT a regular hyphen `-`

**When to use section headings:**
- Separating logical groups in large files (routers, services)
- Organizing different categories of functions/components
- Marking major sections in complex files

## Comment Guidelines

Keep comments concise and helpful, focusing on the "why" rather than the "what". Avoid excessive comments that state the obvious, but include comments that explain non-obvious logic, business rules, or important context.

**Comment best practices:**
- ✅ Explain non-obvious logic or business rules
- ✅ Clarify the "why" behind decisions
- ✅ Document important context or constraints
- ❌ Avoid restating what the code already clearly shows
- ❌ Don't comment every line or obvious operations
- ❌ Never add comments that describe what the next line of code does when it's self-evident

### Comment Punctuation (MANDATORY)

When adding clarifying context to comments, use **parentheses or commas** instead of hyphens. Hyphens can be confused with box-drawing section headings.

```tsx
// ✅ CORRECT: Parentheses for clarifying context
{/* Header badges (positioned top-right) */}
{/* Platform section (collapsible) */}

// ✅ CORRECT: Commas for additional context
{/* Platform section, shows all platforms for multi-platform */}

// ❌ WRONG: Hyphens for clarifying context
{/* Header badges - positioned top-right */}
{/* Platform section - collapsible for multi-platform */}
```

### Avoid Obvious Comments (MANDATORY)

Never write comments that simply describe what the code does when the code is self-explanatory. Function names, variable names, and method calls should be descriptive enough to understand without comments.

```typescript
// ❌ WRONG: Comments that state the obvious
const handleSessionExpired = () => {
    // Clear bearer token from localStorage
    clearBearerToken();

    // Redirect to sign-in page
    router.push(signInPath);
};

// ✅ CORRECT: Let the code speak for itself (keep blank lines for readability)
const handleSessionExpired = () => {
    clearBearerToken();

    router.push(signInPath);
};

// ❌ WRONG: Obvious comments
// Get user from database
const user = await prisma.user.findUnique({ where: { id } });

// Check if user exists
if (!user) {
    throw new Error("User not found");
}

// ✅ CORRECT: Only comment when explaining WHY, not WHAT
// Admin users bypass organization restrictions for cross-org support tasks
const user = await prisma.user.findUnique({ where: { id } });

if (!user) {
    throw new Error("User not found");
}
```

**When comments ARE appropriate:**
- Explaining business rules or domain logic
- Documenting non-obvious edge cases
- Warning about potential pitfalls
- Explaining "why" a specific approach was chosen
- Documenting workarounds or technical debt

## Class Concatenation

Always use the `cn` utility function from `@/lib/utils` for concatenating CSS classes in JSX elements, especially when using conditional classes.

```jsx
import { cn } from "@/lib/utils";

<div className={cn(
  "base-class",
  condition ? "conditional-class" : "alternative-class"
)}>
```

## Conditional Rendering in JSX

Always use ternary conditionals (`? :`) instead of logical AND (`&&`) for conditional component rendering in JSX. This makes the intent clearer and avoids potential issues with falsy values.

```jsx
// ✅ CORRECT: Use ternary for conditional components
{isLoading ? (
  <Spinner size={20} />
) : null}

{isLoading || isPending ? (
  <Spinner size={20} />
) : null}

{hasItems ? (
  <ItemList items={items} />
) : (
  <EmptyState />
)}

// ❌ WRONG: Don't use logical AND for conditional rendering
{isLoading && <Spinner />}
{hasItems && <ItemList items={items} />}
```

## Block Statements Requirement

Always use curly braces `{}` for all control flow statements, even single-line statements. This is enforced by Biome's `useBlockStatements` rule.

```javascript
// ✅ CORRECT: Always use braces
if (condition) {
    return;
}

for (const item of items) {
    processItem(item);
}

// ❌ WRONG: Single-line without braces
if (condition) return;
for (const item of items) processItem(item);
```

## Composition Pattern for JSX Components

Prefer composition patterns over prop-based APIs when building reusable JSX components. Use named exports for compound components instead of dot notation objects. The container element uses the base name, child components use the base name as prefix.

### Basic Composition Pattern

```tsx
// ✅ CORRECT: Composition pattern with named exports
export function DetailRow({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            {children}
        </div>
    );
}

export function DetailRowLabel({ children }: { children: React.ReactNode }) {
    return <span className="text-muted-foreground text-sm">{children}</span>;
}

export function DetailRowValue({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
}

// Usage
<DetailRow>
    <DetailRowLabel>Amount</DetailRowLabel>

    <DetailRowValue>$100.00</DetailRowValue>
</DetailRow>

// ❌ WRONG: Dot notation object pattern
const DetailRow = {
    Root: DetailRowRoot,
    Label: DetailRowLabel,
    Value: DetailRowValue,
};

<DetailRow.Root>
    <DetailRow.Label>Amount</DetailRow.Label>

    <DetailRow.Value>$100.00</DetailRow.Value>
</DetailRow.Root>

// ❌ WRONG: Prop-based API
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{label}</span>
            <div>{children}</div>
        </div>
    );
}
```

**Benefits of composition pattern with named exports:**
- More flexible, can render complex elements in labels or values
- Better type safety, each sub-component has its own props
- Clearer intent, explicit structure in JSX
- Easier to extend, add new sub-components without breaking existing API
- More composable, can reorder or conditionally render parts
- Better tree-shaking, unused components are not bundled
- Simpler imports, no need to reference through parent object

### Context-Based Composition Pattern (for Stateful Components)

When sub-components need to share state (open/close, selected values, etc.), use React Context to coordinate between them.

```tsx
// 1. Define context type
type DatePickerContextValue = {
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
    isDesktop: boolean;
};

// 2. Create context with null default
const DatePickerContext = React.createContext<DatePickerContextValue | null>(null);

// 3. Create hook with error boundary
function useDatePickerContext() {
    const context = React.useContext(DatePickerContext);

    if (!context) {
        throw new Error("DatePicker components must be used within DatePicker");
    }

    return context;
}

// 4. Root component provides context
function DatePicker({ date, setDate, children }: DatePickerProps) {
    const [open, setOpen] = React.useState(false);
    const isDesktop = useMediaQuery("(min-width: 640px)");

    const contextValue = React.useMemo(
        () => ({ date, setDate, open, setOpen, isDesktop }),
        [date, setDate, open, isDesktop],
    );

    return (
        <DatePickerContext.Provider value={contextValue}>
            {isDesktop ? (
                <Popover open={open} onOpenChange={setOpen}>
                    {children}
                </Popover>
            ) : (
                <Drawer open={open} onOpenChange={setOpen}>
                    {children}
                </Drawer>
            )}
        </DatePickerContext.Provider>
    );
}

// 5. Sub-components consume context
function DatePickerTrigger({ className }: { className?: string }) {
    const { date, isDesktop } = useDatePickerContext();

    const button = (
        <Button className={className}>
            {date?.from ? format(date.from, "PPP") : "Pick a date"}
        </Button>
    );

    return isDesktop ? (
        <PopoverTrigger asChild>{button}</PopoverTrigger>
    ) : (
        <DrawerTrigger asChild>{button}</DrawerTrigger>
    );
}

function DatePickerContent({ align = "start" }: { align?: "start" | "center" | "end" }) {
    const { date, setDate, isDesktop } = useDatePickerContext();

    if (isDesktop) {
        return (
            <PopoverContent align={align}>
                <Calendar selected={date} onSelect={setDate} />
            </PopoverContent>
        );
    }

    return (
        <DrawerContent>
            <Calendar selected={date} onSelect={setDate} />
        </DrawerContent>
    );
}

// 6. Export named functions at end of file
export { DatePicker, DatePickerTrigger, DatePickerContent };
```

**Usage:**
```tsx
import {
    DatePicker,
    DatePickerTrigger,
    DatePickerContent,
} from "@/components/custom/date-picker";

<DatePicker date={date} setDate={setDate}>
    <DatePickerTrigger className="min-w-72" />
    <DatePickerContent align="end" />
</DatePicker>
```

### When to Use Context-Based Composition

Use context when:
- Sub-components need shared state (open/close, selected value)
- Components have responsive variations (Popover vs Drawer)
- Multiple children need access to the same data
- State changes in one component affect another

Use simple composition (no context) when:
- Components are purely presentational
- No shared state between sub-components
- Each sub-component is independent

### File Structure for Composition Components

```tsx
// 1. Imports
import * as React from "react";

// 2. Context type definition
type ComponentContextValue = { /* ... */ };

// 3. Context creation
const ComponentContext = React.createContext<ComponentContextValue | null>(null);

// 4. Context hook
function useComponentContext() { /* ... */ }

// 5. Props interfaces (if complex)
interface ComponentProps { /* ... */ }
interface ComponentTriggerProps { /* ... */ }
interface ComponentContentProps { /* ... */ }

// 6. Root component
function Component({ children, ...props }: ComponentProps) { /* ... */ }

// 7. Sub-components
function ComponentTrigger({ className }: ComponentTriggerProps) { /* ... */ }
function ComponentContent({ align }: ComponentContentProps) { /* ... */ }

// 8. Internal helper components (not exported)
function InternalHelper() { /* ... */ }

// 9. Named exports at end of file
export { Component, ComponentTrigger, ComponentContent };
```

## React Key Generation Rules (MANDATORY)

When rendering lists of elements in React, proper key generation is critical to avoid hydration mismatch errors in SSR applications and React reconciliation issues.

### Prohibited Key Patterns
- **NEVER use Math.random() for keys** - Generates different values on server vs client during SSR
- **NEVER use bare array index as key** - Using `key={index}` directly violates React best practices
- **NEVER use map index parameter directly** - The index from `.map((item, index) => ...)` should not be used in the key prop

### Correct Key Generation Patterns

**1. Skeleton/Loading States (SSR-Safe)**
```tsx
// ✅ CORRECT: Create objects with stable ID fields
const skeletons = Array.from({ length: 3 }, (_, index) => ({
  id: `skeleton-${index}`,
}));

return (
  <div>
    {skeletons.map((skeleton) => (
      <Skeleton key={skeleton.id} className="h-4 w-32" />
    ))}
  </div>
);

// ❌ WRONG: Using Math.random() (causes hydration mismatch)
{Array.from({ length: 3 }).map(() => (
  <Skeleton key={`skeleton-${Math.random()}`} className="h-4 w-32" />
))}
```

**2. Data with Unique IDs**
```tsx
// ✅ CORRECT: Use entity ID from backend
{users.map((user) => (
  <UserCard key={user.id} user={user} />
))}
```

**3. File Uploads**
```tsx
// ✅ CORRECT: Use file properties for unique keys
{files.map((file) => (
  <div key={`${file.name}-${file.size}-${file.lastModified}`}>
    {file.name}
  </div>
))}
```

### Key Selection Checklist
1. Does the data have a unique ID? → Use `key={item.id}`
2. Is it a skeleton/loading state? → Create objects with ID fields
3. Is it a file upload? → Combine file properties
4. Are the values themselves unique? → Use `key={value}`
5. None of the above? → Create a composite key from stable properties

## Advanced Composition Pattern Rules

### 1. Minimal Container Props
Container components should only contain props needed for internal state management or logic coordination. Display data and styling should be passed to specific sub-components.

```tsx
// ✅ CORRECT: State in container, styling in sub-component
<DatePicker date={date} setDate={setDate}>
    <DatePickerTrigger className="min-w-72" />
    <DatePickerContent align="end" />
</DatePicker>

// ❌ WRONG: Styling props on container
<DatePicker date={date} setDate={setDate} triggerClassName="min-w-72" align="end" />
```

### 2. Full Composition Over Props
Break components into composable sub-components instead of passing data as props. Each logical part becomes a separate component that accepts children.

```tsx
// ✅ CORRECT: Full composition pattern
function PlatformHeader({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">{children}</div>
        </div>
    );
}

function PlatformHeaderIcon({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center">
            {children}
        </div>
    );
}

function PlatformHeaderTitle({ children }: { children: React.ReactNode }) {
    return (
        <div>
            <h3 className="font-semibold">{children}</h3>
            <p className="text-xs text-muted-foreground">Deployment Platform</p>
        </div>
    );
}

function PlatformHeaderStatus({ isActive }: { isActive: boolean }) {
    return <Badge>{isActive ? "Active" : "Inactive"}</Badge>;
}

// Usage - fully composable
<PlatformHeader>
    <PlatformHeaderIcon>
        <Container className="h-5 w-5 text-muted-foreground" />
    </PlatformHeaderIcon>

    <PlatformHeaderTitle>Kubernetes</PlatformHeaderTitle>

    <PlatformHeaderStatus isActive={isActive} />
</PlatformHeader>

// ❌ WRONG: Props-based API
<PlatformHeader
    platform="Kubernetes"
    icon={Container}
    isActive={isActive}
/>

// ❌ WRONG: Partial composition (icon as children, but title as prop)
<PlatformHeader platform="Kubernetes" isActive={isActive}>
    <Container className="h-5 w-5" />
</PlatformHeader>
```

**Benefits of full composition:**
- Each part independently customizable
- Caller controls all styling and content
- Easy to add/remove/reorder parts
- No complex prop interfaces
- Consistent with React's composition model

### 3. Display Values as Children
When a prop has a corresponding child component, pass the value as children to that component instead of as a prop to the container.

### 4. Context Pattern for Shared State
Use React Context when multiple sub-components need to access the same state. The context should:
- Be defined as a type with all shared values
- Use `null` as default and throw error if used outside provider
- Memoize the context value to prevent unnecessary re-renders

```tsx
// ✅ CORRECT: Memoized context value
const contextValue = React.useMemo(
    () => ({ date, setDate, open, setOpen, isDesktop }),
    [date, setDate, open, isDesktop],
);
```

### 5. Named Exports with Prefix Convention
Use named exports with the base component name as prefix (e.g., `DatePicker`, `DatePickerTrigger`, `DatePickerContent`). Export all public components at the end of the file.

```tsx
// ✅ CORRECT: Named exports at end of file
export { DatePicker, DatePickerTrigger, DatePickerContent };

// ❌ WRONG: Export each function inline
export function DatePicker() { /* ... */ }
export function DatePickerTrigger() { /* ... */ }
```

### 6. Responsive Composition Pattern
When components have different implementations for different screen sizes (Popover vs Drawer), handle the variation in the root component and sub-components.

```tsx
// Root component chooses wrapper based on screen size
function Component({ children }: Props) {
    const isDesktop = useMediaQuery("(min-width: 640px)");

    return (
        <Context.Provider value={contextValue}>
            {isDesktop ? (
                <Popover>{children}</Popover>
            ) : (
                <Drawer>{children}</Drawer>
            )}
        </Context.Provider>
    );
}

// Sub-components adapt to the chosen wrapper
function ComponentTrigger({ className }: TriggerProps) {
    const { isDesktop } = useContext();

    return isDesktop ? (
        <PopoverTrigger asChild>{button}</PopoverTrigger>
    ) : (
        <DrawerTrigger asChild>{button}</DrawerTrigger>
    );
}
```

### 7. Break Down All Components
Complex components like menus, dropdowns, date pickers, and forms should be broken down into composition patterns. Each logical unit becomes a separate component.

**Summary of Composition Pattern Rules:**
1. **Minimal container props** - State/logic in container, styling in sub-components
2. **Full composition over props** - Break into sub-components, each part accepts children
3. **Display values as children** - Pass to dedicated components
4. **Context for shared state** - Memoized context when 2+ children need same data
5. **Named exports with prefix** - All exports at end of file
6. **Responsive composition** - Root component chooses wrapper, sub-components adapt
7. **Break down all components** - Complex components always use composition
8. **Direct props for single consumers** - No context needed for single data consumers

## Configuration Object Formatting (tsup, bunfig, etc.)

Always format configuration objects with proper blank line separation between logical groups. This applies to build configs (tsup.config.ts), test configs (bunfig.toml), and similar configuration files.

```typescript
// ✅ CORRECT: Blank lines between logical groups
export default defineConfig((options: Options) => ({
	entry: ["src/**/*.ts"],

	// Exclude test files from build
	exclude: ["**/*.spec.ts", "**/*.test.ts", "**/*.e2e-spec.ts"],
	external: ["bun:test"],

	format: ["cjs", "esm"],
	splitting: true,
	treeshake: true,

	// DTS generation disabled due to memory issues
	dts: false,
	minify: true,
	clean: true,

	...options,
}));

// ❌ WRONG: No blank lines between groups
export default defineConfig((options: Options) => ({
	entry: ["src/**/*.ts"],
	// Exclude test files from build
	exclude: ["**/*.spec.ts", "**/*.test.ts", "**/*.e2e-spec.ts"],
	external: ["bun:test"],
	format: ["cjs", "esm"],
	splitting: true,
	treeshake: true,
	dts: false,
	minify: true,
	clean: true,
	...options,
}));
```

**Configuration grouping order:**
1. **Entry/input** - Source files and entry points
2. **Exclusions** - Files to exclude (with comment)
3. **Output format** - format, splitting, treeshake
4. **Build options** - dts, minify, clean (with explanatory comments)
5. **External/platform** - external dependencies, platform settings
6. **Spread options** - `...options` always last

## Remove Unused Code (MANDATORY)

Always remove unused code, fields, variables, and response data. Never keep dead code "just in case" or for future use. Unused code increases maintenance burden and can lead to confusion.

### Response Fields and API Data
- **Remove unused response fields** - If a field is not used by any client, remove it from the response schema and use case
- **Avoid premature field additions** - Only add fields when they are actually needed
- **Clean up after refactoring** - When modifying code, verify all fields/variables are still in use

```typescript
// ❌ WRONG: Keeping unused fields in response
export interface ListTransactionsResponse {
    transactions: Transaction[];
    nextCursor: number | null;
    total: number; // NOT USED by any client - REMOVE IT
}

// ✅ CORRECT: Only include fields that are actually used
export interface ListTransactionsResponse {
    transactions: Transaction[];
    nextCursor: number | null;
}
```

### Variables and Code Blocks
- **Remove unused variables** - Don't assign values that are never read
- **Remove unused imports** - Clean up imports after refactoring
- **Remove unused functions** - Delete helper functions that are no longer called
- **Remove commented-out code** - Use version control instead of comments

```typescript
// ❌ WRONG: Unused variable
const total = data?.pages[0]?.total ?? 0; // Never used anywhere

// ✅ CORRECT: Only declare variables that are used
const transactions = data?.pages.flatMap((page) => page.transactions) ?? [];
```

### i18n Translation Keys
- **Remove unused translation keys** - When removing UI elements, also remove their translation keys from ALL locale files
- **Avoid orphaned translations** - Periodically audit translation files for unused keys
