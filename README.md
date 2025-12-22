<div align="center">
  <img src="https://raw.githubusercontent.com/Payme-Works/meeboter/refs/heads/bare-metal/apps/milo/public/logo.svg" alt="Meeboter" width="64" height="64">
  <h1>Meeboter</h1>
  <p>Deploy bots to Google Meet, Teams, and Zoom. Your servers, your data.</p>

  <br />

  [![MIT License](https://img.shields.io/github/license/Payme-Works/meeboter?style=flat-square)](LICENSE)
  [![Contributors](https://img.shields.io/github/contributors/Payme-Works/meeboter?style=flat-square)](https://github.com/Payme-Works/meeboter/graphs/contributors)
  [![Stars](https://img.shields.io/github/stars/Payme-Works/meeboter?style=flat-square)](https://github.com/Payme-Works/meeboter/stargazers)

</div>

<br />

## What it does

Meeboter joins video meetings as a bot participant, enabling:

\- **Chat:** Send messages programmatically<br>
\- **Recording:** Capture audio/video to S3<br>
\- **Events:** Real-time participant tracking via webhooks<br>
\- **Fast deployment:** Bot pool system: ~30s vs 7+ min cold start

**Supports:** Google Meet, Microsoft Teams, and Zoom (chat, recording, participant tracking)

<br />

## Quick Start

```bash
git clone https://github.com/Payme-Works/meeboter.git
cd meeboter
bun install
docker compose up -d
cp apps/milo/.env.example apps/milo/.env
bun turbo db:migrate --filter=@meeboter/milo
bun turbo dev --filter=@meeboter/milo
```

Open [localhost:3000](http://localhost:3000)

<br />

## Usage

### Dashboard

For manual operations, testing, and monitoring:

1. Open the web UI at `localhost:3000`
2. Navigate to **Bots** → **New Bot**
3. Paste meeting URL, configure options
4. Click **Deploy**
5. Monitor status, logs, and events in real-time

### API

For programmatic automation and product integrations:

```bash
# Create a bot
POST /bots
{"meetingUrl": "https://meet.google.com/xxx"}

# Deploy it
POST /bots/{id}/deploy

# Send chat message
POST /chat/messages
{"botId": 123, "message": "Hello!"}

# Get events
GET /events/bot/{botId}
```

[OpenAPI docs →](/docs)

<br />

## Deployment

\- **[Coolify](DEPLOYMENT.md#coolify-deployment-pool-based):** Pool-based, ~$20-50/mo, self-hosted<br>
\- **[Kubernetes](DEPLOYMENT.md#kubernetes-deployment-pod-based):** Pod-based, ~$50-200/mo, existing K8s<br>
\- **[AWS ECS](DEPLOYMENT.md#aws-ecs-deployment-task-based):** Task-based, ~$100-500/mo, enterprise

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup guides.

<br />

## Architecture

```
Your App → Meeboter API → Bot Pool → Meeting Platforms
                ↓              ↓
           PostgreSQL    S3 (recordings)
```

**Tech Stack:**

\- **API:** Next.js 15, tRPC, Drizzle ORM<br>
\- **Bots:** Playwright (Meet), Puppeteer (Teams/Zoom), FFmpeg<br>
\- **Database:** PostgreSQL<br>
\- **Storage:** S3-compatible (MinIO, AWS S3)

**Platform Abstraction** — Deploy bots to any backend:

\- **Coolify:** Pre-provisioned Docker containers, reused across meetings<br>
\- **Kubernetes:** Ephemeral pods created per meeting, auto-cleanup<br>
\- **AWS ECS:** Fargate tasks on-demand, pay-per-use

<details>
<summary><strong>Example: Our Proxmox + Coolify + K3s Setup</strong></summary>

<br />

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         PROXMOX HOST (bare-metal)                             │
│                                                                               │
│  ┌─────────────────────────┐     ┌─────────────────────────────────────────┐ │
│  │ CT 100: Coolify         │     │ VM 102: K3s Cluster                     │ │
│  │                         │     │                                         │ │
│  │  ┌───────────────────┐  │     │  ┌─────────────────────────────────┐   │ │
│  │  │ Milo API Server   │◄─┼─────┼──│ namespace: meeboter              │   │ │
│  │  │ (Next.js + tRPC)  │  │     │  │                                 │   │ │
│  │  └────────┬──────────┘  │     │  │  ┌─────┐ ┌─────┐ ┌─────┐       │   │ │
│  │           │             │     │  │  │ Bot │ │ Bot │ │ Bot │ ...   │   │ │
│  │  ┌────────┴──────────┐  │     │  │  └─────┘ └─────┘ └─────┘       │   │ │
│  │  │ PostgreSQL        │  │     │  └─────────────────────────────────┘   │ │
│  │  │ MinIO (S3)        │  │     │                                         │ │
│  │  │ Bot Pool (Docker) │  │     │  Ephemeral Jobs per meeting             │ │
│  │  └───────────────────┘  │     │  40-80 concurrent bots                  │ │
│  └─────────────────────────┘     └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

\- **Proxmox:** Bare-metal hypervisor running containers and VMs<br>
\- **Coolify (CT 100):** Hosts Milo API, PostgreSQL, MinIO, and Docker bot pool<br>
\- **K3s (VM 102):** Lightweight Kubernetes for ephemeral bot jobs (40-80 concurrent)

</details>

<br />

## Project Structure

```
meeboter/
├── apps/
│   ├── milo/           # API server (Next.js)
│   └── bots/           # Bot engine
│       └── providers/
│           ├── google-meet/
│           ├── microsoft-teams/
│           └── zoom/
├── terraform/          # AWS IaC
└── docs/
```

<br />

## Documentation

\- **[DEPLOYMENT.md](DEPLOYMENT.md):** Deployment guides<br>
\- **[ARCHITECTURE.md](ARCHITECTURE.md):** System design<br>
\- **[apps/milo/README.md](apps/milo/README.md):** API server docs<br>
\- **[apps/bots/README.md](apps/bots/README.md):** Bot engine docs<br>
\- **[API Docs](http://localhost:3000/docs):** OpenAPI/Scalar (when running)

<br />

## Contributing

```bash
bun install
bun turbo dev --filter=@meeboter/milo
bun run lint
bun run typecheck
bun run test
```

<br />

## License

MIT — use it however you want.

<br />

---

<div align="center">
  <sub>Built with Next.js, tRPC, Playwright, and shadcn/ui</sub>
</div>
