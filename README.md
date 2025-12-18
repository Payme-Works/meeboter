<a id="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/Payme-Works/meeboter">
    <img src="https://raw.githubusercontent.com/Payme-Works/meeboter/refs/heads/bare-metal/apps/server/public/logo.svg" alt="Meeboter Logo" width="80" height="80">
  </a>

  <h3 align="center">Meeboter</h3>

  <p align="center">
    <strong>Open-source Meeting Engagement API</strong>
    <br />
    Deploy bots to Google Meet, Microsoft Teams, and Zoom to interact with meetings in real-time while keeping your data private and costs low.
    <br />
    <br />
    <a href="https://meeboter.tech">Website</a>
    &middot;
    <a href="https://github.com/Payme-Works/meeboter/issues/new?labels=bug&template=bug_report.md">Report Bug</a>
    &middot;
    <a href="https://github.com/Payme-Works/meeboter/issues/new?labels=enhancement&template=feature_request.md">Request Feature</a>
  </p>

  [![Contributors][contributors-shield]][contributors-url]
  [![Forks][forks-shield]][forks-url]
  [![Stargazers][stars-shield]][stars-url]
  [![Issues][issues-shield]][issues-url]
  [![MIT License][license-shield]][license-url]

</div>

## Why Meeboter?

| Need | Meeboter | Hosted APIs (e.g., Recall.ai) |
|------|----------|------------------------------|
| **Data Privacy** | Your servers, your data | Their servers process your meetings |
| **Cost** | Infrastructure only (~$20-50/month) | ~$0.70/hr per meeting |
| **Focus** | Meeting engagement and interaction | Recording and transcription |
| **Control** | Full source code, customize anything | Limited to their API |
| **Compliance** | You manage your own | Depend on their certifications |

> Looking for a fully managed solution? Check out [Recall.ai](https://www.recall.ai/?utm_source=github&utm_medium=sponsorship&utm_campaign=meeboter), great for teams prioritizing speed over privacy and cost.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Features

### Privacy-First Architecture

Deploy on your own infrastructure (AWS or Coolify). Meeting data never leaves your servers. Full control over data residency and compliance requirements.

### Real-Time Meeting Engagement

- **Chat Integration** - Send messages to meetings programmatically
- **Message Templates** - Create reusable templates with randomized variations
- **Participant Tracking** - Real-time join/leave events with speaker detection
- **Webhook Callbacks** - Get notified when events occur

### Lightning-Fast Bot Deployment

Innovative **Bot Pool System** reduces deployment time from 7+ minutes to ~30 seconds through pre-provisioned, reusable container slots.

### Multi-Platform Support

| Platform | Status | Features |
|----------|--------|----------|
| Google Meet | Stable | Chat, Recording, Participants |
| Microsoft Teams | Stable | Chat, Recording, Participants |
| Zoom | Stable | Chat, Recording, Participants |

### Developer Experience

- **Type-Safe API** - End-to-end TypeScript with tRPC
- **OpenAPI/Scalar** - Auto-generated REST documentation
- **Event Batching** - High-performance event processing (50 events/100ms)
- **Flexible Storage** - S3-compatible (AWS S3, MinIO, etc.)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ tRPC / REST API
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Meeboter Server (Next.js)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Bot Pool   │  │   Event     │  │   Chat & Templates      │  │
│  │  Manager    │  │   System    │  │   Engine                │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌─────────────────┐  ┌───────────┐  ┌─────────────────────────────┐
│   Bot Pool      │  │ PostgreSQL│  │  S3 / MinIO                 │
│   (Coolify)     │  │           │  │  (Recordings)               │
│  ┌───┐ ┌───┐    │  └───────────┘  └─────────────────────────────┘
│  │Bot│ │Bot│... │
│  └─┬─┘ └─┬─┘    │
└────┼─────┼──────┘
     │     │
     ▼     ▼
┌─────────────────────────────────────────────────────────────────┐
│          Video Conferencing Platforms                            │
│    Google Meet    │    Microsoft Teams    │    Zoom              │
└─────────────────────────────────────────────────────────────────┘
```

### Bot Deployment Flow

```
1. Create Bot          2. Acquire Slot        3. Deploy & Join
   via API         →      from Pool       →      Meeting
                              │
                              ▼
4. Send Events     ←   5. Engage in Call   →   6. Webhook
   (Participants,          (Chat, Track)         Callback
    Status)
                              │
                              ▼
                    7. Recording to S3
                       Slot Released
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- [Bun](https://bun.sh/) >= 1.0.0
- [Docker](https://www.docker.com/) (for local development)
- PostgreSQL database

### Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/Payme-Works/meeboter.git
   cd meeboter
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Start the database**

   ```bash
   docker compose up -d
   ```

4. **Configure environment**

   ```bash
   cp apps/server/.env.example apps/server/.env
   # Edit .env with your configuration
   ```

5. **Run database migrations**

   ```bash
   bun turbo db:migrate --filter=@meeboter/server
   ```

6. **Start the development server**

   ```bash
   bun turbo dev --filter=@meeboter/server
   ```

7. **Access the dashboard**

   - Web UI: http://localhost:3000
   - API Docs: http://localhost:3000/docs

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Deployment

### Option 1: Coolify (Recommended)

Coolify is a self-hosted PaaS that simplifies deployment. Best for most users.

**Estimated Cost**: ~$20-50/month for small-medium workloads

**Services to Deploy**:

- PostgreSQL database
- MinIO (S3-compatible storage)
- Meeboter Server
- Bot Pool (pre-provisioned bot containers)

**Setup Steps**:

1. Install Coolify on your server ([coolify.io](https://coolify.io))
2. Create a new project in Coolify
3. Deploy PostgreSQL and MinIO services
4. Deploy Meeboter Server with environment variables
5. Configure Bot Pool applications (up to 100 slots)

See [Coolify Deployment Guide](docs/deployment/coolify.md) for detailed instructions.

---

### Option 2: AWS with Terraform (Enterprise)

Full Infrastructure-as-Code deployment for production scale.

**Estimated Cost**: ~$100-500/month depending on scale

**Resources Provisioned**:

- VPC with public/private subnets
- ECS Fargate for containers
- RDS PostgreSQL
- S3 for recordings
- ALB for load balancing
- Route 53 for DNS
- ECR for container images

**Prerequisites**:

- AWS Account with CLI configured
- Terraform installed
- Domain name in Route 53
- S3 bucket for Terraform state

**Setup Steps**:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your configuration

terraform init
terraform workspace new production
terraform apply
```

See [Terraform README](terraform/README.md) for detailed instructions.

---

### Deployment Comparison

| Aspect | Coolify | AWS Terraform |
|--------|---------|---------------|
| Setup Complexity | Low | High |
| Monthly Cost | $20-50 | $100-500+ |
| Scalability | Good | Excellent |
| Maintenance | Minimal | More involved |
| Best For | Startups, small teams | Enterprise, high scale |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## API Usage

### Authentication

Create an API key from the dashboard or via API:

```bash
curl -X POST https://your-meeboter-instance/api/v1/api-keys \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "My App Key"}'
```

Use the API key in subsequent requests:

```bash
-H "x-api-key: YOUR_API_KEY"
```

---

### Deploy a Bot to a Meeting

```bash
curl -X POST https://your-meeboter-instance/api/v1/bots \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "botDisplayName": "Meeting Assistant",
    "callbackUrl": "https://your-app.com/webhook",
    "chatEnabled": true,
    "automaticLeave": {
      "waitingRoomTimeout": 300,
      "noOneJoinedTimeout": 300,
      "everyoneLeftTimeout": 60
    }
  }'
```

**Response**:

```json
{
  "id": 123,
  "status": "READY_TO_DEPLOY",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "botDisplayName": "Meeting Assistant"
}
```

---

### Send a Chat Message

```bash
curl -X POST https://your-meeboter-instance/api/v1/bots/123/chat \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from Meeboter!"}'
```

---

### Get Bot Events

```bash
curl https://your-meeboter-instance/api/v1/bots/123/events \
  -H "x-api-key: YOUR_API_KEY"
```

**Response**:

```json
{
  "events": [
    {"eventCode": "JOINING_CALL", "createdAt": "2025-01-15T10:00:00Z"},
    {"eventCode": "IN_CALL", "createdAt": "2025-01-15T10:00:15Z"},
    {"eventCode": "PARTICIPANT_JOIN", "data": {"participantId": "user1"}, "createdAt": "2025-01-15T10:01:00Z"}
  ]
}
```

---

### Webhook Events

When you provide a `callbackUrl`, Meeboter sends POST requests for bot events:

```json
{
  "botId": 123,
  "status": "DONE",
  "recordingUrl": "https://your-s3/recordings/123.mp4"
}
```

---

### TypeScript SDK (tRPC)

For TypeScript projects, use the type-safe tRPC client:

```typescript
import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '@meeboter/server';

const client = createTRPCClient<AppRouter>({
  url: 'https://your-meeboter-instance/api/trpc',
});

// Deploy a bot
const bot = await client.bots.create.mutate({
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  botDisplayName: 'Meeting Assistant',
});

// Send a message
await client.chat.sendMessageToBot.mutate({
  botId: bot.id,
  message: 'Hello everyone!',
});

// Get events
const events = await client.events.getEventsForBot.query({ botId: bot.id });
```

---

For complete API documentation, visit `/docs` on your Meeboter instance (Scalar/OpenAPI).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Configuration

### Environment Variables

#### Server Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `AUTH_SECRET` | Session signing secret (32+ chars) | Yes | - |
| `NEXT_PUBLIC_APP_ORIGIN_URL` | Public URL of your instance | Yes | - |

#### Authentication (GitHub OAuth)

| Variable | Description | Required |
|----------|-------------|----------|
| `AUTH_GITHUB_ID` | GitHub OAuth App Client ID | No |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Client Secret | No |

#### Storage (S3-Compatible)

| Variable | Description | Required |
|----------|-------------|----------|
| `S3_BUCKET` | Bucket name for recordings | Yes |
| `S3_REGION` | AWS region or 'auto' for MinIO | Yes |
| `S3_ACCESS_KEY_ID` | Access key | Yes |
| `S3_SECRET_ACCESS_KEY` | Secret key | Yes |
| `S3_ENDPOINT` | Custom endpoint for MinIO | No |

#### Coolify Integration (Production)

| Variable | Description | Required |
|----------|-------------|----------|
| `COOLIFY_API_URL` | Coolify API endpoint | Yes* |
| `COOLIFY_API_TOKEN` | Coolify API token | Yes* |
| `COOLIFY_PROJECT_UUID` | Project UUID for bot pool | Yes* |

*Required for production deployments with bot pool

---

### Bot Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `botDisplayName` | string | Name shown in meeting | "Meeboter" |
| `chatEnabled` | boolean | Allow chat interactions | true |
| `heartbeatInterval` | number | Health check interval (seconds) | 10 |
| `callbackUrl` | string | Webhook URL for events | null |

#### Automatic Leave Settings

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `waitingRoomTimeout` | number | Leave if stuck in waiting room (seconds) | 300 |
| `noOneJoinedTimeout` | number | Leave if meeting stays empty (seconds) | 300 |
| `everyoneLeftTimeout` | number | Leave after all participants leave (seconds) | 60 |
| `inactivityTimeout` | number | Leave after no activity (seconds) | null |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

### Project Structure

```
meeboter/
├── apps/
│   ├── server/              # Next.js 15 full-stack application
│   │   ├── src/
│   │   │   ├── app/         # Next.js pages and API routes
│   │   │   ├── server/
│   │   │   │   ├── api/     # tRPC routers
│   │   │   │   └── database/# Drizzle schema and queries
│   │   │   └── components/  # React components
│   │   └── ...
│   ├── bots/                # Bot orchestration engine
│   │   ├── src/             # Core bot logic
│   │   └── providers/       # Platform-specific implementations
│   │       ├── meet/        # Google Meet bot
│   │       ├── teams/       # Microsoft Teams bot
│   │       └── zoom/        # Zoom bot
│   └── lab/                 # Experimental environment
├── packages/
│   └── config-typescript/   # Shared TypeScript config
├── terraform/               # AWS Infrastructure as Code
└── docs/                    # Documentation
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Next.js 15, Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, tRPC 11 |
| Database | PostgreSQL, Drizzle ORM |
| Authentication | better-auth |
| Browser Automation | Playwright, Puppeteer |
| Video/Audio | FFmpeg, playwright-video |
| Infrastructure | Coolify, AWS, Terraform |
| Package Manager | Bun, Turborepo |

### Development Workflow

```bash
# Install dependencies
bun install

# Start database
docker compose up -d

# Run migrations
bun turbo db:migrate --filter=@meeboter/server

# Start development server
bun turbo dev --filter=@meeboter/server

# Run linting
bun run lint

# Run type checking
bun run typecheck

# Run tests
bun run test

# Build for production
bun run build
```

### Adding a New Meeting Platform

1. Create a new provider in `apps/bots/providers/<platform>/`
2. Implement the `Bot` interface from `apps/bots/src/bot.ts`
3. Add platform detection in the bot orchestrator
4. Add selectors and navigation logic for the platform UI
5. Test with the lab environment

### Database Migrations

```bash
# Generate a new migration
bun turbo db:generate --filter=@meeboter/server -- --name <migration_name>

# Apply migrations
bun turbo db:migrate --filter=@meeboter/server

# Open Drizzle Studio (database UI)
bun turbo db:studio --filter=@meeboter/server
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Community

- **GitHub Issues**: [Report bugs or request features](https://github.com/Payme-Works/meeboter/issues)
- **GitHub Discussions**: [Questions and ideas](https://github.com/Payme-Works/meeboter/discussions)

## Contributors

<a href="https://github.com/Payme-Works/meeboter/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Payme-Works/meeboter&max=10" alt="Contributors" width="200" />
</a>

## License

This project is licensed under the **MIT License**.

You are free to use, modify, and distribute this software for any purpose, commercial or non-commercial.

See [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/), [tRPC](https://trpc.io/), [Drizzle ORM](https://orm.drizzle.team/)
- Browser automation powered by [Playwright](https://playwright.dev/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<p align="center">
  <a href="https://meeboter.tech">Website</a> •
  <a href="https://github.com/Payme-Works/meeboter/issues">Issues</a> •
  <a href="https://github.com/Payme-Works/meeboter/discussions">Discussions</a>
</p>

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/Payme-Works/meeboter.svg?style=for-the-badge
[contributors-url]: https://github.com/Payme-Works/meeboter/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/Payme-Works/meeboter.svg?style=for-the-badge
[forks-url]: https://github.com/Payme-Works/meeboter/network/members
[stars-shield]: https://img.shields.io/github/stars/Payme-Works/meeboter.svg?style=for-the-badge
[stars-url]: https://github.com/Payme-Works/meeboter/stargazers
[issues-shield]: https://img.shields.io/github/issues/Payme-Works/meeboter.svg?style=for-the-badge
[issues-url]: https://github.com/Payme-Works/meeboter/issues
[license-shield]: https://img.shields.io/github/license/Payme-Works/meeboter.svg?style=for-the-badge
[license-url]: https://github.com/Payme-Works/meeboter/blob/master/LICENSE
