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

- **Chat** — Send messages programmatically
- **Recording** — Capture audio/video to S3
- **Events** — Real-time participant tracking via webhooks
- **Fast deployment** — Bot pool system: ~30s vs 7+ min cold start

**Two ways to use it:**

<table width="100%">
  <tr>
    <th></th>
    <th>Dashboard</th>
    <th>API</th>
  </tr>
  <tr>
    <td><strong>For</strong></td>
    <td>Manual operations, testing, monitoring</td>
    <td>Programmatic automation</td>
  </tr>
  <tr>
    <td><strong>Deploy bots</strong></td>
    <td>Click-to-deploy UI</td>
    <td>REST/tRPC endpoints</td>
  </tr>
  <tr>
    <td><strong>Monitor</strong></td>
    <td>Real-time status, logs, events</td>
    <td>Webhooks, polling</td>
  </tr>
  <tr>
    <td><strong>Best for</strong></td>
    <td>Ops teams, debugging, demos</td>
    <td>Product integrations</td>
  </tr>
</table>

<br />

## Platform Support

<table width="100%">
  <tr>
    <th>Platform</th>
    <th>Chat</th>
    <th>Recording</th>
    <th>Participants</th>
  </tr>
  <tr>
    <td>Google Meet</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
  </tr>
  <tr>
    <td>Microsoft Teams</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
  </tr>
  <tr>
    <td>Zoom</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
    <td align="center">✓</td>
  </tr>
</table>

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

<table width="100%">
<tr>
<td width="50%" valign="top">

### Dashboard

1. Open the web UI at `localhost:3000`
2. Navigate to **Bots** → **New Bot**
3. Paste meeting URL, configure options
4. Click **Deploy**
5. Monitor status, logs, and events in real-time

</td>
<td width="50%" valign="top">

### API

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

</td>
</tr>
</table>

<br />

## Deployment Options

<table width="100%">
  <tr>
    <th>Platform</th>
    <th>Model</th>
    <th>Cost</th>
    <th>Best for</th>
  </tr>
  <tr>
    <td><a href="DEPLOYMENT.md#coolify-deployment-pool-based">Coolify</a></td>
    <td>Pool-based</td>
    <td>~$20-50/mo</td>
    <td>Self-hosted, simple setup</td>
  </tr>
  <tr>
    <td><a href="DEPLOYMENT.md#kubernetes-deployment-pod-based">Kubernetes</a></td>
    <td>Pod-based</td>
    <td>~$50-200/mo</td>
    <td>Existing K8s infrastructure</td>
  </tr>
  <tr>
    <td><a href="DEPLOYMENT.md#aws-ecs-deployment-task-based">AWS ECS</a></td>
    <td>Task-based</td>
    <td>~$100-500/mo</td>
    <td>Enterprise, auto-scaling</td>
  </tr>
</table>

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed setup guides.

<br />

## Architecture

```
Your App → Meeboter API → Bot Pool → Meeting Platforms
                ↓              ↓
           PostgreSQL    S3 (recordings)
```

<table width="100%">
  <tr>
    <th>Layer</th>
    <th>Tech</th>
  </tr>
  <tr>
    <td>API</td>
    <td>Next.js 15, tRPC, Drizzle ORM</td>
  </tr>
  <tr>
    <td>Bots</td>
    <td>Playwright (Meet), Puppeteer (Teams/Zoom), FFmpeg</td>
  </tr>
  <tr>
    <td>Database</td>
    <td>PostgreSQL</td>
  </tr>
  <tr>
    <td>Storage</td>
    <td>S3-compatible (MinIO, AWS S3)</td>
  </tr>
</table>

<br />

**Platform Abstraction** — Deploy bots to any backend:

<table width="100%">
  <tr>
    <th>Platform</th>
    <th>Model</th>
    <th>How it works</th>
  </tr>
  <tr>
    <td>Coolify</td>
    <td>Pool-based</td>
    <td>Pre-provisioned Docker containers, reused across meetings</td>
  </tr>
  <tr>
    <td>Kubernetes</td>
    <td>Job-based</td>
    <td>Ephemeral pods created per meeting, auto-cleanup</td>
  </tr>
  <tr>
    <td>AWS ECS</td>
    <td>Task-based</td>
    <td>Fargate tasks on-demand, pay-per-use</td>
  </tr>
</table>

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

- **Proxmox** — Bare-metal hypervisor running containers and VMs
- **Coolify (CT 100)** — Hosts Milo API, PostgreSQL, MinIO, and Docker bot pool
- **K3s (VM 102)** — Lightweight Kubernetes for ephemeral bot jobs (40-80 concurrent)

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

- [DEPLOYMENT.md](DEPLOYMENT.md) — Deployment guides
- [ARCHITECTURE.md](ARCHITECTURE.md) — System design
- [apps/milo/README.md](apps/milo/README.md) — API server docs
- [apps/bots/README.md](apps/bots/README.md) — Bot engine docs
- [API Docs](http://localhost:3000/docs) — OpenAPI/Scalar (when running)

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
