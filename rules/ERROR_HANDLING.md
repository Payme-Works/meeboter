# Error Handling Patterns

## Success/Failure Response Pattern (CRITICAL)

**NEVER use `success: true | false` in response objects.** When an operation fails, throw an error instead.

### Why

- Errors are exceptional conditions that should propagate up the call stack
- Return types become simpler and more predictable (success is implied by returning)
- Calling code doesn't need to check `result.success` before accessing data
- TypeScript can better infer types without union discrimination

### Pattern

```typescript
// ─── Interface ───────────────────────────────────────────────────────────────

// ❌ BAD: Success flag pattern
interface DeployResult {
  success: boolean;
  identifier?: string;
  error?: string;
}

// ✅ GOOD: Error throwing pattern
interface DeployResult {
  identifier: string;  // Always present on success
}

class DeployError extends Error {
  constructor(
    message: string,
    public readonly platform: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "DeployError";
  }
}

// ─── Implementation ──────────────────────────────────────────────────────────

// ❌ BAD: Returning success/failure
async function deploy(): Promise<DeployResult> {
  try {
    const id = await createResource();
    return { success: true, identifier: id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown"
    };
  }
}

// ✅ GOOD: Throw on failure
async function deploy(): Promise<DeployResult> {
  try {
    const id = await createResource();
    return { identifier: id };
  } catch (error) {
    const cause = error instanceof Error ? error : undefined;
    throw new DeployError(
      `Deployment failed: ${cause?.message ?? "Unknown error"}`,
      "k8s",
      cause,
    );
  }
}

// ─── Usage ───────────────────────────────────────────────────────────────────

// ❌ BAD: Checking success flag
const result = await deploy();
if (!result.success) {
  console.error(result.error);
  return;
}
console.log(result.identifier);

// ✅ GOOD: Let errors propagate or catch explicitly
try {
  const result = await deploy();
  console.log(result.identifier);  // Always available
} catch (error) {
  if (error instanceof DeployError) {
    console.error(`${error.platform}: ${error.message}`);
  }
  throw error;  // Re-throw if not handled
}
```

### Custom Error Classes

When creating domain-specific errors, include relevant context:

```typescript
export class PlatformDeployError extends Error {
  constructor(
    message: string,
    public readonly platform: string,  // Which platform failed
    public readonly cause?: Error,     // Original error for debugging
  ) {
    super(message);
    this.name = "PlatformDeployError";
  }
}
```

### When to Catch vs Propagate

- **Catch and handle**: When you can recover or provide a fallback
- **Catch and wrap**: When adding context before re-throwing
- **Let propagate**: When the caller should handle the error

```typescript
// Catch and try fallback
async function deployWithFallback(): Promise<Result> {
  try {
    return await deployToPrimary();
  } catch (error) {
    console.log("Primary failed, trying fallback");
    return await deployToFallback();  // Throws if fallback also fails
  }
}

// Catch, wrap, and re-throw with context
async function deployBot(botId: number): Promise<Result> {
  try {
    return await platform.deploy(botId);
  } catch (error) {
    throw new BotDeployError(
      `Failed to deploy bot ${botId}`,
      error instanceof Error ? error : undefined,
    );
  }
}
```
