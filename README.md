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

| Platform | Model | Cost | Best For |
|----------|-------|------|----------|
| **[Coolify](docs/DEPLOYMENT.md#coolify-deployment)** | Pool-based | ~$50-90/mo | Self-hosted, predictable workloads |
| **[Kubernetes](docs/DEPLOYMENT.md#kubernetes-deployment)** | Pod-based | ~$60-200/mo | Existing K8s, multi-cloud |
| **[AWS ECS](docs/DEPLOYMENT.md#aws-ecs-deployment)** | Task-based | ~$80-500/mo | Auto-scaling, pay-per-use |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for setup guides and [ARCHITECTURE.md](ARCHITECTURE.md) for detailed cost analysis.

<br />

## Architecture

```
Your App → Meeboter API → Platform Service → Meeting Platforms
                ↓               ↓
           PostgreSQL    S3 (recordings)
```

**Tech Stack:**

\- **API:** Next.js 15, tRPC, Drizzle ORM<br>
\- **Bots:** Playwright (Meet), Puppeteer (Teams/Zoom), FFmpeg<br>
\- **Database:** PostgreSQL 15<br>
\- **Storage:** S3-compatible (MinIO, AWS S3)<br>
\- **Runtime:** Bun + Alpine Linux (ARM64/x86)

**Multi-Platform Deployment:**

| Platform | Model | Deploy Time | Cost Model |
|----------|-------|-------------|------------|
| Coolify | Pool-based | ~30s | Fixed server |
| Kubernetes | Pod-based | ~30-60s | Fixed cluster |
| AWS ECS | Task-based | ~60-90s | Pay-per-use |

**Hybrid Mode** — Automatic failover across platforms with `PLATFORM_PRIORITY` configuration.

<details>
<summary><strong>Reference Architecture: Proxmox + Coolify + AWS</strong></summary>

<br />

```
+-------------------------------------------------------------------------+
|                      PROXMOX HOST (bare-metal)                          |
|                                                                         |
|  +-----------------------------+                                        |
|  |     CT 100: Coolify         |                                        |
|  |                             |                                        |
|  |  +-----------------------+  |     +--------------------------------+ |
|  |  | Milo API (Next.js)    |--+---->|        AWS ECS Cluster         | |
|  |  | Port 3000             |  |     |                                | |
|  |  +-----------+-----------+  |     |  +------+ +------+ +------+    | |
|  |              |              |     |  |Task A| |Task B| |Task C|    | |
|  |  +-----------+-----------+  |     |  | Done | | Done | | Run  |    | |
|  |  | PostgreSQL | MinIO    |  |     |  +------+ +------+ +------+    | |
|  |  +-----------------------+  |     |                                | |
|  |                             |     |  Fargate Spot (90%) + ARM64    | |
|  |  +-----------------------+  |     |  0.5 vCPU / 2 GB per task      | |
|  |  | Bot Pool (20 slots)   |  |     |  Up to 100 concurrent bots     | |
|  |  | ~30s deploy time      |  |     +--------------------------------+ |
|  |  +-----------------------+  |                                        |
|  +-----------------------------+                                        |
+-------------------------------------------------------------------------+
```

**Cost Breakdown:**
\- Proxmox server (Hetzner AX52): ~$80/mo<br>
\- AWS ECS (500 bots/day, 45 min avg): ~$100/mo<br>
\- **Total: ~$180/mo** for hybrid setup with overflow capacity

</details>

<br />

## Project Structure

```
meeboter/
├── apps/
│   ├── milo/                    # API server (Next.js + tRPC)
│   │   ├── src/server/api/      # tRPC routers and services
│   │   └── drizzle/             # Database migrations
│   └── bots/                    # Bot engine
│       └── providers/
│           ├── Dockerfile       # Shared base image
│           ├── google-meet/     # Playwright-based
│           ├── microsoft-teams/ # Puppeteer-based
│           └── zoom/            # Puppeteer-based
├── terraform/
│   └── bots/                    # AWS ECS Fargate infrastructure
├── packages/                    # Shared packages
└── docs/                        # Documentation
```

<br />

## Documentation

\- **[ARCHITECTURE.md](ARCHITECTURE.md):** System design and cost analysis<br>
\- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md):** Platform deployment guides<br>
\- **[apps/milo/README.md](apps/milo/README.md):** API server documentation<br>
\- **[apps/bots/ARCHITECTURE.md](apps/bots/ARCHITECTURE.md):** Bot engine and AWS infrastructure<br>
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
