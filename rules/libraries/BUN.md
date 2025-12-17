# Bun Runtime & Built-in APIs

> **Official Docs:** https://bun.com/docs
> **API Reference:** https://bun.com/reference
> **GitHub:** https://github.com/oven-sh/bun

Bun is a fast all-in-one JavaScript runtime with a native bundler, transpiler, test runner, and package manager built-in. This document covers all Bun-specific patterns and best practices for the Gate monorepo.

---

## Table of Contents

1. [CLI Commands](#cli-commands)
2. [Package Management](#package-management)
3. [File I/O](#file-io)
4. [HTTP Server & WebSockets](#http-server--websockets)
5. [SQLite Database](#sqlite-database)
6. [Test Runner](#test-runner)
7. [Shell Scripting](#shell-scripting)
8. [Subprocess Management](#subprocess-management)
9. [Bundler](#bundler)
10. [Transpiler](#transpiler)
11. [Workers](#workers)
12. [Environment Variables](#environment-variables)
13. [Hashing & Crypto](#hashing--crypto)
14. [Glob Pattern Matching](#glob-pattern-matching)
15. [Semver](#semver)
16. [S3 Client](#s3-client)
17. [FFI (Foreign Function Interface)](#ffi-foreign-function-interface)
18. [Macros](#macros)
19. [Utility Functions](#utility-functions)
20. [Module Resolution](#module-resolution)
21. [Color Utilities](#color-utilities)

---

## CLI Commands

### Basic Commands

```bash
# Run a script
bun run script.ts
bun script.ts           # Shorthand

# Run package.json scripts
bun run start           # Run "start" script
bun run dev             # Run "dev" script

# Execute without installing
bunx cowsay "Hello!"    # Same as: bun x cowsay "Hello!"

# Run tests
bun test

# Build/bundle
bun build ./index.ts --outdir ./dist
```

### Turbo Integration (Gate Monorepo)

```bash
# Always run from workspace root with turbo
bun turbo dev --filter=@gate/mesh
bun turbo dev --filter=@gate/tera
bun turbo test --filter=@gate/mesh
bun turbo build
```

---

## Package Management

### Installation Commands

```bash
# Install all dependencies
bun install              # 30x faster than npm/yarn

# Install specific package
bun install cowsay
bun add cowsay           # Alias

# Install dev dependency
bun add -d typescript

# Install global package
bun install -g cowsay

# Install exact versions (CI/CD)
bun ci                   # Same as: bun install --frozen-lockfile

# Remove package
bun remove cowsay
```

### Security Features

Unlike npm, Bun does NOT run arbitrary lifecycle scripts (like `postinstall`) for security. To allow lifecycle scripts for specific packages:

```json
{
  "trustedDependencies": ["@prisma/client", "esbuild"]
}
```

### Configuration (bunfig.toml)

```toml
[install]
# Registry configuration
registry = "https://registry.npmjs.org"

# Scoped registry
[install.scopes]
"@mycompany" = "https://registry.mycompany.com"

[install.cache]
# Cache directory
dir = "~/.bun/install/cache"
```

---

## File I/O

### Reading Files with `Bun.file()`

`Bun.file()` creates a lazy `BunFile` reference (does not read immediately).

```typescript
const file = Bun.file("./data.json");

// Properties (no disk read yet)
file.size;              // Number of bytes
file.type;              // MIME type

// Read contents (async)
const text = await file.text();           // As string
const json = await file.json();           // As parsed JSON
const buffer = await file.arrayBuffer();  // As ArrayBuffer
const bytes = await file.bytes();         // As Uint8Array
const stream = file.stream();             // As ReadableStream
```

### Writing Files with `Bun.write()`

```typescript
// Write string to file
await Bun.write("./output.txt", "Hello, World!");

// Write JSON
await Bun.write("./data.json", JSON.stringify({ key: "value" }));

// Write from Response
const response = await fetch("https://example.com/image.png");
await Bun.write("./image.png", response);

// Write from BunFile (copy)
const source = Bun.file("./source.txt");
await Bun.write("./destination.txt", source);
```

### Incremental Writing with FileSink

```typescript
const file = Bun.file("./log.txt");
const writer = file.writer();

writer.write("Line 1\n");
writer.write("Line 2\n");

await writer.flush();  // Flush buffer to disk
await writer.end();    // Flush and close
```

### Directory Operations

For `mkdir`, `readdir`, etc., use Node.js `fs` module:

```typescript
import { mkdir, readdir } from "node:fs/promises";

await mkdir("./new-dir", { recursive: true });
const files = await readdir("./some-dir");
```

---

## HTTP Server & WebSockets

### Basic HTTP Server with `Bun.serve()`

```typescript
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      return new Response("Hello, World!");
    }

    if (url.pathname === "/json") {
      return Response.json({ message: "Hello!" });
    }

    return new Response("Not Found", { status: 404 });
  },
});
```

### WebSocket Server

```typescript
Bun.serve({
  port: 3000,
  fetch(req, server) {
    // Upgrade HTTP to WebSocket
    if (server.upgrade(req)) {
      return; // Return undefined if upgrade succeeds
    }
    return new Response("Expected WebSocket", { status: 400 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
      ws.subscribe("chat"); // Subscribe to topic
    },
    message(ws, message) {
      ws.publish("chat", message); // Broadcast to all subscribers
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});
```

### Pub/Sub API

```typescript
// Subscribe to topics
ws.subscribe("notifications");
ws.subscribe("user-123");

// Publish to all subscribers (except sender)
ws.publish("notifications", JSON.stringify({ type: "alert" }));

// Unsubscribe
ws.unsubscribe("notifications");
```

---

## SQLite Database

Bun has SQLite built-in via `bun:sqlite`. No external packages needed.

### Basic Usage

```typescript
import { Database } from "bun:sqlite";

// Create in-memory database
const db = new Database(":memory:");

// Create file-based database
const db = new Database("./mydb.sqlite");

// Create table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);
```

### Prepared Statements

```typescript
// Prepare statement (cached and reusable)
const insertUser = db.prepare(
  "INSERT INTO users (name, email) VALUES ($name, $email)"
);

// Run with named parameters
insertUser.run({ $name: "John", $email: "john@example.com" });

// Query single row
const getUser = db.prepare("SELECT * FROM users WHERE id = ?");
const user = getUser.get(1);

// Query all rows
const getAllUsers = db.prepare("SELECT * FROM users");
const users = getAllUsers.all();
```

### Transactions

```typescript
const insertMany = db.transaction((users) => {
  const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
  for (const user of users) {
    insert.run(user.name, user.email);
  }
});

insertMany([
  { name: "Alice", email: "alice@example.com" },
  { name: "Bob", email: "bob@example.com" },
]);
```

### WAL Mode (Recommended)

```typescript
// Enable Write-Ahead Logging for better performance
db.run("PRAGMA journal_mode = WAL");
```

### Performance

`bun:sqlite` is **3-6x faster** than `better-sqlite3` and **8-9x faster** than Deno's SQLite.

---

## Test Runner

Bun ships with a Jest-compatible test runner.

### Basic Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

describe("Math", () => {
  it("adds numbers", () => {
    expect(2 + 2).toBe(4);
  });

  it("handles async", async () => {
    const result = await Promise.resolve(42);
    expect(result).toBe(42);
  });
});
```

### Lifecycle Hooks

```typescript
import { beforeAll, beforeEach, afterEach, afterAll } from "bun:test";

beforeAll(() => {
  // Run once before all tests
});

beforeEach(() => {
  // Run before each test
});

afterEach(() => {
  // Run after each test
});

afterAll(() => {
  // Run once after all tests
});
```

### Mocking

```typescript
import { mock, jest } from "bun:test";

// Using mock()
const mockFn = mock(() => 42);
mockFn();
expect(mockFn).toHaveBeenCalled();

// Using jest.fn() (compatible API)
const jestMock = jest.fn(() => "hello");
jestMock();
expect(jestMock).toHaveBeenCalledTimes(1);
```

### Snapshots

```typescript
import { expect, test } from "bun:test";

test("snapshot", () => {
  const data = { name: "John", age: 30 };
  expect(data).toMatchSnapshot();
});

// Update snapshots: bun test --update-snapshots
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific file
bun test ./src/user.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

### File Patterns

Bun automatically finds files matching:
- `*.test.{js,jsx,ts,tsx}`
- `*_test.{js,jsx,ts,tsx}`
- `*.spec.{js,jsx,ts,tsx}`
- `*_spec.{js,jsx,ts,tsx}`

---

## Shell Scripting

Bun Shell (`$`) provides cross-platform bash-like scripting.

### Basic Usage

```typescript
import { $ } from "bun";

// Run command
await $`echo "Hello, World!"`;

// Get output as text
const result = await $`ls -la`.text();
console.log(result);

// Quiet mode (no stdout)
await $`npm install`.quiet();
```

### Error Handling

```typescript
// Default: throws on non-zero exit code
try {
  await $`exit 1`;
} catch (error) {
  console.error("Command failed:", error.exitCode);
}

// Disable throwing
const result = await $`exit 1`.nothrow();
console.log(result.exitCode); // 1
```

### Variable Interpolation (Safe)

```typescript
const filename = "my file.txt";
await $`cat ${filename}`; // Properly escaped, no injection

const files = ["a.txt", "b.txt"];
await $`rm ${files}`; // Each element escaped separately
```

### Environment Variables

```typescript
// Set for single command
await $`echo $MY_VAR`.env({ MY_VAR: "hello" });

// Set default for all commands
$.env({ NODE_ENV: "production" });
await $`node app.js`;
```

### Working Directory

```typescript
await $`ls`.cwd("/tmp");
```

### Pipes and Redirects

```typescript
// Pipe
await $`cat file.txt | grep "pattern"`;

// Redirect output
await $`echo "hello" > output.txt`;

// Append
await $`echo "world" >> output.txt`;
```

### Built-in Commands

Cross-platform commands implemented natively:
- `ls`, `cd`, `rm`, `mkdir`, `cp`, `mv`
- `cat`, `echo`, `pwd`, `which`
- `true`, `false`, `exit`

---

## Subprocess Management

### Async with `Bun.spawn()`

```typescript
const proc = Bun.spawn(["echo", "Hello, World!"]);

// Wait for completion
await proc.exited;

// Read stdout
const output = await new Response(proc.stdout).text();
```

### With Options

```typescript
const proc = Bun.spawn(["node", "script.js"], {
  cwd: "/path/to/dir",
  env: { NODE_ENV: "production" },
  timeout: 30000, // 30 seconds
  onExit(proc, exitCode, signal) {
    console.log(`Exited with code ${exitCode}`);
  },
});
```

### Stdin/Stdout/Stderr

```typescript
const proc = Bun.spawn(["cat"], {
  stdin: "pipe",
  stdout: "pipe",
});

// Write to stdin
proc.stdin.write("Hello!");
proc.stdin.end();

// Read from stdout
const output = await new Response(proc.stdout).text();
```

### Sync with `Bun.spawnSync()`

```typescript
const result = Bun.spawnSync(["ls", "-la"]);

console.log(result.success);              // boolean
console.log(result.exitCode);             // number
console.log(result.stdout.toString());    // Buffer -> string
console.log(result.stderr.toString());
```

### IPC (Inter-Process Communication)

```typescript
const child = Bun.spawn(["bun", "child.ts"], {
  ipc(message) {
    console.log("Received:", message);
  },
});

// Send message to child
child.send({ type: "ping" });
```

---

## Bundler

### Basic Bundling

```typescript
const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
});

if (!result.success) {
  console.error("Build failed:", result.logs);
}
```

### Build Options

```typescript
await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",

  // Target environment
  target: "browser",     // "browser" | "bun" | "node"

  // Output format
  format: "esm",         // "esm" | "cjs" | "iife"

  // Optimizations
  minify: true,          // Minify output
  splitting: true,       // Code splitting
  sourcemap: "external", // "none" | "inline" | "external"

  // Naming
  naming: {
    entry: "[name].[hash].js",
    chunk: "[name]-[hash].js",
    asset: "[name]-[hash].[ext]",
  },

  // External packages (don't bundle)
  external: ["react", "react-dom"],

  // Define globals
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
```

### CLI Bundling

```bash
# Basic build
bun build ./src/index.ts --outdir ./dist

# Production build
bun build ./src/index.ts --outdir ./dist --minify --sourcemap=external

# For Bun runtime
bun build ./src/index.ts --target bun --outdir ./dist

# Single executable
bun build ./src/index.ts --compile --outfile myapp
```

### HTML Imports (Frontend Bundling)

```typescript
// server.ts
import homepage from "./index.html";

Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response(homepage, {
      headers: { "Content-Type": "text/html" },
    });
  },
});
```

Bun automatically:
- Transpiles `<script>` tags (TypeScript, JSX)
- Bundles and minifies CSS from `<link>` tags
- Generates content-addressable hashes for caching
- Provides HMR in development

```bash
# Development with HMR
bun --hot ./server.ts

# Production build
bun build ./index.html --production
```

---

## Transpiler

### Using `Bun.Transpiler`

```typescript
const transpiler = new Bun.Transpiler({
  loader: "tsx", // "js" | "jsx" | "ts" | "tsx"
});

// Sync (faster for single files)
const js = transpiler.transformSync(`
  const greet = (name: string): string => {
    return <div>Hello, {name}!</div>;
  };
`);

// Async (uses thread pool, better for many files)
const js = await transpiler.transform(code);
```

### Scan Imports/Exports

```typescript
const transpiler = new Bun.Transpiler({ loader: "tsx" });

const result = transpiler.scan(`
  import { useState } from "react";
  import type { FC } from "react";
  export const App = () => <div />;
`);

console.log(result.imports);
// [{ path: "react", kind: "import-statement" }]

console.log(result.exports);
// ["App"]
```

### Options

```typescript
const transpiler = new Bun.Transpiler({
  loader: "tsx",

  // Trim unused imports
  trimUnusedImports: true,

  // Minify whitespace
  minifyWhitespace: true,

  // TypeScript config
  tsconfig: {
    compilerOptions: {
      jsx: "react-jsx",
      jsxImportSource: "react",
    },
  },
});
```

---

## Workers

Bun implements Web Workers with extensions for server-side use.

### Creating a Worker

```typescript
// main.ts
const worker = new Worker("./worker.ts");

worker.onmessage = (event) => {
  console.log("Received:", event.data);
};

worker.postMessage({ type: "start", data: [1, 2, 3] });
```

```typescript
// worker.ts
self.onmessage = (event) => {
  const { type, data } = event.data;

  if (type === "start") {
    const result = data.reduce((a, b) => a + b, 0);
    self.postMessage({ type: "result", value: result });
  }
};
```

### Worker Options

```typescript
const worker = new Worker("./worker.ts", {
  // Share environment variables
  env: worker.SHARE_ENV,

  // Or set specific env vars
  env: { MY_VAR: "value" },

  // Use less memory (slower)
  smol: true,
});
```

### BroadcastChannel

```typescript
// In main thread
const channel = new BroadcastChannel("notifications");
channel.postMessage({ type: "update" });

// In worker
const channel = new BroadcastChannel("notifications");
channel.onmessage = (event) => {
  console.log("Notification:", event.data);
};
```

---

## Environment Variables

### Accessing Variables

```typescript
// All three are equivalent
process.env.API_KEY;
Bun.env.API_KEY;
import.meta.env.API_KEY;
```

### Automatic .env Loading

Bun reads these files automatically (in order of precedence):
1. `.env`
2. `.env.production` / `.env.development` / `.env.test` (based on `NODE_ENV`)
3. `.env.local` (not loaded when `NODE_ENV=test`)

### Custom .env Files

```bash
bun --env-file=.env.staging run server.ts
bun --no-env-file run server.ts  # Disable auto-loading
```

### Variable Expansion

```env
DB_HOST=localhost
DB_PORT=5432
DB_URL=postgres://$DB_HOST:$DB_PORT/mydb
```

### TypeScript Support

```typescript
// global.d.ts
declare module "bun" {
  interface Env {
    API_KEY: string;
    DATABASE_URL: string;
  }
}
```

---

## Hashing & Crypto

### Password Hashing (Secure)

```typescript
// Hash password (default: Argon2id)
const hash = await Bun.password.hash("mypassword");

// With algorithm choice
const hash = await Bun.password.hash("mypassword", {
  algorithm: "argon2id", // "argon2id" | "argon2i" | "argon2d" | "bcrypt"
  memoryCost: 65536,     // Argon2 memory in KB
  timeCost: 3,           // Argon2 iterations
});

// Verify password
const isValid = await Bun.password.verify("mypassword", hash);

// Sync versions
const hash = Bun.password.hashSync("mypassword");
const isValid = Bun.password.verifySync("mypassword", hash);
```

### Non-Cryptographic Hashing (Fast)

```typescript
// Default: Wyhash (64-bit)
const hash = Bun.hash("hello world");

// Specific algorithms
Bun.hash.wyhash("data");
Bun.hash.xxHash32("data");
Bun.hash.xxHash64("data");
Bun.hash.xxHash3("data");
Bun.hash.crc32("data");
Bun.hash.adler32("data");
Bun.hash.cityHash32("data");
Bun.hash.cityHash64("data");
Bun.hash.murmur32v3("data");
Bun.hash.murmur64v2("data");
```

### Cryptographic Hashing

```typescript
const hasher = new Bun.CryptoHasher("sha256");
hasher.update("hello");
hasher.update("world");
const digest = hasher.digest("hex");

// Or one-liner
const hash = new Bun.CryptoHasher("sha256")
  .update("hello world")
  .digest("base64");
```

---

## Glob Pattern Matching

### Basic Matching

```typescript
const glob = new Bun.Glob("**/*.ts");

// Check if path matches
glob.match("src/index.ts");     // true
glob.match("src/index.js");     // false
```

### Scanning Files

```typescript
const glob = new Bun.Glob("**/*.ts");

// Async iteration
for await (const file of glob.scan("./src")) {
  console.log(file);
}

// Sync iteration
for (const file of glob.scanSync("./src")) {
  console.log(file);
}
```

### Scan Options

```typescript
const glob = new Bun.Glob("**/*.ts");

for await (const file of glob.scan({
  cwd: "./src",
  absolute: true,        // Return absolute paths
  dot: true,             // Match dotfiles
  onlyFiles: true,       // Only files, no directories
  followSymlinks: false,
})) {
  console.log(file);
}
```

### Pattern Syntax

| Pattern | Matches |
|---------|---------|
| `?` | Any single character |
| `*` | Zero or more characters (not path separators) |
| `**` | Zero or more characters (including path separators) |
| `[ab]` | Character class |
| `[a-z]` | Character range |
| `[!ab]` | Negated character class |
| `{a,b}` | Brace expansion |
| `!pattern` | Negation (at start) |

---

## Semver

Bun's semver API is **20x faster** than `node-semver`.

```typescript
import { semver } from "bun";

// Check if version satisfies range
semver.satisfies("1.2.3", "^1.0.0");  // true
semver.satisfies("2.0.0", "^1.0.0");  // false

// Compare versions
semver.order("1.0.0", "1.0.0");  // 0
semver.order("1.0.0", "1.0.1");  // -1
semver.order("1.0.1", "1.0.0");  // 1

// Sort versions
const versions = ["2.0.0", "1.0.0", "1.5.0"];
versions.sort(semver.order);
// ["1.0.0", "1.5.0", "2.0.0"]
```

---

## S3 Client

Bun has a built-in S3-compatible client.

### Default Client (from env vars)

```typescript
// Uses S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION
const file = Bun.s3.file("path/to/file.txt");

// Read
const content = await file.text();

// Write
await Bun.s3.write("path/to/file.txt", "Hello, S3!");

// Delete
await Bun.s3.delete("path/to/file.txt");

// Check existence
const exists = await file.exists();
```

### Custom Client

```typescript
const s3 = new Bun.S3Client({
  accessKeyId: "...",
  secretAccessKey: "...",
  bucket: "my-bucket",
  region: "us-east-1",
  endpoint: "https://s3.amazonaws.com", // Optional
});

const file = s3.file("path/to/file.txt");
const content = await file.text();
```

### Compatible Services

```typescript
// Cloudflare R2
const r2 = new Bun.S3Client({
  endpoint: "https://<account-id>.r2.cloudflarestorage.com",
  // ...credentials
});

// Google Cloud Storage
const gcs = new Bun.S3Client({
  endpoint: "https://storage.googleapis.com",
  // ...credentials
});
```

### Partial Reads (Range Requests)

```typescript
const file = Bun.s3.file("large-file.bin");

// Read bytes 100-199
const slice = file.slice(100, 200);
const data = await slice.arrayBuffer();
```

---

## FFI (Foreign Function Interface)

> **Warning:** `bun:ffi` is experimental. For production, prefer Node-API modules.

### Basic Usage

```typescript
import { dlopen, FFIType, ptr, suffix } from "bun:ffi";

// Load shared library
const lib = dlopen(`./libexample.${suffix}`, {
  add: {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
});

// Call function
const result = lib.symbols.add(2, 3); // 5
```

### Supported Types

```typescript
FFIType.i8    FFIType.u8
FFIType.i16   FFIType.u16
FFIType.i32   FFIType.u32
FFIType.i64   FFIType.u64
FFIType.f32   FFIType.f64
FFIType.ptr   FFIType.cstring
FFIType.bool  FFIType.void
```

### JavaScript Callbacks

```typescript
import { JSCallback, FFIType } from "bun:ffi";

const callback = new JSCallback(
  (a, b) => a + b,
  {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  }
);

// Pass callback.ptr to C function
lib.symbols.registerCallback(callback.ptr);
```

---

## Macros

Macros run JavaScript at **bundle-time** and inline the result.

### Defining a Macro

```typescript
// random.ts
export function randomNumber() {
  return Math.random();
}
```

### Using a Macro

```typescript
// app.ts
import { randomNumber } from "./random" with { type: "macro" };

// At bundle-time, this becomes:
// const value = 0.7423156789;
const value = randomNumber();
```

### Use Cases

```typescript
// Read file at build time
export function readVersion() {
  return require("./package.json").version;
}

// Fetch data at build time
export async function fetchConfig() {
  const res = await fetch("https://api.example.com/config");
  return await res.json();
}
```

### Security

- Macros cannot be invoked from `node_modules/**/*`
- Use `--no-macros` to disable macros entirely

---

## Utility Functions

### Sleep

```typescript
// Async sleep
await Bun.sleep(1000); // 1 second

// Or with Date
await Bun.sleep(new Date(Date.now() + 1000));

// Sync sleep (blocks thread)
Bun.sleepSync(1000);
```

### Peek (Read Promise Without Await)

```typescript
import { peek } from "bun";

const promise = Promise.resolve("hello");

// Read value without await (if already resolved)
const value = peek(promise); // "hello"

// Check status
peek.status(promise); // "fulfilled" | "rejected" | "pending"
```

### High-Resolution Timer

```typescript
const start = Bun.nanoseconds();
// ... do work ...
const elapsed = Bun.nanoseconds() - start;
console.log(`Took ${elapsed / 1e6} ms`);
```

### Version & Info

```typescript
Bun.version;        // "1.1.0"
Bun.revision;       // Git commit hash

Bun.main;           // Entry point path
Bun.argv;           // Command-line arguments

Bun.cwd();          // Current working directory
Bun.which("node");  // Find executable path
```

### Escape HTML

```typescript
Bun.escapeHTML("<script>alert('xss')</script>");
// "&lt;script&gt;alert('xss')&lt;/script&gt;"
```

### UUID v7

```typescript
Bun.randomUUIDv7(); // Monotonic, sortable UUID
```

### DNS

```typescript
const addresses = await Bun.dns.lookup("example.com");
// [{ address: "93.184.216.34", family: 4 }]

// Prefetch for fetch() and Bun.connect()
Bun.dns.prefetch("api.example.com");
```

---

## Module Resolution

### `import.meta` Properties

```typescript
import.meta.dir;     // "/path/to/dir"
import.meta.file;    // "script.ts"
import.meta.path;    // "/path/to/dir/script.ts"
import.meta.url;     // "file:///path/to/dir/script.ts"
import.meta.main;    // true if directly executed
```

### Resolving Modules

```typescript
// Async
const path = await Bun.resolve("./module", import.meta.dir);

// Sync
const path = Bun.resolveSync("lodash", import.meta.dir);

// Standard API
const url = import.meta.resolve("./module");
```

---

## Color Utilities

### `Bun.color()` - Parse & Convert Colors

```typescript
// Parse any color format
Bun.color("#ff5733");
Bun.color("rgb(255, 87, 51)");
Bun.color("hsl(14, 100%, 60%)");

// Convert to different formats
Bun.color("#ff5733", "rgb");   // "rgb(255, 87, 51)"
Bun.color("#ff5733", "hsl");   // "hsl(14, 100%, 60%)"
Bun.color("#ff5733", "hex");   // "ff5733"
Bun.color("#ff5733", "ansi");  // ANSI escape code for terminal
Bun.color("#ff5733", "css");   // Most compact CSS representation

// Invalid input returns null
Bun.color("not-a-color"); // null
```

### `Bun.stringWidth()` - Terminal String Width

```typescript
// Get display width (handles emojis, ANSI, wide chars)
Bun.stringWidth("hello");        // 5
Bun.stringWidth("你好");          // 4 (wide characters)
Bun.stringWidth("👋");            // 2 (emoji)
Bun.stringWidth("\x1b[31mred\x1b[0m"); // 3 (ignores ANSI)

// Options
Bun.stringWidth("👋", {
  ambiguousIsNarrow: true,  // Treat ambiguous width as 1
  countAnsiEscapeCodes: false, // Ignore ANSI codes (default)
});
```

### `Bun.enableANSIColors`

```typescript
if (Bun.enableANSIColors) {
  console.log("\x1b[32mGreen text\x1b[0m");
} else {
  console.log("Green text");
}
```

---

## Best Practices for Gate Monorepo

### Prefer Bun APIs Over Node.js

```typescript
// CORRECT: Use Bun.file for file reading
const content = await Bun.file("./data.json").json();

// AVOID: Using fs when Bun.file is simpler
import { readFile } from "node:fs/promises";
const content = JSON.parse(await readFile("./data.json", "utf-8"));
```

### Use Built-in Test Runner

```typescript
// CORRECT: Use bun:test
import { test, expect } from "bun:test";

test("example", () => {
  expect(1 + 1).toBe(2);
});
```

### Shell Scripts with $

```typescript
// CORRECT: Cross-platform shell scripting
import { $ } from "bun";
await $`rm -rf ./dist && mkdir ./dist`;
```

### Environment Variables

```typescript
// CORRECT: Use Bun.env (auto-loads .env files)
const apiKey = Bun.env.API_KEY;

// AVOID: Using dotenv (unnecessary with Bun)
```

### Password Hashing

```typescript
// CORRECT: Use Bun.password (built-in Argon2/bcrypt)
const hash = await Bun.password.hash(password);

// AVOID: External packages like bcrypt (unnecessary)
```

---

## References

- **Official Documentation:** https://bun.com/docs
- **API Reference:** https://bun.com/reference
- **Blog:** https://bun.sh/blog
- **GitHub:** https://github.com/oven-sh/bun
- **Discord:** https://bun.sh/discord
