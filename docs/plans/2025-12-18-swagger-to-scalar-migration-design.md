# Swagger to Scalar Migration Design

**Date:** 2025-12-18
**Status:** Approved

## Problem

The `swagger-ui-react` library causes Next.js build failures during static page generation. The library internally imports `<Html>` from `next/document`, which is not allowed outside of `pages/_document`. Despite multiple workarounds (dynamic imports, SSR disabled, force-dynamic, webpack externals), the Docker build fails with:

```
Error: <Html> should not be imported outside of pages/_document.
```

## Solution

Replace `swagger-ui-react` with Scalar, served as a standalone HTML page that loads from CDN. This completely decouples API documentation from the Next.js build process.

## Architecture

```
/api/openapi.json     → API route returning OpenAPI spec (generated from tRPC)
/docs                 → Route handler serving static HTML that loads Scalar from CDN
```

### Key Benefits

- Zero impact on Next.js build process
- No new npm dependencies (Scalar loads from CDN)
- OpenAPI spec stays in sync with tRPC router automatically
- Scalar has modern UX, better than Swagger UI
- Smaller bundle size

## Implementation

### 1. OpenAPI JSON Endpoint

**File:** `apps/server/src/app/api/openapi.json/route.ts`

```typescript
import { openApiDocument } from "@/lib/swagger";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(openApiDocument);
}
```

### 2. Scalar HTML Route Handler

**File:** `apps/server/src/app/docs/route.ts`

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Meeboter API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
```

### 3. Cleanup

**Files to delete:**
- `apps/server/src/app/docs/page.tsx`
- `apps/server/src/app/docs/react-swagger.tsx`

**Dependencies to remove from `apps/server/package.json`:**
- `swagger-ui-react`
- `@types/swagger-ui-react`

**Config cleanup in `next.config.js`:**
- Remove webpack externals configuration for swagger-ui-react

## Verification

1. `bun run build` - Should pass without `<Html>` import error
2. `bun run typecheck` - No type errors
3. Docker build succeeds
4. `/docs` loads Scalar and displays API documentation
5. `/api/openapi.json` returns the OpenAPI spec
