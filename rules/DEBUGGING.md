# Debugging and Investigation Guide

This document provides a systematic approach to debugging, tracing, and investigating errors in the Gate monorepo.

## Investigation Protocol (MANDATORY)

### Proactive Web Search (CRITICAL)

**ALWAYS search the web proactively when investigating, debugging, or testing.** Do not rely solely on codebase knowledge or assumptions.

Use web search for:
- **Error messages** - Search the exact error message to find known issues, solutions, and workarounds
- **Library-specific errors** - Search for library name + error to find documentation or GitHub issues
- **Stack traces** - Search key parts of stack traces to find similar issues others have encountered
- **Unexpected behavior** - Search for the library/framework + expected behavior to verify correct usage
- **Version-specific issues** - Include version numbers in searches when relevant

### Library Documentation and Resources (CRITICAL)

**ALWAYS consult official library documentation first** when debugging library-related issues:

- **Official docs** - Search for and read the library's official documentation
- **GitHub wiki** - Many libraries have detailed wikis with troubleshooting guides
- **GitHub issues** - Search closed issues for similar problems and solutions
- **GitHub discussions** - Check discussions for community solutions and workarounds
- **Changelog/Migration guides** - Check for breaking changes in recent versions

**Key libraries and their resources:**
- **Better Auth** - Check docs at better-auth.com, GitHub wiki, and GitHub issues
- **tRPC** - Check trpc.io docs and GitHub discussions
- **Prisma** - Check prisma.io docs and GitHub issues for specific error codes
- **Next.js** - Check nextjs.org docs and GitHub discussions
- **Zod** - Check zod.dev docs for validation patterns
- **React Hook Form** - Check react-hook-form.com docs for integration patterns

```bash
# Example search patterns
WebSearch query="TRPCClientError unauthorized better-auth"
WebSearch query="Prisma P2002 unique constraint violation"
WebSearch query="Next.js 15 middleware redirect loop"
WebSearch query="react-hook-form zod resolver not validating"

# Library documentation searches
WebSearch query="better-auth session management docs"
WebSearch query="tRPC error handling documentation"
WebSearch query="prisma client extensions github wiki"
```

**Key principle**: If you're stuck for more than a few minutes, search the web. Someone has likely encountered the same issue. Always check official documentation and GitHub resources first.

When investigating any error, follow these steps in order:

### Step 1: Identify Error Origin

1. **Extract key information from the error**:
   - Error message (exact text)
   - Stack trace (file paths and line numbers)
   - Component/page where error occurs
   - Error type (tRPC, Prisma, validation, runtime)

2. **Search for the error message source**:
   ```bash
   # Search for the exact error message in codebase
   Grep pattern="exact error message" path="apps/" output_mode="content"
   ```

### Step 2: Trace the Call Chain

1. **Frontend to Backend tracing**:
   - Identify the tRPC procedure being called
   - Find the frontend component making the call
   - Locate the backend use case handling the request

2. **Use this search pattern**:
   ```bash
   # Find tRPC procedure definition
   Grep pattern="procedureName" path="apps/mesh/src" output_mode="content"

   # Find frontend usage
   Grep pattern="trpc.router.procedure" path="apps/tera/src" output_mode="content"
   ```

### Step 3: Understand the Business Logic

1. **Read the use case completely** - understand what it's supposed to do
2. **Check edge cases** - what happens when:
   - Data doesn't exist?
   - User lacks permissions?
   - External service fails?
3. **Identify the root cause** - is the error:
   - Expected behavior being treated as error?
   - Missing data validation?
   - Incorrect assumption about state?

### Step 4: Verify with Database

```bash
# For PostgreSQL (Prisma)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/payme_works_gate" psql -c "SELECT * FROM \"TableName\" WHERE condition"

# For MongoDB
mongosh "mongodb://mongodb:mongodb@localhost:27017/payme_works_gate?authSource=admin" --eval "db.collection.find({}).pretty()"
```

### Step 5: Test the Fix

1. Apply the fix
2. Run lint and typecheck
3. Test in browser using Playwright MCP
4. Verify no console errors

## Common Error Patterns

### Pattern 1: "Not Found" Errors That Aren't Errors

**Problem**: Backend throws error when data doesn't exist, but this is a valid state.

**Example**: "Person not found" when organization hasn't started KYC yet.

**Solution**: Return a default/empty response instead of throwing an error.

```typescript
// WRONG - treats valid state as error
if (!record) {
  return left(new RecordNotFoundError());
}

// CORRECT - returns appropriate default
if (!record) {
  return right({
    status: Status.PENDING,
  });
}
```

### Pattern 2: tRPC Error Propagation

**Problem**: Backend use case returns `left(error)`, frontend receives TRPCClientError.

**Tracing steps**:
1. Find error message in use case file
2. Check if error should be an error or a valid response
3. Consider if frontend should handle this gracefully

### Pattern 3: Prisma Query Errors

**Problem**: Database query fails or returns unexpected results.

**Debugging steps**:
1. Check Prisma schema for correct field names (camelCase)
2. Verify relationships exist
3. Test query directly in database
4. Check for missing data or constraints

## Investigation Tools

### 1. Search Tools

```bash
# Find all occurrences of an error message
Grep pattern="error message" path="/" output_mode="content"

# Find where a function/method is defined
Grep pattern="functionName" path="apps/mesh/src" output_mode="content"

# Find where a function is called
Grep pattern="functionName\\(" path="apps/" output_mode="content"
```

### 2. Database Tools

```bash
# List all tables
PGPASSWORD=postgres psql -h localhost -U postgres -d payme_works_gate -c "\dt"

# Describe a table
PGPASSWORD=postgres psql -h localhost -U postgres -d payme_works_gate -c "\d \"TableName\""

# MongoDB collections
mongosh "mongodb://mongodb:mongodb@localhost:27017/payme_works_gate?authSource=admin" --eval "db.getCollectionNames()"
```

### 3. Browser Tools (Playwright MCP)

```typescript
// Navigate and capture state
mcp__playwright__browser_navigate({ url: "http://localhost:3000" })

// Check for console errors
mcp__playwright__browser_console_messages({ onlyErrors: true })

// Take screenshot for visual debugging
mcp__playwright__browser_take_screenshot({ filename: "debug.png" })
```

## Error Classification

### Errors That Should NOT Be Errors

These are valid application states, not errors:
- Resource not found when checking if something exists
- Empty list when querying for optional data
- Default state when feature hasn't been used yet

### Errors That ARE Errors

These require error handling:
- Authorization failures
- Invalid input data
- External service failures
- Database constraint violations

## Logging During Investigation

When adding temporary logs for debugging:

```typescript
// Use descriptive prefixes
console.log("[DEBUG] FunctionName > variable:", value);

// Remove debug logs before committing
```

## Post-Investigation Checklist

- [ ] Root cause identified and documented
- [ ] Fix applied to correct location
- [ ] Lint and typecheck pass
- [ ] Tested in browser (no console errors)
- [ ] Edge cases considered
- [ ] Similar patterns checked (same error in other files?)

## Example Investigation: "Person not found" Error

### 1. Error received
```
TRPCClientError: Person not found or does not belong to this organization
```

### 2. Search for error source
```bash
Grep pattern="Person not found or does not belong" path="apps/mesh"
```
Found in: `apps/mesh/src/application/use-cases/organizations/kyc/get-status.ts:61`

### 3. Read the use case
- Use case queries for Person record
- If not found, throws error
- Returns KYC status if found

### 4. Analyze business logic
- New organizations don't have Person records
- "No person" is valid state = KYC not started
- Should return PENDING, not throw error

### 5. Apply fix
```typescript
// Changed from error to valid response
if (!rawPerson) {
  return right({
    status: KycStatus.PENDING,
  });
}
```

### 6. Verify
- Lint/typecheck pass
- Browser shows "Complete Business Registration"
- No console errors
