# Testing Standards

This document contains comprehensive testing guidelines, patterns, and best practices.

## Proactive Web Search During Testing (CRITICAL)

**ALWAYS search the web proactively when testing, debugging test failures, or implementing test patterns.** Do not rely solely on assumptions or trial-and-error.

Use web search for:
- **Test failures** - Search the error message + testing framework to find solutions
- **Mocking patterns** - Search for library-specific mocking approaches (e.g., "bun test mock prisma client")
- **Framework-specific testing** - Search for testing patterns in your specific stack (e.g., "tRPC E2E testing NestJS")
- **Assertion issues** - Search for correct assertion syntax and edge cases
- **Async testing** - Search for proper async/await patterns in your testing framework

### Library Documentation for Testing (CRITICAL)

**ALWAYS consult official library documentation and resources** when implementing or debugging tests:

- **Official docs** - Most libraries have dedicated testing sections in their documentation
- **GitHub wiki** - Check for testing guides and best practices
- **GitHub issues** - Search for testing-related issues and solutions
- **Example repositories** - Many libraries provide example repos with test implementations

**Key testing resources by library:**
- **Better Auth** - Check better-auth.com docs for testing patterns, GitHub wiki for session mocking
- **tRPC** - Check trpc.io docs for caller testing patterns
- **Prisma** - Check prisma.io docs for testing with mocked clients
- **Bun Test** - Check bun.sh/docs/test for mocking and async patterns
- **Playwright** - Check playwright.dev docs for selector and interaction patterns

```bash
# Example search patterns
WebSearch query="bun test mock module not working"
WebSearch query="playwright MCP click element not found"
WebSearch query="better-auth testing session mock"
WebSearch query="tRPC caller context testing"

# Library documentation searches
WebSearch query="better-auth testing guide documentation"
WebSearch query="tRPC testing createCaller docs"
WebSearch query="bun test mock prisma client example"
WebSearch query="playwright locator best practices docs"
```

**Key principle**: If a test is failing unexpectedly or you're unsure about the testing approach, search the web first. Always check official library documentation and GitHub resources.

## E2E Test Structure

- **Follow established patterns** - Use existing e2e tests as reference (e.g., `openapi.controller.e2e-spec.ts`)
- **Comprehensive test coverage** - Include positive cases, negative cases, error scenarios, and edge cases
- **File naming convention** - Use `*.e2e-spec.ts` for e2e test files

## E2E Test Patterns

```typescript
import { describe, beforeAll, it, mock } from "bun:test";

describe("ControllerName (E2E)", () => {
    let sut: ControllerName;
    let app: INestApplication;
    let mockService: { method: ReturnType<typeof mock> };

    beforeAll(async () => {
        // Setup test module with mocks
        const moduleFixture = await Test.createTestingModule({
            controllers: [ControllerName],
            providers: [
                { provide: ServiceName, useValue: mockService },
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
        sut = moduleFixture.get<ControllerName>(ControllerName);
    });

    describe("HTTP endpoint tests", () => {
        it("should handle success case", async () => {
            // Test implementation
        });

        it("should handle error cases", async () => {
            // Error scenario testing
        });
    });
});
```

## Mock Setup Guidelines

- **Comprehensive mocking** - Mock all dependencies with proper TypeScript types
- **Realistic test data** - Use realistic mock data that matches actual domain entities
- **Verification patterns** - Verify mock calls with `toHaveBeenCalledWith()` for important interactions
- **Error simulation** - Test error scenarios by mocking service failures

## Test Coverage Requirements

- **HTTP status codes** - Test success (200), client errors (400, 401, 404), and server errors (500)
- **Request validation** - Test invalid payloads, missing parameters, and malformed data
- **Business logic paths** - Cover all conditional branches and business rules
- **Integration points** - Verify interactions with repositories, external services, and message queues

## tRPC E2E Testing with Better-Auth

### Real Authentication Pattern (Preferred)
For tRPC router E2E tests that require authentication, use real Better-Auth authentication instead of mocking:

```typescript
// ✅ CORRECT: Real authentication approach
const createUserResponse = await authService.api.createUser({
    body: {
        email: "test@example.com",
        password: "TestPassword123!",
        name: "Test User",
    },
});

const session = await authService.api.signInEmail({
    body: {
        email: createUserResponse.user.email,
        password: "TestPassword123!",
    },
    returnHeaders: true,
});

// Create authenticated caller with real session cookies
const authenticatedCaller = sut.router.createCaller({
    req: {
        headers: {
            cookie: session.headers.get("set-cookie"),
        },
    } as CreateExpressContextOptions["req"],
});

const result = await authenticatedCaller.someEndpoint(input);
```

### Authentication Testing Best Practices
- **Use real Better-Auth flows** - Create users and sign in through actual API calls
- **Real session cookies** - Use actual session cookies from `signInEmail()` with `returnHeaders: true`
- **No mocking required** - The tRPC middleware will process real authentication headers naturally
- **Test script usage** - Always use `bun turbo test:e2e --filter=@gate/mesh` for E2E tests
- **Provider response flexibility** - Some fields like `description` and `webhookUrl` may be `undefined` depending on bank provider implementation

### Response Assertion Patterns
Handle optional fields that may vary based on bank provider responses:

```typescript
// Handle optional fields gracefully
if (result.description !== undefined) {
    expect(result.description).toBeTypeOf("string");
}

if (result.webhookUrl !== undefined) {
    expect(result.webhookUrl).toBeTypeOf("string");
}

// Decimal precision may vary
expect(result.amount).toBe("100.5"); // Not "100.50"
```

### Test Module Setup for tRPC
```typescript
describe("RouterName (E2E)", () => {
    let sut: RouterName;
    let app: INestApplication;
    let authService: AuthService<typeof auth>;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    envFilePath: ".env.test.local",
                    isGlobal: true,
                }),
                AuthModule,
                PrismaModule,
                BankModule,
            ],
            providers: [
                TrpcService,
                RouterName,
                // Real repository implementations, not mocks
                { provide: Repository, useClass: PrismaRepository },
            ],
        }).compile();

        app = moduleRef.createNestApplication({
            bodyParser: false, // Required for Better Auth
        });

        app.enableShutdownHooks();
        await app.init();

        sut = moduleRef.get<RouterName>(RouterName);
        authService = moduleRef.get<AuthService<typeof auth>>(AuthService);
    });
});
```

### Legacy Mocking Pattern (Avoid)
```typescript
// ❌ WRONG: Don't use mocking approach for tRPC authentication
mock.module("@/infra/auth", () => ({
    getSession: () => mockSessionData,
}));
```

**Why real authentication is better:**
- ✅ Tests actual authentication middleware behavior
- ✅ No complex mock setup or cleanup required
- ✅ More realistic E2E testing approach
- ✅ Validates the complete authentication flow
- ✅ Eliminates authentication-specific test failures

## Playwright Browser Testing (MCP) (MANDATORY)

Use Playwright MCP tools for end-to-end browser testing of user flows and navigation. This is essential for testing authentication flows, cross-domain interactions, and complete user journeys.

### CRITICAL: Verify Dev Servers Are Running Before Testing

**ALWAYS check that the required development servers are running before testing with Playwright.** Testing against servers that aren't running wastes time with connection errors.

**Server check commands:**
```bash
# Check if Tera (frontend) is running on port 3000
lsof -ti:3000 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "Tera not running"

# Check if Mesh (backend) is running on port 3333
lsof -ti:3333 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/health || echo "Mesh not running"
```

**If servers are not running, start them:**
```bash
# Start Tera (frontend) - port 3000
bun turbo dev --filter=@gate/tera

# Start Mesh (backend) - port 3333
bun turbo dev --filter=@gate/mesh
```

**When to start which server:**
- **UI-only testing** (components, styling, layout): Start Tera only
- **Full flow testing** (auth, API calls, data): Start both Tera AND Mesh
- **Admin pages** (organizations, bank providers): Start both Tera AND Mesh

**Wait for server readiness:**
- After starting a server, wait 15-20 seconds for Next.js/NestJS to compile
- Verify with a curl health check before navigating with Playwright

### CRITICAL: Always Test UI Changes with Playwright
**After making ANY UI changes, features, or fixes, you MUST test them using Playwright MCP tools before considering the task complete.** This includes:
- Component changes (styling, layout, responsiveness)
- New features (dialogs, sheets, forms, tables)
- Bug fixes (visual issues, interaction bugs)
- Responsive behavior (test on both mobile and desktop viewports)

**Testing workflow:**
1. Make the code changes
2. Use `mcp__playwright__browser_resize()` to set appropriate viewport (mobile: 375x667, desktop: 1280x800)
3. Navigate to the affected page/component
4. Use `mcp__playwright__browser_snapshot()` to verify the UI state
5. Interact with elements to verify functionality
6. Take screenshots if visual verification is needed

### When to Use Playwright Testing
- **Authentication flows** - Sign in, sign up, sign out, OAuth flows
- **Protected route access** - Verify redirects when unauthenticated
- **Navigation flows** - Test sidebar navigation, page transitions
- **Cross-domain auth** - Test token exchange and session management
- **Form submissions** - Test form validation and submission flows
- **UI state changes** - Verify loading states, error messages, success notifications
- **Component changes** - Any visual or interactive UI modifications
- **Responsive design** - Test on multiple viewport sizes

### Playwright MCP Tools Reference
```typescript
// Navigation
mcp__playwright__browser_navigate({ url: "http://localhost:3000" })
mcp__playwright__browser_navigate_back()

// Page interaction
mcp__playwright__browser_snapshot()  // Get accessibility tree (preferred over screenshot)
mcp__playwright__browser_click({ element: "description", ref: "element-ref" })
mcp__playwright__browser_type({ element: "description", ref: "element-ref", text: "input text" })
mcp__playwright__browser_fill_form({ fields: [...] })

// State inspection
mcp__playwright__browser_console_messages()
mcp__playwright__browser_network_requests()

// Waiting
mcp__playwright__browser_wait_for({ text: "Expected text" })
mcp__playwright__browser_wait_for({ time: 2 })  // Wait 2 seconds

// Tab management
mcp__playwright__browser_tabs({ action: "list" })
mcp__playwright__browser_close()
```

### Authentication Flow Testing Pattern
```typescript
// 1. Navigate to app
await mcp__playwright__browser_navigate({ url: "http://localhost:3000" });

// 2. Get page snapshot to find element refs
const snapshot = await mcp__playwright__browser_snapshot();

// 3. If logged in, sign out first
await mcp__playwright__browser_click({ element: "User menu", ref: "U45" });
await mcp__playwright__browser_click({ element: "Sign out button", ref: "S67" });

// 4. Navigate to sign-in
await mcp__playwright__browser_navigate({ url: "http://localhost:3000/auth/sign-in" });

// 5. Fill credentials
await mcp__playwright__browser_type({
    element: "Email input",
    ref: "E12",
    text: "test@test.com"
});
await mcp__playwright__browser_type({
    element: "Password input",
    ref: "P34",
    text: "Test@231",
    submit: true
});

// 6. Wait for redirect and verify
await mcp__playwright__browser_wait_for({ text: "Dashboard" });
```

### Test Credentials
Always use the standard test credentials for consistency:
- **Email**: `test@test.com`
- **Password**: `Test@231`

### Best Practices
- **Use snapshots over screenshots** - `browser_snapshot()` provides structured accessibility data
- **Wait for elements** - Use `browser_wait_for()` instead of arbitrary delays
- **Check console errors** - Use `browser_console_messages({ onlyErrors: true })` to catch issues
- **Clean state between tests** - Clear cookies/storage when testing auth flows
- **Verify both success and error states** - Test what happens with invalid credentials
- **Test across locales** - If i18n is enabled, test with different locale prefixes
- **Delete screenshots after analysis** - When using `browser_take_screenshot()`, delete the image file after analyzing it to avoid cluttering the `.playwright-mcp` directory
- **NEVER close the browser after tests** - Keep the browser open for the user to inspect or continue testing manually. Do NOT call `mcp__playwright__browser_close()` after completing tests

### Playwright Testing URLs

**General UI Testing (preferred):**
- **Frontend URL**: `http://localhost:3000`
- **Backend URL**: `http://localhost:3333`
- Next.js hot reload (HMR) works reliably with localhost
- Use for component testing, form validation, navigation, etc.

**OAuth/Authentication Testing:**
- **Frontend URL**: `http://app.payme.local:3000` (must match `NEXT_PUBLIC_APP_URL`)
- **Backend URL**: `http://api.payme.local:3333` (must match `BETTER_AUTH_URL`)
- Required for OAuth flows where URLs must match env configuration

### Clearing Browser Storage for Fresh Start (CRITICAL)

**When experiencing 401 Unauthorized errors or stale session issues**, clear browser storage and cookies to start fresh:

```typescript
// Clear all browser storage using Playwright evaluate
await mcp__playwright__browser_evaluate({
    function: "async () => { localStorage.clear(); sessionStorage.clear(); document.cookie.split(';').forEach(c => document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')); return 'Storage cleared'; }"
});

// Then navigate to sign-in page to re-authenticate
await mcp__playwright__browser_navigate({ url: "http://localhost:3000/en/sign-in" });
```

**When to clear storage:**
- After restarting dev servers (sessions may be invalidated)
- When seeing 401 errors on tRPC calls
- When auth state appears stale or inconsistent
- After switching between localhost and payme.local domains

### Known Issues
- **Next.js dev overlay** - May intercept clicks, use `browser_press_key({ key: "Escape" })` to dismiss
- **WebSocket HMR errors** - WebSocket connection errors in cross-domain dev setup are expected and don't affect functionality
