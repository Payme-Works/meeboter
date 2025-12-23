# Naming Conventions

This document contains all naming convention rules for the codebase.

## Avoid Redundant Type Suffixes in Variable Names

When the type is documented in JSDoc or TypeScript annotations, don't repeat the type in the variable name. Let the documentation speak for itself.

```typescript
// ✅ CORRECT: JSDoc already says "in seconds", so use simple name
/**
 * Interval in seconds between session refresh calls.
 */
interval?: number;

// ❌ WRONG: Redundant, the JSDoc already documents the unit
/**
 * Interval in seconds between session refresh calls.
 */
intervalSeconds?: number;

// ✅ CORRECT: Simple names when type/unit is documented
/**
 * Timeout in milliseconds for API requests.
 */
timeout?: number;

// ❌ WRONG: Redundant suffix
/**
 * Timeout in milliseconds for API requests.
 */
timeoutMs?: number;
```

## Avoid Redundant Suffixes

- **NEVER use "Details", "Info", "Data", "Response", or "List" suffixes** for variables, types, props, interfaces, or function names
- **These suffixes add noise without clarity** - They don't convey meaningful information about what the variable contains
- **Use simple, descriptive names** - The name itself should indicate what it represents

### Acceptable Exceptions

The following uses of "Data", "Info", or "Details" are acceptable:

| Pattern | Example | Reason |
|---------|---------|--------|
| Form data types | `QuickBotFormData` | Represents form data shape with Zod inference |
| Browser FormData | `new FormData()` | Web API class |
| Database payload schemas | `EventData`, `ScreenshotData` | Zod schemas for JSON column payloads |
| Third-party APIs | `keepPreviousData`, `serializeData` | Library method names |
| TypeScript generics | `TData`, `TValue` | Standard generic naming convention |
| Raw response parsing | `const errorData = JSON.parse(...)` | Temporary variable for raw parsed data |
| Component compound names | `DataTable` | Generic reusable component (but prefer domain-specific names) |

### Violations and Fixes

```typescript
// ─── Interfaces/Types ─────────────────────────────────────────────────────────

// ❌ WRONG: Unnecessary suffixes
interface PlatformDetails { ... }     // → Platform
interface PlatformInfo { ... }        // → Platform
interface MeetingInfo { ... }         // → Meeting
interface UserSubscriptionInfo { ... } // → UserSubscription
interface KubernetesJobDetails { ... } // → KubernetesJob

// ✅ CORRECT: Simple, descriptive names
interface Platform { ... }
interface Meeting { ... }
interface UserSubscription { ... }
interface KubernetesJob { ... }

// ─── Variables ────────────────────────────────────────────────────────────────

// ❌ WRONG: Unnecessary suffixes
const platformDetails = ...;    // → platform
const platformInfo = ...;       // → platform
const subscriptionInfo = ...;   // → subscription
const botsData = ...;           // → bots
const botsResponse = ...;       // → bots
const botsList = ...;           // → bots

// ✅ CORRECT: Simple names
const platform = platformQuery.data;
const subscription = await getUserSubscription(db, userId);
const { data } = api.bots.getBots.useQuery();
const bots = data?.data ?? [];

// ─── Functions/Methods ────────────────────────────────────────────────────────

// ❌ WRONG: "Details" or "Info" in function names
function getJobDetails(jobName: string) { ... }     // → getJob
function getUserSubscriptionInfo(userId: string) { ... } // → getUserSubscription

// ✅ CORRECT: Simple verb + noun
async function getJob(jobName: string) { ... }
async function getUserSubscription(userId: string) { ... }

// ─── React Hooks ──────────────────────────────────────────────────────────────

// ❌ WRONG: "Data" suffix in custom hooks
function useInfrastructureData() { ... }  // → useInfrastructure
function useBotData() { ... }             // → useBot

// ✅ CORRECT: Simple hook names
function useInfrastructure() { ... }
function useBot() { ... }

// ─── Components ───────────────────────────────────────────────────────────────

// ❌ WRONG: Unnecessary suffixes in component names
function PlatformDetailsSection({ details }) { ... }  // → PlatformSection
function PlatformInfoCard({ info }) { ... }           // → PlatformCard

// ✅ CORRECT: Simple component names
function PlatformSection({ platform }) { ... }
function PlatformMetrics({ metrics }) { ... }
```

### Quick Reference: Common Renames

| Before | After |
|--------|-------|
| `platformDetails` | `platform` |
| `platformInfo` | `platform` |
| `platformData` | `platform` |
| `platformResponse` | `platform` |
| `userInfo` | `user` or `profile` |
| `subscriptionInfo` | `subscription` |
| `botsData` | `bots` |
| `botsResponse` | `bots` |
| `botsList` | `bots` |
| `templatesResponse` | `templates` |
| `templatesList` | `templates` |
| `MeetingInfo` | `Meeting` |
| `meetingInfo` | `meeting` |
| `getJobDetails()` | `getJob()` |
| `getUserSubscriptionInfo()` | `getUserSubscription()` |
| `useInfrastructureData()` | `useInfrastructure()` |
| `KubernetesJobDetails` | `KubernetesJob` |
| `UserSubscriptionInfo` | `UserSubscription` |
| `} catch (error) { const errorObj = ...` | `} catch (err) { const error = ...` |
| `errorMessage` | inline `error.message` |

## Error Variable Naming

When catching errors, use `err` for the raw caught value and `error` for the normalized Error object:

```typescript
// ✅ CORRECT: catch as err, normalize to error
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));

  this.logger.error("Operation failed", error, {
    isTimeout: error.message.includes("timeout"),
    isNotFound: error.message.includes("ENOENT"),
  });
}

// ❌ WRONG: Redundant suffixes
} catch (error) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorMessage = errorObj.message;  // Unnecessary intermediate variable

  this.logger.error("Operation failed", errorObj, {
    isTimeout: errorMessage.includes("timeout"),
  });
}
```

**Key points:**
- Catch as `err` (the raw unknown value)
- Normalize to `error` (the guaranteed Error object)
- Inline `error.message` instead of creating a separate variable
- Only create intermediate variables when the value is used 3+ times

## Interface Naming: Request/Response vs Input/Output

- **Use cases use Request/Response suffixes** - Domain use case interfaces must use `Request` and `Response` suffixes (e.g., `GetLogsRequest`, `GetLogsResponse`)
- **tRPC schemas use Input/Output suffixes** - tRPC Zod schemas and their inferred types must use `Input` and `Output` suffixes (e.g., `listLogsInputSchema`, `listLogsOutputSchema`)
- **tRPC RouterOutputs type aliases use Output suffix** - When creating type aliases from `RouterOutputs`, use the `Output` suffix (e.g., `PlatformOutput`, `ActivityStatsOutput`)
- **Clear separation of concerns** - This distinction makes it immediately clear whether you're working with domain layer (use cases) or infrastructure layer (tRPC/API)

```typescript
// ✅ CORRECT: Use case interfaces (domain layer)
export interface GetLogsRequest {
  tenantId: string;
  level?: LogLevel[];
}

export interface GetLogsResponse {
  data: Log[];
  meta: MetaData;
}

// ✅ CORRECT: tRPC schemas (infrastructure layer)
export const listLogsInputSchema = z.object({ ... });
export const listLogsOutputSchema = z.object({ ... });
export type ListLogsInput = z.infer<typeof listLogsInputSchema>;
export type ListLogsOutput = z.infer<typeof listLogsOutputSchema>;

// ✅ CORRECT: tRPC RouterOutputs type aliases
type RouterOutputs = inferRouterOutputs<AppRouter>;
type PlatformOutput = RouterOutputs["infrastructure"]["getPlatform"];
type ActivityStatsOutput = RouterOutputs["infrastructure"]["getActivityStats"];

// ❌ WRONG: Using Request/Response for tRPC schemas
export const listLogsRequestSchema = z.object({ ... }); // Should be Input

// ❌ WRONG: Using Input/Output for use case interfaces
export interface GetLogsInput { ... } // Should be Request

// ❌ WRONG: Using Data/Response suffix for tRPC RouterOutputs
type PlatformData = RouterOutputs["infrastructure"]["getPlatform"]; // Should be Output
type PlatformResponse = RouterOutputs["infrastructure"]["getPlatform"]; // Should be Output
```

### tRPC Query Result Variable Naming

When destructuring tRPC query results, use simple entity names:

```typescript
// ✅ CORRECT: Simple entity names for query results
const { data } = api.bots.getBots.useQuery();
const bots = data?.data ?? [];

const { data: subscription } = api.subscriptions.get.useQuery();
const { data: platform } = api.infrastructure.getPlatform.useQuery();
const { data: templates } = api.chat.getMessageTemplates.useQuery();
const { data: apiKeys } = api.apiKeys.list.useQuery();

// ❌ WRONG: Using suffixes like "Data", "Response", "List"
const { data: botsData } = ...;           // → use data, then extract
const { data: botsResponse } = ...;       // → use data, then extract
const botsList = data?.data ?? [];        // → bots

// ✅ ALSO CORRECT: Using the query object directly when you need refetch
const platformQuery = api.infrastructure.getPlatform.useQuery();
const platform = platformQuery.data;
await platformQuery.refetch();
```

**Parameter naming must match interface suffix:**
- **Use cases** - Parameter name must be `request` when using `Request` suffix
- **tRPC procedures** - Parameter name must be `input` when using `Input` suffix

```typescript
// ✅ CORRECT: Use case with 'request' parameter
export class GetLogs {
  async execute(request: GetLogsRequest): Promise<GetLogsResponse> {
    // Use request.field throughout the method
  }
}

// ✅ CORRECT: tRPC procedure with 'input' parameter
router = {
  list: procedure.input(schema).query(async ({ input }) => {
    // Use input.field throughout the handler
  }),
};
```

## Constructor Parameter Ordering and Service Naming

- **Remove "Service" suffix from injected dependencies** - Use shorter names without the "Service" suffix (e.g., `bank` instead of `bankService`)
- **Exception for clarity** - Keep the "Service" suffix for services that might be ambiguous (e.g., `logger: LoggerService`, `tenantContext: TenantContextService`)
- **Group services before repositories** - In constructor dependency injection, group services first, then repositories

```typescript
// ✅ CORRECT: Services first with clean names, then repositories
constructor(
  private readonly bank: BankService,
  private readonly webhooks: WebhooksService,
  private readonly logger: LoggerService,
  private readonly tenantContext: TenantContextService,

  private readonly payinsRepository: PayinsRepository,
  private readonly payoutsRepository: PayoutsRepository,
) {}

// ❌ WRONG: Services mixed with repositories, verbose naming
constructor(
  private readonly bankService: BankService,
  private readonly payinsRepository: PayinsRepository,
  private readonly webhookService: WebhooksService,
) {}
```

## Boolean Naming Convention

**ALWAYS use descriptive prefixes for boolean fields** - Boolean fields, props, variables, and parameters must have prefixes like `is`, `has`, `should`, `can`, `will`, or similar that clearly indicate they are boolean values.

```typescript
// ✅ CORRECT: Proper boolean naming
const hasBalance = balanceNumber > 0;
const isPositiveTrend = Number.parseFloat(balanceTrend) >= 0;
const canDelete = !hasBalance && userHasPermission;
const shouldRender = isVisible && !isLoading;

interface WalletProps {
  hasBalance: boolean;
  isActive: boolean;
  canEdit: boolean;
}

// ❌ WRONG: Missing descriptive prefix
const balance = balanceNumber > 0; // Unclear this is boolean
const positiveTrend = Number.parseFloat(balanceTrend) >= 0;

interface WalletProps {
  balance: boolean; // Ambiguous - looks like a number
  active: boolean; // Less clear than isActive
}
```

## Enum Naming Convention

**ALWAYS use UPPERCASE for enum values and keys** - All enum values must be in UPPERCASE format. This applies to:
- TypeScript enums and const objects
- API response status values
- URL query parameters for status/enum values
- Database enum columns

```typescript
// ✅ CORRECT: UPPERCASE enum values
export const ThemeVariableType = {
  COLOR: "COLOR",
  DIMENSION: "DIMENSION",
  NUMBER: "NUMBER",
  TEXT: "TEXT",
} as const;

// ✅ CORRECT: Status types in API responses
type SlotStatus = "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
type JobStatus = "PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED";

// ✅ CORRECT: URL params match enum values
// ?status=ACTIVE&status=PENDING

// ❌ WRONG: lowercase or mixed case
export const ThemeVariableType = {
  color: "color",
  Dimension: "dimension",
} as const;

// ❌ WRONG: lowercase status types
type SlotStatus = "idle" | "deploying" | "healthy" | "error";
// ?status=active  ← Should be ACTIVE
```

## Raw Prefix Naming Convention

**ALWAYS use "raw" as a prefix, never in the middle or as a suffix** - When naming variables that hold raw/unmapped database objects, "raw" must always come first.

```typescript
// ✅ CORRECT: "raw" as prefix
const rawUser = await this.prisma.user.findUnique({ where: { id } });
const rawUpdatedUser = await this.prisma.user.update({ where: { id }, data });
const rawExistingRules = rawFeeRules.filter(rule => rule !== null);
const rawExpectedLog: RawLog = { ... };

// ❌ WRONG: "raw" in the middle or as suffix
const updatedRawUser = await this.prisma.user.update({ where: { id }, data });
const existingRawRules = rawFeeRules.filter(rule => rule !== null);
const walletRaw = await this.prisma.wallet.findUnique({ where: { id } });
```

**Why this matters:**
- **Consistency** - All raw database objects follow the same naming pattern
- **Readability** - Easy to identify raw objects at a glance when they all start with "raw"
- **Code search** - Searching for "raw" at the start of variable names finds all raw database objects

## Financial Field Naming Standards

- **Use "grossAmount" for transaction amounts** - The main transaction amount should be named `grossAmount` to distinguish from net amounts
- **Consistent field naming across layers** - Ensure field names match between Prisma schema, domain entities, database mappers, input/output DTOs, and API interfaces

## Descriptive Component Names

- **ALWAYS use descriptive, context-specific component names** - Component names must clearly indicate their purpose and content
- **Avoid generic names** - Never use generic names like `DataTable`, `List`, `Form`, `Dialog` as the primary component name
- **Context-specific naming** - Include the domain/feature in the component name

**Examples:**
- ✅ CORRECT: `FeeRulesTable`, `ApiKeysTable`, `BankProvidersTable`
- ❌ WRONG: `DataTable`, `Table`, `List`
- ✅ CORRECT: `CreateApiKeyDialog`, `DeleteWalletDialog`
- ❌ WRONG: `Dialog`, `Modal`
- ✅ CORRECT: `PayinForm`, `OrganizationSettingsForm`
- ❌ WRONG: `Form`, `CreateForm`

## Dialog and Sheet Naming Conventions

### Action Dialogs/Sheets (CRUD Operations)
Components that perform create, edit, delete, or other actions use action-first naming:

**Pattern**: `{Action}{Entity}{Type}`

**Examples:**
- ✅ CORRECT: `CreateApiKeyDialog`, `EditWalletDialog`, `DeleteBankProviderDialog`
- ✅ CORRECT: `CreateBankProviderSheet`, `EditBankProviderSheet`, `CreatePayinSheet`
- ❌ WRONG: `ApiKeyCreateDialog`, `WalletEditDialog`, `BankProviderDeleteDialog`

**File naming**: Use kebab-case matching the component name
- ✅ `create-api-key-dialog.tsx`, `edit-wallet-dialog.tsx`
- ❌ `api-key-create-dialog.tsx`, `wallet-edit-dialog.tsx`

### State/Result Dialogs (Success, Completion, Error)
Components that display results or state use state-suffix naming with past tense:

**Pattern**: `{Entity}{PastTenseAction}{Type}`

**Examples:**
- ✅ CORRECT: `PayinCreatedDialog`, `ApiKeyDeletedDialog`, `TransactionCompletedDialog`
- ❌ WRONG: `PayinSuccessDialog`, `ApiKeySuccessDialog`

**File naming**: Use kebab-case with past tense
- ✅ `payin-created-dialog.tsx`, `api-key-deleted-dialog.tsx`
- ❌ `payin-success-dialog.tsx`, `api-key-success-dialog.tsx`

### View/Inspect Components

Components for viewing entity information use simple `{Entity}{Type}` naming without "Details" suffix:

**Pattern**: `{Entity}{Type}`

**Examples:**
- ✅ CORRECT: `BotDialog`, `TransactionSheet`, `UserSheet`, `WalletDialog`
- ❌ WRONG: `BotDetailsDialog`, `TransactionDetailsSheet`, `UserDetailsSheet`

The "Details" suffix adds no value - if you're opening a dialog for a bot, it's obviously to view the bot's information.

### Summary
- **Action dialogs/sheets**: Action comes FIRST (Create, Edit, Delete)
- **State dialogs**: Use past tense suffix (Created, Deleted, Updated)
- **View components**: Simple `{Entity}{Type}` (no "Details" suffix)
- **File names**: Match component name in kebab-case
- **Props interfaces**: Match component name + Props
- **Translation keys**: Match component naming pattern
