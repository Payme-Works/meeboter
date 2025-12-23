# Next.js Best Practices

> **Official Docs:** https://nextjs.org/docs
> **App Router:** https://nextjs.org/docs/app
> **GitHub:** https://github.com/vercel/next.js

## Directives ("use client" / "use server")

### Understanding the Component Model

In Next.js App Router (13.4+), components are **Server Components by default**. This is a fundamental shift from the Pages Router where everything was client-side.

```
┌─────────────────────────────────────────────────────────────┐
│                     Server Components                        │
│  - Default in App Router                                    │
│  - Can fetch data directly                                  │
│  - Can access backend resources                             │
│  - Cannot use hooks or browser APIs                         │
│  - Rendered on the server, sent as HTML                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Client Components                        │
│  - Marked with "use client"                                 │
│  - Can use React hooks                                      │
│  - Can use browser APIs                                     │
│  - Can handle user interactions                             │
│  - Hydrated on the client                                   │
└─────────────────────────────────────────────────────────────┘
```

### "use client" Directive

#### When to Add "use client"

Add `"use client"` at the top of a file ONLY when:

| Scenario | Example |
|----------|---------|
| Using React hooks | `useState`, `useEffect`, `useContext`, `useRef`, `useMemo`, `useCallback` |
| Using browser APIs | `window`, `document`, `localStorage`, `sessionStorage`, `navigator` |
| Using event handlers | `onClick`, `onChange`, `onSubmit`, `onKeyDown` |
| Using client-only libraries | `motion`, `react-hook-form`, interactive `@tanstack/react-table` |
| Using `usePathname`, `useRouter`, `useSearchParams` | Next.js client hooks |

#### When NOT to Add "use client"

Do NOT add `"use client"` to:

| File Type | Reason |
|-----------|--------|
| Column definitions (`columns.tsx`) | Export configuration objects, not components |
| Type/interface files | Pure TypeScript, no runtime code |
| Utility functions | Pure functions without React |
| Constants files | Static data exports |
| Server components | Default behavior, no directive needed |
| Layout files | Unless they need interactivity |
| Page files (async) | Server components by default |

#### Common Mistakes

❌ **Adding "use client" to configuration files**
```typescript
// BAD: columns.tsx doesn't need "use client"
"use client";

export function getColumns() {
  return [{ id: "name", header: "Name" }];
}
```

❌ **Adding "use client" because you import a client component**
```typescript
// BAD: Importing client components doesn't require "use client"
"use client"; // UNNECESSARY

import { Button } from "@/components/ui/button";

export function MyComponent() {
  return <Button>Click me</Button>;
}
```

✅ **Only add when using hooks or interactivity**
```typescript
// GOOD: Has useState, needs "use client"
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### "use server" Directive

#### Server Actions

Server Actions are functions that run on the server and can be called from client components.

```typescript
// actions.ts
"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createPost(formData: FormData) {
  const title = formData.get("title") as string;

  await db.post.create({ data: { title } });

  revalidatePath("/posts");
}
```

#### Inline Server Actions

You can also define server actions inline within server components:

```typescript
// page.tsx (Server Component)
export default function Page() {
  async function handleSubmit(formData: FormData) {
    "use server";
    // This runs on the server
    await saveToDatabase(formData);
  }

  return (
    <form action={handleSubmit}>
      <input name="title" />
      <button type="submit">Submit</button>
    </form>
  );
}
```

#### When to Use Server Actions

| Use Case | Example |
|----------|---------|
| Form submissions | Creating/updating records |
| Database mutations | Insert, update, delete |
| Authentication | Sign in, sign out |
| File operations | Upload, delete files |
| Revalidation | `revalidatePath`, `revalidateTag` |

### Component Boundaries

#### The "use client" Boundary

When you mark a component with `"use client"`, it creates a boundary:

```
Server Component (page.tsx)
    │
    ├── Server Component (header.tsx)
    │
    └── "use client" boundary
        │
        └── Client Component (form.tsx)
            │
            ├── Client Component (input.tsx) ← No directive needed
            │
            └── Client Component (button.tsx) ← No directive needed
```

**Key Rules:**
1. Children of client components are also client components (no directive needed)
2. Server components can import client components
3. Client components cannot import server components directly
4. Server components can be passed as `children` to client components

#### Passing Server Components as Children

```typescript
// client-wrapper.tsx
"use client";

export function ClientWrapper({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && children} {/* Server component rendered here */}
    </div>
  );
}

// page.tsx (Server Component)
import { ClientWrapper } from "./client-wrapper";
import { ServerContent } from "./server-content";

export default function Page() {
  return (
    <ClientWrapper>
      <ServerContent /> {/* This stays a server component! */}
    </ClientWrapper>
  );
}
```

### Data Fetching Patterns

#### Server Components (Recommended)

```typescript
// page.tsx - Server Component
async function getData() {
  const res = await fetch("https://api.example.com/data");
  return res.json();
}

export default async function Page() {
  const data = await getData(); // Direct fetch, no useEffect needed

  return <div>{data.title}</div>;
}
```

#### Client Components (When Necessary)

```typescript
// client-component.tsx
"use client";

import { useQuery } from "@tanstack/react-query";

export function ClientComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ["data"],
    queryFn: () => fetch("/api/data").then(res => res.json()),
  });

  if (isLoading) return <div>Loading...</div>;
  return <div>{data.title}</div>;
}
```

### Performance Considerations

#### Minimize "use client" Scope

Push `"use client"` boundaries down as far as possible:

❌ **Bad: Large client boundary**
```typescript
// page.tsx
"use client"; // Makes entire page a client component

export default function Page() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <Header /> {/* Now client-side, could be server */}
      <Navigation /> {/* Now client-side, could be server */}
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      <Footer /> {/* Now client-side, could be server */}
    </div>
  );
}
```

✅ **Good: Minimal client boundary**
```typescript
// page.tsx (Server Component)
export default function Page() {
  return (
    <div>
      <Header /> {/* Server component */}
      <Navigation /> {/* Server component */}
      <Counter /> {/* Only this is client */}
      <Footer /> {/* Server component */}
    </div>
  );
}

// counter.tsx
"use client";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### Quick Reference

| Directive | Location | Purpose |
|-----------|----------|---------|
| `"use client"` | Top of file | Mark file as client component boundary |
| `"use server"` | Top of file | Mark all exports as server actions |
| `"use server"` | Inside function | Mark single function as server action |

| Component Type | Can Use Hooks | Can Fetch Data | Can Access Backend | Bundle Size Impact |
|----------------|---------------|----------------|-------------------|-------------------|
| Server | ❌ | ✅ Direct | ✅ | None (not shipped to client) |
| Client | ✅ | ⚠️ Via hooks | ❌ Direct | Added to JS bundle |

## Environment Variables

### No Duplication Rule

**When exposing a server env var to the client, rename it with `NEXT_PUBLIC_` prefix instead of creating a duplicate.**

```bash
# ✅ CORRECT: Rename the existing variable
NEXT_PUBLIC_DEPLOYMENT_PLATFORM=coolify

# ❌ WRONG: Creating a duplicate that references another
DEPLOYMENT_PLATFORM=coolify
NEXT_PUBLIC_DEPLOYMENT_PLATFORM=${DEPLOYMENT_PLATFORM}
```

### Why This Matters

1. **Single source of truth** - One variable, one value
2. **No synchronization issues** - Can't have mismatched values
3. **Cleaner configuration** - Fewer env vars to manage
4. **Build-time safety** - Next.js inlines `NEXT_PUBLIC_` vars at build time

### Migration Pattern

When you need to expose a server-only env var to the client:

```bash
# Before (server-only)
DEPLOYMENT_PLATFORM=coolify

# After (client-accessible)
NEXT_PUBLIC_DEPLOYMENT_PLATFORM=coolify
```

Update all server-side references to use the new name:

```typescript
// env.ts
export const env = createEnv({
  client: {
    NEXT_PUBLIC_DEPLOYMENT_PLATFORM: z.enum(["coolify", "k8s", "aws", "local"]),
  },
  // Remove from server section
});
```
