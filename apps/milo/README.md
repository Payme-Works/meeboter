# Milo - Meeboter API Server

The Milo app is the backend API server for Meeboter, built with **Next.js** and **tRPC**. It manages bot deployments, authentication, pool management, and API endpoints for the meeting bot platform.

## Getting Started

Copy the `.env.example` file to `.env` and configure the environment variables:

```bash
cp .env.example .env
```

Install dependencies and run the development server:

```bash
bun install
bun dev
```

The server runs on `http://localhost:3000` by default.

---

## Architecture Overview

```
apps/milo/
├── drizzle/                    # Database migrations
├── public/                     # Static assets
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/                # API routes (tRPC, auth)
│   │   ├── bots/               # Bot management UI
│   │   ├── docs/               # API documentation
│   │   ├── keys/               # API key management
│   │   └── usage/              # Usage statistics
│   │
│   ├── components/             # React components
│   ├── lib/                    # Utilities and helpers
│   ├── styles/                 # Global styles
│   ├── trpc/                   # tRPC client configuration
│   │
│   └── server/                 # Backend implementation
│       ├── api/
│       │   ├── routers/        # tRPC endpoints
│       │   ├── services/       # Core business logic
│       │   ├── root.ts         # Main tRPC router
│       │   └── trpc.ts         # tRPC setup & middleware
│       │
│       ├── auth/               # Authentication (Better-Auth)
│       └── database/           # Drizzle ORM configuration
│
└── tests-e2e/                  # End-to-end tests
```

---

## Core Services

### Platform Abstraction (`services/platform/`)

Meeboter supports multiple deployment platforms through a unified interface:

| File | Description |
|------|-------------|
| `platform-service.ts` | Abstract platform interface |
| `platform-factory.ts` | Creates platform service based on config |
| `coolify-platform-service.ts` | Coolify pool-based deployment |
| `aws-platform-service.ts` | AWS ECS task-based deployment |
| `local-platform-service.ts` | Local development mode |

### Bot Pool Service (`bot-pool-service.ts`)

Manages the Coolify-based bot container pool:

- **Slot allocation**: Assigns idle slots to incoming bots
- **Queue management**: Queues bots when pool is exhausted
- **Advisory locking**: Prevents race conditions with PostgreSQL locks
- **Slot lifecycle**: Handles slot creation, configuration, and release

### Image Pull Lock Service (`image-pull-lock-service.ts`)

Coordinates Docker image pulls to prevent redundant parallel downloads:

- When multiple bots deploy simultaneously, only the first pulls the image
- Subsequent deployments wait for the pull to complete, then use cached image
- Reduces bandwidth usage and deployment time

### Slot Recovery Service (`slot-recovery.ts`)

Recovers orphaned or error-state pool slots:

- Detects stuck deployments via timeout
- Recovers error slots by recreating Coolify applications
- Cleans up slots that cannot be recovered

### Bot Heartbeat Monitor (`bot-heartbeat-monitor.ts`)

Monitors bot health through heartbeat signals:

- Tracks last heartbeat timestamp for each active bot
- Marks bots as failed if heartbeat timeout exceeded
- Releases slots when bots become unresponsive

### Coolify Service (`coolify-service.ts`)

Interfaces with the Coolify API for container management:

- Creates and configures Coolify applications
- Starts/stops containers
- Manages environment variables
- Handles deployment callbacks

### Bot Deployment Service (`bot-deployment-service.ts`)

High-level orchestration of bot deployments:

- Coordinates between platform service and database
- Handles deployment lifecycle events
- Manages bot status transitions

---

## tRPC Routers (`routers/`)

| Router | Purpose |
|--------|---------|
| `bots.ts` | Bot CRUD, deployment, status updates, remove from call |
| `pool.ts` | Pool statistics, slot configuration endpoints |
| `api-keys.ts` | API key management |
| `events.ts` | Bot event logging and retrieval |
| `usage.ts` | Usage statistics and billing |
| `chat.ts` | Meeting chat/transcript functionality |

---

## Key Features

### Bot Deployment Flow

1. User creates bot with meeting details
2. System acquires pool slot (or queues if pool exhausted)
3. Image pull lock coordinates container image download
4. Coolify configures and starts the container
5. Bot joins meeting and sends heartbeats
6. On completion, slot is released and returned to pool

### Pool Management

- Up to 100 concurrent bot slots
- Queue system for overflow (FIFO with estimated wait time)
- Automatic slot recovery for failed deployments
- Per-platform slot naming (google-meet-slot-001, etc.)

### Authentication

- Session-based authentication via Better-Auth
- API key authentication for programmatic access
- Protected tRPC procedures for authenticated endpoints

---

## Database

Uses **Drizzle ORM** with PostgreSQL:

- `drizzle/` - SQL migration files
- `server/database/db.ts` - Database client
- `server/database/schema.ts` - Table definitions

Key tables: `bots`, `bot_pool_slots`, `api_keys`, `events`, `users`

---

## Development

### Running Tests

```bash
bun run test          # Unit tests
bun run test:e2e      # E2E tests with Playwright
```

### Type Checking and Linting

```bash
bun run typecheck
bun run lint
```

### Building

```bash
bun run build
```

---

## Environment Variables

See `.env.example` for required configuration. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DEPLOYMENT_PLATFORM` | `coolify`, `aws`, or `auto` |
| `COOLIFY_API_URL` | Coolify API endpoint |
| `COOLIFY_API_TOKEN` | Coolify authentication token |
| `MILO_AUTH_TOKEN` | Token for bot-to-API authentication |
| `S3_*` | Object storage configuration |
