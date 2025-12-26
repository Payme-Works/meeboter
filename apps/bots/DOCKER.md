# Meeboter Docker Guide

This guide provides instructions for building meeting bot Docker images for Google Meet, Microsoft Teams, and Zoom platforms.

## Prerequisites

- Docker installed and running
- Sufficient disk space (4GB+ for meet bot, 1.7GB+ for microsoft-teams/zoom bots)

## Available Bot Images

### Google Meet Bot

- **Base Image**: Microsoft Playwright (Ubuntu-based)
- **Size**: ~4GB
- **Features**: Full Playwright browser automation, screen recording, audio processing

### Microsoft Teams Bot

- **Base Image**: Node.js 20 Alpine
- **Size**: ~1.7GB
- **Features**: Puppeteer automation, lightweight Alpine-based

### Zoom Bot

- **Base Image**: Node.js 20 Alpine
- **Size**: ~1.7GB
- **Features**: Puppeteer automation, lightweight Alpine-based

## Building Images

### Build All Bots

```bash
# From the apps/bots directory
cd apps/bots

# Build Google Meet bot
docker build -f providers/google-meet/Dockerfile -t meeboter-google-meet .

# Build Microsoft Teams bot
docker build -f providers/microsoft-teams/Dockerfile -t meeboter-microsoft-teams-bot .

# Build Zoom bot
docker build -f providers/zoom/Dockerfile -t meeboter-zoom .
```

### Multi-Platform Builds

All Dockerfiles are configured for automatic platform detection and will build native images for your architecture (ARM64 or AMD64).

## Bot Configuration

Bots fetch their configuration from the Milo API on startup. The identifier depends on the deployment platform.

### Required Environment Variables

```bash
# Bot identification (one required)
BOT_ID="123"                        # For K8s/AWS ECS ephemeral deployments
# OR
POOL_SLOT_UUID="coolify-uuid"       # For Coolify pool-based deployments

# Milo API URL for all tRPC calls
MILO_URL="https://meeboter.yourdomain.com"

# Authentication token for API calls
MILO_AUTH_TOKEN="your-auth-token"

# S3-compatible storage
S3_ENDPOINT="https://s3.amazonaws.com"
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"
S3_BUCKET_NAME="your-bucket"
S3_REGION="us-east-1"

# Runtime
NODE_ENV="production"
```

### How It Works

| Platform | Identifier | API Endpoint |
|----------|------------|--------------|
| Kubernetes/AWS ECS | `BOT_ID` | `bots.getConfig` |
| Coolify (pool-based) | `POOL_SLOT_UUID` | `bots.pool.getSlot` |

This pattern ensures:
- No stale configuration from cached container builds
- Dynamic configuration without container rebuilds
- Consistent behavior across all deployment platforms

## Troubleshooting

### Common Issues

1. **Module not found errors**: Ensure all dependencies are properly installed during build
2. **Platform warnings**: Images are now multi-platform compatible and will automatically use the correct architecture
3. **Browser launch failures**: Meet bot requires `DISPLAY=:99` environment variable for virtual display
4. **Permission errors**: All bots run as non-root users for security

### Build Logs

To see detailed build logs:

```bash
docker build -f providers/google-meet/Dockerfile -t meeboter-google-meet . --progress=plain
```

### Container Debugging

To debug a running container:

```bash
# Get container ID
docker ps

# Execute shell in running container
docker exec -it <container-id> /bin/bash

# View logs
docker logs <container-id>
```

## Architecture Support

All Docker images support both AMD64 and ARM64 architectures:

- **AMD64**: Intel/AMD processors, AWS ECS, most cloud providers
- **ARM64**: Apple Silicon (M1/M2), AWS Graviton, ARM-based servers

Images automatically build for the host architecture without any platform-specific configuration.

## Security

- All bots run as non-root users
- No hardcoded secrets or credentials
- Environment variables used for sensitive configuration
- Bot config fetched dynamically from API (not baked into image)
- Minimal attack surface with distroless/alpine base images where possible

## Performance

- **Google Meet**: ~4GB RAM, high CPU (video processing)
- **Teams/Zoom**: ~1GB RAM, moderate CPU (lighter automation)
- **Network**: Depends on video quality and recording settings
