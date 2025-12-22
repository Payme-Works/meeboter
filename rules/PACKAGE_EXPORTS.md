# Package.json Exports: TypeScript Type Resolution

## Overview

This document outlines best practices for configuring `package.json` exports to ensure TypeScript correctly resolves types in monorepo packages.

## Issue Summary

TypeScript may fail to resolve types when using wildcard patterns in `package.json` exports, especially when:
- Using complex glob patterns like `{ts,tsx}`
- Mixing `.ts` and `.tsx` files
- Exporting from subdirectories

## Root Cause

The `types` field in `package.json` exports **does not support complex glob patterns** like `{ts,tsx}`. TypeScript's module resolution expects simpler patterns or explicit paths.

Additionally, the pattern `./src/*.ts` does **not** automatically match `.tsx` files. TypeScript's module resolution is literal - `*.ts` only matches `.ts` files, not `.tsx`.

## Solution Patterns

### Pattern 1: Source Files (`.ts` only)

**Use when**: Package only contains `.ts` files (no `.tsx`)

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "default": "./dist/index.mjs"
    },
    "./*": {
      "types": "./src/*.ts",
      "import": "./dist/*.mjs",
      "require": "./dist/*.js",
      "default": "./dist/*.mjs"
    }
  }
}
```

**Requirements**:
- All source files must be `.ts` (no `.tsx`)
- Source files must be accessible to consuming packages
- No build step needed for types

**Examples**: `@gate/core`, `@gate/tasks`

### Pattern 2: Declaration Files (`.ts` and `.tsx`)

**Use when**: Package contains `.tsx` files or you want standard declaration files

```json
{
  "exports": {
    "./*": {
      "types": "./dist/*.d.ts",
      "import": "./dist/*.mjs",
      "require": "./dist/*.js",
      "default": "./dist/*.mjs"
    },
    "./*/*": {
      "types": "./dist/*/*.d.ts",
      "import": "./dist/*/*.mjs",
      "require": "./dist/*/*.js",
      "default": "./dist/*/*.mjs"
    }
  }
}
```

**Requirements**:
- Enable `dts: true` in `tsup.config.ts` to generate declaration files
- Declaration files are generated during build
- Works for both `.ts` and `.tsx` source files

**Examples**: `@gate/ai`, `@gate/ui`

### Pattern 3: Subdirectories

**Use when**: Exporting from subdirectories (e.g., `utils/cn`, `hooks/use-x`)

```json
{
  "exports": {
    "./*": {
      "types": "./dist/*.d.ts",  // Root level files
      "import": "./dist/*.mjs",
      "require": "./dist/*.js",
      "default": "./dist/*.mjs"
    },
    "./*/*": {
      "types": "./dist/*/*.d.ts",  // One level deep
      "import": "./dist/*/*.mjs",
      "require": "./dist/*/*.js",
      "default": "./dist/*/*.mjs"
    }
  }
}
```

**Note**: The `./*` pattern only matches root-level files. For subdirectories, add explicit `./*/*` patterns.

## Key Findings

1. **Glob patterns don't work**: The `{ts,tsx}` pattern is **not supported** in package.json exports `types` field
2. **Pattern matching is literal**: `*.ts` only matches `.ts` files, not `.tsx` files
3. **Subdirectories need explicit patterns**: Use `./*/*` for one level deep, `./*/*/*` for two levels, etc.
4. **Source vs Declaration files**:
   - **Source files** (`./src/*.ts`): Only works if all files are `.ts` (no `.tsx`)
   - **Declaration files** (`./dist/*.d.ts`): Works for both `.ts` and `.tsx` sources
5. **Consistency**: Choose one approach per package and stick with it

## TypeScript Module Resolution

When TypeScript resolves an import like `@gate/ui/utils/cn`:

1. It matches the appropriate export pattern (`./*/*` for subdirectories)
2. Replaces wildcards with the import path (`utils/cn`)
3. Resolves types using the `types` field (`./dist/utils/cn.d.ts` or `./src/utils/cn.ts`)
4. TypeScript reads the type information from the resolved file

## Decision Matrix

| Scenario | Recommended Pattern | Example |
|----------|-------------------|---------|
| Only `.ts` files, root level | Source files (`./src/*.ts`) | `@gate/core` |
| Only `.ts` files, subdirectories | Source files (`./src/*/*.ts`) | `@gate/tasks` |
| Has `.tsx` files | Declaration files (`./dist/*.d.ts`) | `@gate/ui` |
| Mixed `.ts` and `.tsx` | Declaration files (`./dist/*.d.ts`) | `@gate/ai` |
| Subdirectories with `.tsx` | Declaration files (`./dist/*/*.d.ts`) | `@gate/ui` |

## Best Practices

1. **Use simple patterns**: `*.ts` or `*.d.ts` instead of `*.{ts,tsx}`
2. **Add subdirectory patterns**: Use `./*/*` for nested paths
3. **Consistent approach**: Choose either source files OR declaration files per package
4. **Test type resolution**: Verify imports work in consuming packages
5. **Enable declaration generation**: If using declaration files, ensure `dts: true` in `tsup.config.ts`
6. **Match file types**: If package has `.tsx` files, use declaration files
7. **Avoid direct source imports**: Always use package exports, never import from `src/` directly
8. **Use workspace:* for internal deps**: `"@gate/ui": "workspace:*"` for monorepo packages
9. **Consider TypeScript Project References**: For better build performance (optional)

## Common Mistakes

### ❌ Using glob patterns
```json
"types": "./src/*.{ts,tsx}"  // Doesn't work
```

### ❌ Expecting `.ts` pattern to match `.tsx`
```json
"types": "./src/*.ts"  // Won't match button.tsx
```

### ❌ Missing subdirectory patterns
```json
"./*": {
  "types": "./src/*.ts"  // Won't match utils/cn.ts
}
// Missing: "./*/*" pattern
```

### ✅ Correct approach
```json
"./*": {
  "types": "./dist/*.d.ts"  // Works for both .ts and .tsx
},
"./*/*": {
  "types": "./dist/*/*.d.ts"  // Handles subdirectories
}
```

## Configuration Checklist

When setting up package exports:

- [ ] Determine if package has `.tsx` files
- [ ] Choose source files OR declaration files approach
- [ ] Add `./*` pattern for root-level exports
- [ ] Add `./*/*` pattern if exporting from subdirectories
- [ ] Enable `dts: true` in `tsup.config.ts` if using declaration files
- [ ] Test type resolution in consuming packages
- [ ] Verify build generates declaration files (if using that approach)

## Alternative Approaches

### TypeScript Project References

TypeScript Project References can be used **in addition to** package.json exports to improve build performance and type checking.

#### Setup

**1. Configure the referenced package** (`packages/ui/tsconfig.json`):
```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

**2. Configure the consuming package** (`packages/ai/tsconfig.json`):
```json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "references": [
    { "path": "../ui" }
  ]
}
```

**3. Create separate build config** (`packages/ui/tsconfig.build.json`):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": false
  }
}
```

**4. Update tsup config** (`packages/ui/tsup.config.ts`):
```typescript
export default defineConfig({
  // ... other config
  tsconfig: "./tsconfig.build.json",  // Use non-composite config for builds
});
```

#### Benefits

**1. Incremental Builds**
- Only rebuilds changed packages and their dependents
- Uses `.tsbuildinfo` files to track what's changed
- Dramatically faster on subsequent builds

**Example**:
```bash
# First build: Compiles everything
bunx tsc --build packages/ui/tsconfig.json packages/ai/tsconfig.json
# Time: ~2-3 seconds

# Second build (no changes): Skips everything
bunx tsc --build packages/ui/tsconfig.json packages/ai/tsconfig.json
# Time: ~0.1 seconds (20-30x faster!)
```

**2. Faster Type Checking**
- TypeScript caches type information in `.tsbuildinfo` files
- Only re-checks files that have changed
- IDE type checking becomes faster

**3. Better IDE Support**
- Improved IntelliSense and autocomplete
- Faster navigation between packages
- Better "Go to Definition" across packages
- More accurate error reporting

**4. Dependency Tracking**
- TypeScript automatically knows which packages depend on which
- Builds packages in the correct order
- Prevents circular dependency issues
- Ensures dependent packages rebuild when dependencies change

**5. Parallel Type Checking**
- Can type-check multiple packages in parallel
- Better utilization of multi-core CPUs
- Faster overall type checking in monorepos

**6. Build Correctness**
- Ensures all dependencies are built before dependents
- Prevents stale builds
- Better error messages when dependencies are missing

#### Usage

```bash
# Build with project references (incremental)
bunx tsc --build packages/ui/tsconfig.json
bunx tsc --build packages/ai/tsconfig.json

# Type check uses project references automatically
bun run typecheck --filter=@gate/ai

# Build all packages in dependency order
bunx tsc --build packages/*/tsconfig.json
```

#### Performance Comparison

**Without Project References**:
- Every typecheck rebuilds everything
- No caching between runs
- Slower IDE responsiveness
- Sequential type checking

**With Project References**:
- Incremental builds (only changed packages)
- Cached type information
- Faster IDE responsiveness
- Parallel type checking possible

**Real-world impact**:
- Large monorepo: 30-60 seconds → 2-5 seconds (10-15x faster)
- Medium monorepo: 10-20 seconds → 0.5-2 seconds (10-20x faster)
- Small monorepo: 2-5 seconds → 0.1-0.5 seconds (5-10x faster)

#### Important Notes

- **Project references complement package.json exports**: Both are needed
  - **package.json exports**: Runtime module resolution
  - **TypeScript project references**: Build-time type checking and incremental compilation
- **Separate build config needed**: `tsup` builds should use a non-composite config to avoid conflicts
- **`.tsbuildinfo` files**: Generated in `dist/` directory for incremental builds
- **Declaration files required**: For project references to work, referenced packages must generate declaration files (`dts: true` in tsup or `declaration: true` in tsconfig). Packages using source files for types (`./src/*.ts`) cannot be referenced by other packages using project references.
- **Works with tsup**: Project references are for type checking, tsup handles bundling

**Examples**:
- `@gate/ui` → `@gate/ai` (both use declaration files, works)
- `@gate/transactional` → `@gate/database` (both use declaration files, works)
- `@gate/core` (uses source files, cannot be referenced via project references, but still benefits from IDE support)

### Why Avoid Source File Imports?

**❌ Don't do this**:
```typescript
import { cn } from "@gate/ui/src/utils/cn";  // Direct source import
```

**✅ Do this**:
```typescript
import { cn } from "@gate/ui/utils/cn";  // Use package exports
```

**Reasons**:
1. **Bypasses build configuration**: Source files may not be processed correctly
2. **Development vs Production mismatch**: Source files behave differently than built files
3. **Performance**: Built files are optimized, source files are not
4. **Encapsulation**: Packages should expose a public API, not internal structure
5. **Type safety**: Declaration files provide better type information

## Monorepo Best Practices Summary

1. **Use workspace:* for internal dependencies**: `"@gate/ui": "workspace:*"`
2. **Avoid direct source imports**: Always use package exports
3. **Use declaration files for packages with `.tsx`**: Ensures type resolution works
4. **Consider TypeScript Project References**: For better build performance
5. **Single version policy**: Keep dependency versions consistent across packages
6. **Clear package boundaries**: Each package should have a well-defined public API

## References

- TypeScript Handbook: [Declaration Files Publishing](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html)
- Node.js: [Package Exports](https://nodejs.org/api/packages.html#exports)
- TypeScript: [Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)
- TypeScript: [Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- Monorepo Tools: [TypeScript in Monorepos](https://monorepo.tools/typescript)
