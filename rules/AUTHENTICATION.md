# Authentication Guidelines

This document contains Better-Auth SDK usage patterns, API key implementation, and authentication best practices.

## Better Auth SDK Usage (MANDATORY)

- **ALWAYS prefer Better Auth SDK methods over custom implementations** - Never create custom endpoints or database queries for functionality that Better Auth already provides. Use the SDK's built-in methods (e.g., `organization.setActive()`, `organization.list()`, `getSession()`) instead of writing custom code.
- **Use SDK plugins and their methods** - Better Auth has plugins for organizations, API keys, JWT, one-time tokens, etc. Always use the plugin methods rather than creating custom solutions.
- **Cross-domain SSR uses customFetchImpl** - For SSR with cross-domain authentication, configure `customFetchImpl` in the auth client to inject Bearer tokens from cookies. This allows SDK methods to work server-side.
- **Check Better Auth documentation first** - Before implementing any auth-related feature, search Better Auth documentation for existing solutions.

**Example of correct usage:**
```typescript
// ✅ CORRECT: Use SDK method
await auth.organization.setActive({ organizationSlug: "my-org" });

// ❌ WRONG: Custom endpoint/database query
await fetch("/api/custom-activate-org", { body: { slug: "my-org" } });
await prisma.session.update({ data: { activeOrganizationId: orgId } });
```

## Better Auth API Keys Implementation

- **Rate limiting configuration** - Always set specific rate limits (e.g., 2 requests per second: `timeWindow: 1000, maxRequests: 2`)
- **Permission-based access control** - Define explicit permissions for specific operations only (payins, payouts), avoid broad permissions like "users"
- **AuthService over client** - Use `AuthService<typeof auth>` with `fromNodeHeaders()` for proper request context in NestJS
- **No mocking in E2E tests** - Use real AuthService integration with proper test configuration instead of mocks
- **Zod v4 compatibility** - Use `z.record(z.string(), z.array(z.string()))` format with explicit key and value types
- **Direct API response handling** - Return API responses directly without additional transformation layers
- **Shared schema patterns** - Use shared Zod schemas matching Better Auth API response structure exactly
- **Union types for complex responses** - Use Zod unions for endpoints that return different response types (like verify endpoint)
- **Proper error propagation** - Let Better Auth handle authentication errors naturally without wrapping

### API Key Plugin Configuration
```typescript
import { apiKey } from "better-auth/plugins";

apiKey({
    enableMetadata: true,
    apiKeyHeaders: ["x-api-key", "authorization"],
    rateLimit: {
        enabled: true,
        timeWindow: 1000, // 1 second
        maxRequests: 2, // 2 requests per second
    },
    permissions: {
        defaultPermissions: {
            payins: ["read", "write"],
            payouts: ["read", "write"],
            // Do not include "users" or other broad permissions
        },
    },
})
```

### tRPC Router Pattern for API Keys
```typescript
@Injectable()
export class UsersApiKeysRouter {
    constructor(
        private readonly trpc: TrpcService,
        private readonly authService: AuthService<typeof auth>,
    ) {}

    // Use shared schema matching Better Auth API response
    const apiKeySchema = z.object({
        permissions: z.record(z.string(), z.array(z.string())).nullable().optional(),
        id: z.string(),
        name: z.string().nullable(),
        // ... other fields matching API response exactly
    });

    // Return API responses directly
    .mutation(async ({ input, ctx }) => {
        const headers = ctx.req ? fromNodeHeaders(ctx.req.headers) : {};
        const result = await this.authService.api.createApiKey({
            body: input,
            headers,
        });
        return result; // Direct return, no transformation
    })
}
```

### Client-Side API Key Management
- **Server-side data fetching** - Use server components for initial API key data fetching with Better Auth session validation
- **Client component for UI** - Create separate client components for interactive API key management (create, show, delete)
- **Authentication state handling** - Check authentication status in server components before rendering API key management
- **Mixed component pattern** - Keep pages as server components while using client components for interactive elements
- **Error boundary patterns** - Implement proper error handling for API key operations
- **Real-time updates** - Use tRPC mutations with optimistic updates for better UX

## Better-Auth Client Integration

- **Install better-auth** for authentication: `bun add better-auth`
- **Create auth client** in `/lib/auth-client.ts`:
```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3333", // Mesh app URL
});
```
- **Use auth hooks** in components: `authClient.useSession()`, `authClient.signIn.social()`, `authClient.signOut()`
- **Handle authentication states** with loading, error, and success states
- **Social providers** - Support GitHub, Google, and other OAuth providers
- **Error handling** - Use proper error boundaries and user feedback

## Authentication Lifecycle

- **Use better-auth hooks** for lifecycle events (registration, password reset, etc.)
- **Send emails in after hooks** to ensure they only trigger after successful operations
- **Include proper error handling** for authentication-related email sending
- **Use appropriate email types** for authentication emails (`EmailType.AUTH`)

## Email System Integration

- **Use email templates** for all user communications instead of inline HTML
- **Use appropriate email types** (`EmailType.AUTH`, `EmailType.NOTIFICATIONS`, etc.) to ensure proper sender addresses
- **Include proper error handling** for email sending operations with console logging
- **Use white-label configuration** to ensure emails match the brand/domain
- **Send registration emails immediately** after successful user registration in authentication hooks
