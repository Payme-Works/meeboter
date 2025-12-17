# Zod Best Practices & v4 Migration Guide

> **Official Docs:** https://zod.dev
> **v4 Migration Guide:** https://zod.dev/v4/changelog
> **GitHub:** https://github.com/colinhacks/zod

This document covers all Zod-related patterns, best practices, and v4 migration guidelines for the Gate monorepo.

---

## Essential Best Practices

### Enum Validation (MANDATORY)

**NEVER use `z.nativeEnum()`** - This is deprecated. Always use `z.enum()` directly with const objects.

```typescript
// ✅ CORRECT: Use z.enum directly
const myEnumSchema = z.enum(MyEnum);

// ❌ WRONG: Deprecated z.nativeEnum
const myEnumSchema = z.nativeEnum(MyEnum);
```

**Common enum patterns:**
```typescript
// For tRPC output schemas
z.object({
  provider: z.enum(BankProvider),
  paymentMethods: z.array(z.enum(PaymentMethod)),
  currency: z.enum(Currency),
})

// For partial records with enum keys
z.partialRecord(
  z.enum(Currency),
  z.object({ percentage: z.string(), fixed: z.string() })
)
```

### Empty Input Schemas (MANDATORY)

**ALWAYS use `z.void()` for empty inputs** - Never use `z.object({})` for tRPC endpoints that don't require input parameters.

```typescript
// ✅ CORRECT: Use z.void() for no input
export const myInputSchema = z.void();

// Client usage - no parameters needed
trpc.myEndpoint.useQuery();
trpc.myEndpoint.mutateAsync();

// ❌ WRONG: Don't use empty object
export const myInputSchema = z.object({});

// Would require passing empty object
trpc.myEndpoint.useQuery({});  // Unnecessary!
trpc.myEndpoint.mutateAsync({}); // Unnecessary!
```

**Why `z.void()` is better:**
- Clearer intent - explicitly states "no input required"
- Better DX - clients don't need to pass empty objects
- Type safety - TypeScript won't allow passing arguments when none are expected
- Consistency - follows tRPC best practices for parameterless procedures

### Record Schemas (MANDATORY)

**Always specify both key and value types:**
```typescript
// ✅ CORRECT: Must specify key and value
z.record(z.string(), z.string())

// ❌ WRONG: Single-argument form (removed in v4)
z.record(z.string())
```

---

## Zod v4 Migration Guide

Zod v4 introduces significant breaking changes and performance improvements

## String Validation Changes

### Email Validation

**BREAKING CHANGE:** Email validation now uses top-level function instead of method chaining.

```typescript
// ❌ WRONG: Zod v3 syntax (deprecated)
z.string().email()

// ✅ CORRECT: Zod v4 syntax
z.email()

// ✅ CORRECT: With custom pattern
z.email({ pattern: z.regexes.html5Email })
z.email({ pattern: z.regexes.rfc5322Email })
z.email({ pattern: z.regexes.unicodeEmail })
```

### URL Validation

```typescript
// ❌ WRONG: Zod v3 syntax
z.string().url()

// ✅ CORRECT: Zod v4 syntax
z.url()
```

### UUID Validation

**BREAKING CHANGE:** UUID validation is now stricter (RFC 9562/4122 compliant).

```typescript
// ❌ WRONG: Zod v3 syntax
z.string().uuid()

// ✅ CORRECT: Zod v4 syntax - strict RFC compliance
z.uuid()

// ✅ CORRECT: For permissive "UUID-like" validation
z.guid()
```

### IP Address Validation

```typescript
// ❌ WRONG: Zod v3 syntax
z.string().ip()
z.string().ip({ version: "v4" })

// ✅ CORRECT: Zod v4 syntax
z.ipv4()
z.ipv6()
```

### CIDR Validation

```typescript
// ❌ WRONG: Zod v3 syntax
z.string().cidr()

// ✅ CORRECT: Zod v4 syntax
z.cidrv4()
z.cidrv6()
```

### Other String Validators

```typescript
// ❌ WRONG: Zod v3 syntax
z.string().cuid()
z.string().cuid2()
z.string().ulid()
z.string().datetime()
z.string().base64()

// ✅ CORRECT: Zod v4 syntax
z.cuid()
z.cuid2()
z.ulid()
z.datetime()
z.base64()
```

### Base64URL Change

**BREAKING CHANGE:** Padding no longer allowed in base64url validation.

```typescript
z.base64url() // Now requires unpadded base64url format
```

## Template Literal Types (New in v4)

Zod v4 introduces template literal types for structured string formats:

```typescript
// Basic pattern
const greeting = z.templateLiteral(["hello, ", z.string()]);

// CSS units
const cssValue = z.templateLiteral([z.number(), z.enum(["px", "em", "rem"])]);

// Email-like format
const email = z.templateLiteral([
  z.string().min(1),
  "@",
  z.string().max(64),
]);
```

## String-to-Boolean Conversion (New in v4)

```typescript
const stringBool = z.stringbool();
stringBool.parse("true");  // true
stringBool.parse("yes");   // true
stringBool.parse("false"); // false
stringBool.parse("no");    // false

// Custom mappings
z.stringbool({
  truthy: ["yes", "true", "1"],
  falsy: ["no", "false", "0"]
});
```

## Error Customization

**BREAKING CHANGE:** Unified error customization API.

```typescript
// ❌ WRONG: Zod v3 syntax
z.string({
  required_error: "Field required",
  invalid_type_error: "Not a string"
})

// ✅ CORRECT: Zod v4 syntax
z.string({
  error: (issue) =>
    issue.input === undefined ? "Field required" : "Not a string"
})

// ✅ CORRECT: Return undefined to defer to next error map
z.string({
  error: (issue) => {
    if (issue.input === undefined) return "Field required";
    return undefined; // Defer to default error map
  }
})

// ✅ CORRECT: Error maps can return plain strings
z.string({
  error: "Must be a string" // Simple string instead of {message: string}
})
```

### Error Map Renaming

```typescript
// ❌ WRONG: Zod v3 syntax
z.string({ errorMap: customErrorMap })

// ✅ CORRECT: Zod v4 syntax
z.string({ error: customErrorMap })
```

## ZodError Changes

### Issue Type Updates

```typescript
// error.errors is now error.issues
const result = schema.safeParse(data);
if (!result.success) {
  console.log(result.error.issues); // Not .errors
}
```

### Deprecated Methods

```typescript
// ❌ WRONG: Deprecated methods
error.format()
error.flatten()
ctx.addIssue()
ctx.addIssues()

// ✅ CORRECT: New methods
z.treeifyError(error) // Replaces .format() and .flatten()
err.issues.push(issue) // Directly manipulate issues array
```

## Number Validation Changes

**BREAKING CHANGE:** Infinity handling and integer validation.

```typescript
// Infinity no longer passes z.number() validation
z.number().parse(Infinity); // ❌ Fails in v4

// .int() only accepts safe integers
z.number().int() // Only accepts Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER

// .safe() behaves identically to .int()
z.number().safe() // Same as .int()
```

## Enum Changes

### Native Enum Migration

```typescript
// ❌ WRONG: Zod v3 syntax (deprecated)
z.nativeEnum(MyEnum)

// ✅ CORRECT: Zod v4 syntax
z.enum(MyEnum)
```

### Enum Sub-APIs

```typescript
// ❌ WRONG: Zod v3 syntax
MyEnumSchema.Enum
MyEnumSchema.Values

// ✅ CORRECT: Zod v4 syntax
MyEnumSchema.enum
```

## Object Schema Changes

### Strict and Passthrough

```typescript
// ❌ WRONG: Zod v3 syntax
z.object({ ... }).strict()
z.object({ ... }).passthrough()

// ✅ CORRECT: Zod v4 syntax
z.strictObject({ ... })
z.looseObject({ ... })
```

### Merge Deprecation

```typescript
// ❌ WRONG: Deprecated .merge()
z.object({ a: z.string() }).merge(z.object({ b: z.number() }))

// ✅ CORRECT: Use .extend()
z.object({ a: z.string() }).extend({ b: z.number() })
```

### Removed Methods

```typescript
// ❌ WRONG: Removed in v4
schema.nonstrict()
schema.deepPartial()
schema.strip() // Deprecated
```

### Default Values in Optional Fields

**BREAKING CHANGE:** Defaults now apply within optional fields.

```typescript
const schema = z.object({
  a: z.string().default("tuna").optional()
});

// v3 inferred type: { a?: string }
// v4 inferred type: { a: string } // Default is always present
```

## Default Values Behavior

**BREAKING CHANGE:** `.default()` behavior fundamentally changed.

```typescript
// v4 behavior: if input is undefined, returns default WITHOUT parsing
const schema = z.string().default("default");
schema.parse(undefined); // "default" (not parsed)

// ✅ CORRECT: Use .prefault() to replicate old behavior (parse defaults)
const schema = z.string().prefault("default");
schema.parse(undefined); // "default" (parsed)
```

**Important:** Default must match the **output type**, not input type.

## Coercion Changes

**BREAKING CHANGE:** All `z.coerce` schema inputs are now `unknown`.

```typescript
// v3: z.coerce.number() accepted number | string
// v4: z.coerce.number() accepts unknown

z.coerce.number().parse("123"); // 123
z.coerce.boolean().parse("true"); // true
```

## Array Changes

**BREAKING CHANGE:** `.nonempty()` return type changed.

```typescript
// v3: returns [string, ...string[]] (tuple type)
// v4: returns string[] (array type)

// ❌ WRONG: Expecting tuple type in v4
const schema = z.string().array().nonempty();

// ✅ CORRECT: Use z.tuple() with rest for tuple behavior
const schema = z.tuple([z.string()]).rest(z.string());
```

## Record Changes

**BREAKING CHANGE:** Single-argument form removed.

```typescript
// ❌ WRONG: Single-argument form (removed)
z.record(z.string())

// ✅ CORRECT: Must specify key and value
z.record(z.string(), z.string())
```

### Exhaustive Records

**BREAKING CHANGE:** Records with enum keys now enforce exhaustiveness.

```typescript
const Status = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

// ✅ CORRECT: Requires all keys (exhaustive)
z.record(z.enum(Status), z.string())
// Type: { ACTIVE: string; INACTIVE: string } // All keys required

// ✅ CORRECT: Use partialRecord for optional keys
z.partialRecord(z.enum(Status), z.string())
// Type: { ACTIVE?: string; INACTIVE?: string } // Optional keys
```

## Function Schema Changes

**BREAKING CHANGE:** `z.function()` is no longer a schema.

```typescript
// ❌ WRONG: Zod v3 syntax
z.function().args(z.string()).returns(z.number())

// ✅ CORRECT: Zod v4 syntax
z.function({
  input: [z.string()],
  output: z.number()
}).implement((str) => Number(str))

// ✅ CORRECT: Async functions
z.function({
  input: [z.string()],
  output: z.number()
}).implementAsync(async (str) => Number(str))
```

## Refinement Changes

### Type Predicates

**BREAKING CHANGE:** Type predicates no longer narrow types.

```typescript
// v3: Type predicate would narrow the type
// v4: Type predicate does NOT narrow the type

// Use superRefine for custom type narrowing instead
```

### Context Path

**BREAKING CHANGE:** `ctx.path` removed from refinements (performance optimization).

```typescript
// ❌ WRONG: Accessing ctx.path
.refine((val, ctx) => {
  console.log(ctx.path); // No longer available
})

// ✅ CORRECT: Use error function if path is needed
```

### Function as Second Argument

**BREAKING CHANGE:** Function as second argument removed.

```typescript
// ❌ WRONG: Function as second argument
.refine(validator, (val) => ({ message: `Invalid: ${val}` }))

// ✅ CORRECT: Use object with message property
.refine(validator, { message: "Invalid value" })
```

## Deprecated/Removed Features

### Promise Schema

```typescript
// ❌ WRONG: z.promise() is deprecated
z.promise(z.string())

// ✅ CORRECT: Use async validation or custom implementation
```

### Optional Shorthands

```typescript
// ❌ WRONG: Removed in v4
z.ostring()
z.onumber()
z.oboolean()

// ✅ CORRECT: Use explicit optional
z.string().optional()
z.number().optional()
z.boolean().optional()
```

## Internal Architecture Changes

### Generic Structure

**BREAKING CHANGE:** `ZodType` simplified.

```typescript
// v3: ZodType<Output, Def, Input>
// v4: ZodType<Output, Input>
// Def generic parameter removed
```

### Internal Properties

```typescript
// ❌ WRONG: Accessing v3 internal properties
schema._def

// ✅ CORRECT: v4 internal properties
schema._zod.def
```

### Effects and Transforms

```typescript
// ZodEffects dropped in v4
// New ZodTransform class for transforms
// .transform() now returns ZodPipe
```

## Performance Improvements

Zod v4 includes significant performance improvements:
- `z.array()` parsing: **2.98x faster** than v3
- Overall validation speed improvements across all validators
- Optimized internal architecture

## Migration Tools

### Automated Codemod

```bash
# Install community codemod
npx zod-v3-to-v4

# Or
npm install -g zod-v3-to-v4
zod-v3-to-v4
```

### Manual Migration Checklist

1. ✅ Replace all `z.string().email()` with `z.email()`
2. ✅ Replace all `z.string().url()` with `z.url()`
3. ✅ Replace all `z.string().uuid()` with `z.uuid()`
4. ✅ Replace all `z.nativeEnum()` with `z.enum()`
5. ✅ Replace all `.merge()` with `.extend()`
6. ✅ Update error customization from `message`/`errorMap` to `error`
7. ✅ Replace `error.errors` with `error.issues`
8. ✅ Update `z.function()` API to new syntax
9. ✅ Replace single-argument `z.record()` with two-argument form
10. ✅ Review `.default()` usage and consider `.prefault()` if needed
11. ✅ Update `.strict()`/`.passthrough()` to `z.strictObject()`/`z.looseObject()`
12. ✅ Remove usage of deprecated methods (`.format()`, `.flatten()`, etc.)

## Common Patterns in Gate Monorepo

### Email Field

```typescript
// ✅ CORRECT: Email validation in forms
const formSchema = z.object({
  email: z.email(),
});
```

### Invite Members Schema Example

```typescript
// Before (v3)
export const inviteMembersInputSchema = z.array(
  z.object({
    email: z.string().email(),
    role: z.enum([MemberRole.OWNER, MemberRole.MEMBER]),
  }),
);

// After (v4)
export const inviteMembersInputSchema = z.array(
  z.object({
    email: z.email(), // Changed from z.string().email()
    role: z.enum([MemberRole.OWNER, MemberRole.MEMBER]),
  }),
);
```

### tRPC Input/Output Schemas

```typescript
// ✅ CORRECT: tRPC schema with v4 syntax
export const createUserInputSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: z.enum(UserRole),
});

export const createUserOutputSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum(UserRole),
  createdAt: z.date(),
});
```

## References

- **Official Migration Guide:** https://zod.dev/v4/changelog
- **Official Documentation:** https://zod.dev/v4
- **Community Codemod:** https://github.com/nicoespeon/zod-v3-to-v4
- **Release Notes:** https://zod.dev/v4
