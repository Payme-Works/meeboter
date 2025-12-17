# Agent Rules

## Brainstorming Before Implementation (CRITICAL)

**ALWAYS USE THE SUPERPOWERS BRAINSTORMING SKILL BEFORE STARTING ANY TASK**

Before implementing any feature, fix, or change, you MUST use the `superpowers:brainstorming` skill:

```
Skill: superpowers:brainstorming
```

This skill guides collaborative design through:

1. **Understanding the idea** - Ask questions one at a time (prefer multiple choice) to refine requirements
2. **Exploring approaches** - Propose 2-3 different approaches with trade-offs and your recommendation
3. **Presenting the design** - Break design into 200-300 word sections, validating each before continuing
4. **Documentation** - Write validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`

**Key principles from the skill:**
- One question at a time, don't overwhelm
- Multiple choice questions preferred when possible
- YAGNI ruthlessly, remove unnecessary features
- Always explore 2-3 alternatives before settling
- Incremental validation of each design section

This applies to ALL tasks including: new features, bug fixes, refactoring, configuration changes, database migrations, and any code modifications.

## Rule Lookup Protocol (MANDATORY)

**BEFORE starting ANY task, you MUST identify and read the relevant rule files.** This is not optional. Failing to consult rules leads to inconsistent code and rework.

### How to Use This Protocol

1. **Identify task type** from the trigger list below
2. **Read the referenced rule file(s)** using the Read tool BEFORE writing any code
3. **Apply the patterns** exactly as documented
4. **When in doubt, search rules/** - Use `Glob` or `Grep` to find relevant rules

### Task-Based Rule Lookup

#### When Working on USE CASES or DOMAIN LOGIC
**Triggers**: Creating/modifying use cases, domain entities, repositories, mappers, business logic
**MUST READ**:
- [rules/DOMAIN_ENTITIES.md](rules/DOMAIN_ENTITIES.md) - Validation patterns, entity sync, repository design
- [rules/apps/mesh/LOGGING.md](rules/apps/mesh/LOGGING.md) - Audit logging in use cases (LogOptions, LogType, LogCategory)

**Search for**: `Grep pattern="use.case|entity|repository|mapper" path="rules/"`

#### When Working on AUTHENTICATION or API KEYS
**Triggers**: Auth flows, sessions, API keys, Better-Auth, OAuth, sign-in/sign-up
**MUST READ**:
- [rules/AUTHENTICATION.md](rules/AUTHENTICATION.md) - Better-Auth SDK, API key patterns, auth hooks

**Search for**: `Grep pattern="auth|api.key|session|oauth" path="rules/"`

#### When Working on REACT COMPONENTS or UI
**Triggers**: Creating components, dialogs, sheets, tables, forms, styling
**MUST READ**:
- [rules/COMPONENT_PATTERNS.md](rules/COMPONENT_PATTERNS.md) - Component organization, Sheet vs Dialog, z-index, tables
- [rules/CODE_STYLE.md](rules/CODE_STYLE.md) - JSX conventions, composition patterns, React keys
- [rules/apps/tera/COMPONENTS.md](rules/apps/tera/COMPONENTS.md) - Tera-specific patterns, table columns, TimestampHoverCard
- [rules/libraries/NEXTJS.md](rules/libraries/NEXTJS.md) - "use client"/"use server" directives, component boundaries

**Search for**: `Grep pattern="component|dialog|sheet|table|jsx" path="rules/"`

#### When Working on DATA TABLES (TanStack React Table)
**Triggers**: Creating tables, table columns, table meta, row selection, filtering, useReactTable
**MUST READ**:
- [rules/libraries/REACT_TABLE.md](rules/libraries/REACT_TABLE.md) - Table meta types, column definitions, custom filters, row selection

**Search for**: `Grep pattern="useReactTable|TableMeta|ColumnDef|react-table" path="rules/"`

#### When Working on NAMING (Interfaces, Variables, Files)
**Triggers**: Naming interfaces, types, booleans, enums, files, components
**MUST READ**:
- [rules/NAMING_CONVENTIONS.md](rules/NAMING_CONVENTIONS.md) - Request/Response vs Input/Output, boolean prefixes, dialog naming

**Search for**: `Grep pattern="naming|interface|boolean|enum" path="rules/"`

#### When Working on TESTS
**Triggers**: Writing E2E tests, unit tests, tRPC tests, browser tests
**MUST READ**:
- [rules/TESTING.md](rules/TESTING.md) - E2E patterns, Better-Auth testing, Playwright MCP

**Search for**: `Grep pattern="test|e2e|playwright|mock" path="rules/"`

#### When Working on ZOD SCHEMAS
**Triggers**: Creating Zod schemas, validation, tRPC input/output, z.enum, z.object, z.void
**MUST READ**:
- [rules/libraries/ZOD.md](rules/libraries/ZOD.md) - Zod best practices, enum validation, empty inputs, v4 migration

**Search for**: `Grep pattern="z\.|zod|schema" path="rules/"`

#### When Working on DATABASE (Prisma/MongoDB)
**Triggers**: Migrations, queries, schema changes, MongoDB operations, raw SQL queries
**MUST READ**:
- [rules/packages/database/PRISMA.md](rules/packages/database/PRISMA.md) - PostgreSQL/Prisma patterns, raw SQL queries, schema reference
- [rules/packages/database/MONGODB.md](rules/packages/database/MONGODB.md) - MongoDB patterns, migration system

**CRITICAL**: Before writing ANY raw PostgreSQL/psql queries, read the Prisma schema at `packages/database/prisma/schema.prisma` to understand table names, column names (camelCase), and relationships.

**Search for**: `Grep pattern="prisma|mongodb|migration|database" path="rules/"`

#### When Working on TENANT/ORGANIZATION Context
**Triggers**: Multi-tenancy, organization data, tenant resolution
**MUST READ**:
- [rules/apps/mesh/TENANT_CONTEXT.md](rules/apps/mesh/TENANT_CONTEXT.md) - Backend tenant resolution (**NEVER accept tenantId from frontend**)
- [rules/apps/tera/TENANT_CONTEXT.md](rules/apps/tera/TENANT_CONTEXT.md) - Frontend tenant context

**Search for**: `Grep pattern="tenant|organization|context" path="rules/"`

#### When Working on tRPC ROUTERS or PROCEDURES
**Triggers**: tRPC routers, procedures, prefetching, React Query
**MUST READ**:
- [rules/apps/tera/TRPC.md](rules/apps/tera/TRPC.md) - Server-side prefetching, infinite queries, Next.js integration

**Search for**: `Grep pattern="trpc|procedure|prefetch|query" path="rules/"`

#### When Working on ERROR HANDLING or TOAST MESSAGES
**Triggers**: Error toasts, mutation errors, backend error translation, UseCaseError
**MUST READ**:
- [rules/packages/transactional/ERROR_MESSAGES.md](rules/packages/transactional/ERROR_MESSAGES.md) - Error message i18n, useErrorMessagesTranslations hook

**Search for**: `Grep pattern="error|toast|UseCaseError|transactional" path="rules/"`

#### When DEBUGGING or INVESTIGATING ERRORS
**Triggers**: tRPC errors, console errors, unexpected behavior, tracing issues, bug investigation
**MUST READ**:
- [rules/DEBUGGING.md](rules/DEBUGGING.md) - Investigation protocol, error tracing, common patterns

**Search for**: `Grep pattern="debug|trace|investigate|error" path="rules/"`

### Quick Reference: All Rule Files

| File | When to Use |
|------|-------------|
| `rules/CODE_STYLE.md` | Formatting, JSX, conditional rendering, composition patterns, React keys |
| `rules/NAMING_CONVENTIONS.md` | Interface naming, booleans, enums, dialog/sheet naming |
| `rules/COMPONENT_PATTERNS.md` | Component organization, utilities, UI standards |
| `rules/TESTING.md` | E2E tests, tRPC testing, Playwright browser tests |
| `rules/DOMAIN_ENTITIES.md` | Entities, validation, mappers, repositories |
| `rules/AUTHENTICATION.md` | Better-Auth, API keys, OAuth, sessions |
| `rules/DEBUGGING.md` | Error investigation, tracing, debugging protocol |
| `rules/libraries/ZOD.md` | Zod best practices, enum validation, empty inputs, v4 migration |
| `rules/libraries/REACT_TABLE.md` | TanStack React Table, table meta types, column definitions, row selection |
| `rules/packages/database/PRISMA.md` | PostgreSQL/Prisma patterns, raw SQL, schema reference |
| `rules/packages/database/MONGODB.md` | MongoDB, migrations, database operations |
| `rules/apps/mesh/TENANT_CONTEXT.md` | Backend tenant resolution |
| `rules/apps/tera/TENANT_CONTEXT.md` | Frontend tenant context |
| `rules/apps/tera/TRPC.md` | tRPC prefetching, Next.js integration |
| `rules/apps/tera/COMPONENTS.md` | Table columns, TimestampHoverCard, shared components |
| `rules/libraries/NEXTJS.md` | "use client"/"use server" directives, component boundaries |
| `rules/apps/mesh/LOGGING.md` | Use case audit logging |
| `rules/packages/transactional/ERROR_MESSAGES.md` | Error message i18n, backend error translation |

### Rule Search Commands

```bash
# Find all rule files
Glob pattern="rules/**/*.md"

# Search for specific topic in rules
Grep pattern="your-topic" path="rules/"

# Find rules mentioning a specific pattern
Grep pattern="Sheet|Dialog" path="rules/" output_mode="content"
```

**Remember**: When you encounter unfamiliar patterns or are unsure about conventions, ALWAYS search the rules directory first before implementing

### Rule Maintenance (MANDATORY)

When adding, modifying, or deleting ANY rule:

1. **Search ALL rule files first** - Use `Grep pattern="topic" path="rules/"` to find all occurrences across all rule files
2. **Apply changes consistently** - If a rule exists in multiple files, update ALL of them
3. **Check for duplicates** - Before adding a new rule, search to ensure it doesn't already exist elsewhere
4. **Update cross-references** - If renaming or moving rules, update all references in other files
5. **Verify completeness** - After changes, run `Grep` again to confirm all instances were updated

```bash
# Before making rule changes, always search first
Grep pattern="your-rule-topic" path="rules/" output_mode="content"

# After changes, verify all files were updated
Grep pattern="old-pattern" path="rules/"  # Should return no matches
```

**Key principle**: Rules may be split across multiple files. ANY rule change requires searching and updating ALL relevant files to maintain consistency.

## Critical Instructions

### Turborepo Monorepo Workflow (MANDATORY)
- **Always run scripts from workspace root** - Execute all scripts using `bun` from the monorepo root directory
- **Use --filter flag for specific packages** - When targeting specific apps or packages, use `bun turbo <script> --filter=<package-name>`
- **Use turbo for workspace-wide commands** - For workspace-wide commands, use `bun turbo <script>`
- **Never navigate into package directories** - Stay in the root and use filters instead of `cd` commands
- **ALWAYS verify scripts exist in package.json first** - Before running any script, check the relevant package.json files

### Quality Assurance (MANDATORY)
- **ALWAYS run lint and typecheck after EVERY code change** - `bun run lint` and `bun run typecheck`
- **ALWAYS run unit tests after EVERY code change** - `bun run test`
- **ZERO warnings and errors policy** - Fix ALL warnings and errors before considering a task complete
- **Run build verification** - Always run `bun run build` to ensure successful compilation
- **ALWAYS test UI changes with Playwright MCP** - After ANY UI change, use Playwright MCP tools to verify the changes work correctly (see [rules/TESTING.md](rules/TESTING.md#playwright-browser-testing-mcp-mandatory))

### Development Server Management
- **NEVER start development servers automatically** - Only start servers when explicitly requested by the user

### Version Control
- **NEVER commit changes unless explicitly asked** - Only commit when explicitly asked
- **NEVER use git for reverting changes** - Always revert changes manually by editing files directly

### Docker Operations
- **Docker system cleanup** - Always run `docker system prune -f` before testing with Docker

### MongoDB Access (MANDATORY)
- **Always use mongosh CLI** - For MongoDB operations, use the `mongosh` command-line tool with proper authSource
```bash
mongosh "mongodb://mongodb:mongodb@localhost:27017/payme_works_gate?authSource=admin" --eval "db.tenants.find({}).pretty()"
```

### Prisma Database Migrations (MANDATORY)
- **NEVER manually create migration files** - Always use `bun turbo migrate:dev --filter=@gate/database -- --name <migration_name>`
- **Use --create-only** - In Claude Code or CI/CD, use `--create-only` to create migration without applying
- **Database drift requires user consent** - Get explicit user consent before running `migrate:reset`
- **Development vs production** - Database reset ONLY on local development databases

### Database Query Optimization (MANDATORY)
- **ALWAYS use `select` statements in Prisma queries** - Select only the fields you need for maximum performance
- **Avoid `include` when possible** - Use nested `select` instead of `include` to fetch only required relation fields
- **Example - Prefer this:**
  ```typescript
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      organization: {
        select: { tenantId: true },
      },
    },
  });
  ```
- **Instead of:**
  ```typescript
  const user = await prisma.user.findUnique({
    where: { id },
    include: { organization: true }, // Fetches ALL organization fields
  });
  ```

### Module Updates
- **CRITICAL: Update NestJS modules when adding new use cases** - Add new providers to the appropriate module's providers array

## Agent Behavior

- **Always work from monorepo root** - Execute all commands using `bun turbo` with `--filter` flag
- **Verify scripts before execution** - Check package.json files to confirm scripts exist
- **Read README.md files** first for product requirements
- **Research latest documentation** when working with third-party libraries
- **Proactively search the web** for solutions using WebSearch tool
- **ALWAYS prioritize WebSearch over firecrawl** - Use Claude's built-in WebSearch tool FIRST
- **NEVER use Bash for file editing or writing** - Always use Claude Code tools (Read, Edit, Write) instead of CLI commands like `sed`, `awk`, `echo >`, `cat <<EOF`, etc. for file operations

### Proactive Web Search During Investigation, Debugging, and Testing (MANDATORY)
When investigating bugs, debugging errors, or testing features, ALWAYS search the web proactively:
- **Search error messages** - Find known issues, solutions, and workarounds
- **Search before getting stuck** - If stuck for more than a few minutes, search immediately
- **Search for library-specific patterns** - Find correct usage and common pitfalls
- **Search for version-specific issues** - Include version numbers when relevant
- **Consult official library documentation** - ALWAYS check official docs, GitHub wiki, and GitHub issues/discussions for the library in question
- **Key library resources** - Better Auth (better-auth.com, GitHub wiki), tRPC (trpc.io), Prisma (prisma.io), Next.js (nextjs.org), Zod (zod.dev)
- **See detailed patterns** - [rules/DEBUGGING.md](rules/DEBUGGING.md#proactive-web-search-critical) and [rules/TESTING.md](rules/TESTING.md#proactive-web-search-during-testing-critical)

### Proactive Code Quality Enforcement (MANDATORY)
Actively scan for and fix violations of:
- Coding style guidelines (naming conventions, formatting, structure)
- Architecture patterns (repository pattern, DDD, clean architecture)
- Technology-specific best practices (Zod v4, React patterns, TypeScript standards)
- Security concerns (XSS, SQL injection, command injection)
- Performance anti-patterns and accessibility issues

### External Repository Research (MANDATORY)
When instructed to check external repositories for implementation patterns:
- **NEVER assume or guess implementations**
- **Literally iterate through repository files** using web scraping tools
- **Trace function origins** to find exact source files
- **Clone implementations exactly**, adapting only import paths and types

## Cross-Cutting Patterns (CRITICAL)

### Tenant Context Security (MANDATORY)
**NEVER accept tenantId as input from frontend. Backend ALWAYS resolves tenant from session.**

```typescript
// Backend Router - CORRECT
.mutation(async ({ input, ctx }) => {
    const result = await this.useCase.execute({
        ...input,
        tenantId: ctx.tenant.id,  // From context, NOT input
    });
});

// Input Schema - NO tenantId
export const inputSchema = z.object({
    name: z.string(),
    // NEVER: tenantId: z.string()
});

// Frontend - NO tenantId in mutations
createMutation.mutate({ name: data.name });  // No tenantId
```

**Security**: Prevents tenant ID spoofing attacks.

### tRPC Server-Side Prefetching (MANDATORY)
Always prefetch tRPC queries in async Next.js server pages:

```typescript
import { prefetch, trpc } from "@/lib/trpc/server";

export default async function Page({ searchParams }) {
    const search = searchParamsCache.parse(await searchParams);

    prefetch(trpc.logs.list.queryOptions({
        level: search.level || [],
        take: search.size,
    }));

    return <ClientComponent />;
}
```

**Benefits**: Eliminates request waterfalls, data available immediately.

### Zod v4 Essential Patterns (MANDATORY)
```typescript
// Empty inputs - use z.void()
export const myInputSchema = z.void();  // NOT z.object({})

// Enums - use z.enum()
const schema = z.enum(MyEnum);  // NOT z.nativeEnum()

// Records - specify both key and value
z.record(z.string(), z.string())  // NOT z.record(z.string())

// Email/URL - top-level functions
z.email()  // NOT z.string().email()
z.url()    // NOT z.string().url()
```

### Next.js "use client" Directive (MANDATORY)
- **Only add when needed**: hooks, browser APIs, event handlers
- **Never add to**: column definitions, type files, utilities, constants
- **Push boundaries down**: Keep as much as possible server-side

---

## General Code Standards

- Use TypeScript for all `.ts` and `.tsx` files
- Avoid inline CSS
- Don't push changes until tests pass
- Always write code in English
- **NEVER write obvious comments**, don't add comments that describe what the next line does when the code is self-explanatory (e.g., `// Clear token` before `clearToken()`). Comments should explain "why", not "what"
- **Use commas instead of hyphens in descriptions**, NEVER use em dashes or hyphens as separators in comments or descriptions
- **ALWAYS use i18n for user-facing text** - Use `useTranslations()` hook and proper translation keys
- **Use sentence case for translations** - Only capitalize first word and proper nouns
- **Use contextual error toast titles** - NEVER use generic "Error" as toast titles
- **Clean up unused i18n messages** - Remove unused keys from ALL locale files
- **ALWAYS add translations to ALL locale files** - en.json, pt-BR.json, es.json
- **Use react-hook-form + zod + shadcn** for all forms
- **SUPER IMPORTANT: NEVER use `any` type** - Use `Record<string, unknown>`, `unknown`, or specific interfaces
- **NEVER use linter suppression comments** - Fix the underlying issue instead
- **NEVER use nested ternary expressions** - Use if-else or helper functions
- **Use Prisma-generated types** instead of custom types for database operations
- **Create only necessary functions** - Avoid over-engineering
- **ALWAYS implement type-safe code** - Prioritize type safety in all implementations
- **Use ternary for conditional JSX rendering** - Use `{condition ? (<Component />) : null}` instead of `{condition && <Component />)}`. See [rules/CODE_STYLE.md](rules/CODE_STYLE.md#conditional-rendering-in-jsx)
- **CRITICAL: Blank lines before JSDoc blocks in interfaces** - Always add a blank line before multi-line JSDoc comments in interface/type definitions. See [rules/CODE_STYLE.md](rules/CODE_STYLE.md#jsdoc-comment-spacing-in-interfaces-critical)

## File Structure & Organization

- **NEVER create index.ts files for re-exports only** - Import directly from source files
- **One component per file** - Each component should have its own dedicated file
- **Documentation filenames MUST be uppercase** - All `.md` files use UPPERCASE names
- **Colocate providers with their usage**, if a provider is only used in one place, place it in a `_providers` folder next to where it's used (e.g., `app/[locale]/(protected)/_providers/`) instead of a global `src/providers` folder

## Error Handling

- **Functions should not be entirely wrapped in try-catch** - Let errors propagate to calling code
- **Use try-catch at function usage points** - Wrap individual function calls where used
- **NEVER use generic `new UseCaseError()`** - Use `TranslatableUseCaseError` for i18n
- **Use OperationFailedError for try-catch blocks** - Import from `@/application/errors/common/operation-failed-error`

## Workspace & Monorepo Configuration

### Application Ports
- **Mesh app** - Port 3333 (`http://localhost:3333`)
- **Tera app** - Port 3000 (`http://localhost:3000`)

### Next.js Navigation
- **NEVER use window.location** - Use Next.js `Link` component or `useRouter` hook
- **Use Link for navigation links** - Use `router.push()` only for programmatic navigation

### Next.js 16 Middleware (Tera App)
- **Middleware file location** - `apps/tera/src/proxy.ts` (not `middleware.ts`)
- **Public paths** - Add new public auth pages to `PUBLIC_PATHS` in `proxy.ts`

## Logging Standards

### Logger Service Integration
- **Use injected LoggerService** - Inject through constructor instead of creating `new Logger()`

### Custom Logger Requirements
LogOptions required fields:
- `action: string` - Describes the operation being logged
- `type: LogType` - USER, ADMIN, or SYSTEM
- `category: LogCategory` - FINANCIAL, USER_MANAGEMENT, SECURITY, SYSTEM_STATUS
- `performedBy?: string` - User ID who performed the action
- `affectedUserId?: string` - User ID affected (if different from performer)
- `metadata?: JsonObject` - Optional additional context

### Tenant Context Logging
- **Use protected procedures** for endpoints that need audit logging
- **Let context propagate automatically** via AsyncLocalStorage
- **Don't pass tenant context as parameters** when context is available

### Console.log Standards (Frontend/Client-Side)
- **Use file path with function name prefixes** - Format: `[file/path/to/file.ts > functionName]` (e.g., `[lib/auth/client.ts > getSession]`, `[infra/auth/better-auth/better-auth.config.ts > resolveTenant]`)
- **Use relative paths** - Paths relative to app root (apps/tera/ or apps/mesh/)
- **Always include function/method name** - After `>` separator in the prefix
- **Use sentence case** - Capitalize first word only in log messages
- **Write descriptive messages** - Describe what happened, not just function names
- **Use multi-line formatting** - For messages longer than ~80 characters
- **Use appropriate log levels** - `console.error()` for errors, `console.warn()` for warnings, `console.log()` for info
- **Never log sensitive data** - Truncate tokens, never log passwords or full credit card numbers
- **See detailed rules** - [rules/apps/mesh/LOGGING.md](rules/apps/mesh/LOGGING.md#consolelog-standards-frontendclient-side)

## Development Testing Instructions

### Manual Testing Workflow
1. **Development Servers** - NEVER start automatically, only when explicitly requested
   - Mesh app: `bun turbo dev --filter=@gate/mesh` (port 3333)
   - Tera app: `bun turbo dev --filter=@gate/tera` (port 3000)

2. **Authentication** - Use test credentials:
   - **Email**: `test@test.com`
   - **Password**: `Test@231`

### Development URLs (PRIORITIZE localhost)
- **Default (fastest)**: Use `localhost:3000` (Tera) and `localhost:3333` (Mesh)
- **Access Tera**: `http://localhost:3000`
- **Access Mesh**: `http://localhost:3333`

### Cross-Domain OAuth Configuration (Only when testing OAuth)
Only use custom domains when testing OAuth flows with different origins:
- **Frontend URL**: `http://app.payme.local:3000` (must match `NEXT_PUBLIC_APP_URL`)
- **Backend URL**: `http://api.payme.local:3333` (must match `BETTER_AUTH_URL`)
- Requires `/etc/hosts` entries:
  - `127.0.0.1 api.payme.local`
  - `127.0.0.1 app.payme.local`

## Common Commands Reference

### Quality Assurance Commands
```bash
# MANDATORY after every code change (from root)
bun run lint           # Fix ALL warnings and errors
bun run typecheck      # Fix ALL warnings and errors
bun run test           # Run all unit tests
bun run build          # Verify build success

# Docker cleanup
docker system prune -f    # Clean up before testing
```

### Turborepo Workflow Commands
```bash
# Package-specific operations
bun turbo dev --filter=@gate/mesh              # Start Mesh dev server
bun turbo dev --filter=@gate/tera              # Start Tera dev server
bun turbo test:e2e --filter=@gate/mesh         # Run Mesh E2E tests

# Workspace-wide commands
bun run lint
bun run typecheck
bun run build
```

### Port Checking
```bash
lsof -ti:3333 || echo "Mesh server not running"
lsof -ti:3000 || echo "Tera server not running"
```

## Session Completion (MANDATORY)

### Manual Testing Plan Creation
After completing all implementation tasks in a session, you MUST:

1. **Create a comprehensive testing plan** - Document all changes made and how to manually verify them
2. **Use Playwright MCP for testing** - Execute the testing plan using browser automation
3. **Verify each feature works end-to-end** - Test the full user flow, not just individual components
4. **Document test results** - Take screenshots of successful tests when relevant
5. **Report any issues found** - If tests fail, document the issue and fix before considering the session complete

### Testing Plan Format
```markdown
## Manual Testing Plan

### Changes Made
- [List all features implemented]
- [List all bug fixes]

### Test Cases
1. **Feature/Fix Name**
   - Steps to test
   - Expected result
   - Actual result: [PASS/FAIL]

2. **Feature/Fix Name**
   - Steps to test
   - Expected result
   - Actual result: [PASS/FAIL]
```

**Key principle**: No session is complete until all changes have been manually tested and verified working.
