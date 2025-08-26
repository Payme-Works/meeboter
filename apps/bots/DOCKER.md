# Live Boost Docker Guide

This guide provides instructions for building and running meeting bot Docker images for Google Meet, Microsoft Teams, and Zoom platforms.

## Prerequisites

- Docker installed and running
- Sufficient disk space (4GB+ for meet bot, 1.7GB+ for teams/zoom bots)
- Required environment variables configured

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
docker build -f providers/meet/Dockerfile -t live-boost-meet .

# Build Microsoft Teams bot
docker build -f providers/teams/Dockerfile -t live-boost-teams .

# Build Zoom bot
docker build -f providers/zoom/Dockerfile -t live-boost-zoom .
```

### Multi-Platform Builds
All Dockerfiles are configured for automatic platform detection and will build native images for your architecture (ARM64 or AMD64).

## Running Bots

### Required Environment Variables

All bots require these environment variables:

```bash
# Bot configuration (JSON string)
BOT_DATA='{"id":1,"userId":"user-id","meetingInfo":{"platform":"google|teams|zoom","meetingUrl":"meeting-url"},"meetingTitle":"Meeting Title","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Bot Name","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}'

# AWS configuration
AWS_BUCKET_NAME="your-s3-bucket"
AWS_REGION="us-east-1"

# Node environment
NODE_ENV="development"
```

### Google Meet Bot

```bash
docker run --rm \\
  -e DISPLAY=:99 \\
  -e NODE_ENV=development \\
  -e BOT_DATA='{"id":1,"userId":"user-id","meetingInfo":{"platform":"google","meetingUrl":"https://meet.google.com/abc-defg-hij"},"meetingTitle":"Test Meeting","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test Bot","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' \\
  -e AWS_BUCKET_NAME="your-bucket" \\
  -e AWS_REGION="us-east-1" \\
  live-boost-meet
```

### Microsoft Teams Bot

```bash
docker run --rm \\
  -e NODE_ENV=development \\
  -e BOT_DATA='{"id":1,"userId":"user-id","meetingInfo":{"platform":"teams","meetingUrl":"https://teams.microsoft.com/l/meetup-join/..."},"meetingTitle":"Test Meeting","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test Bot","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' \\
  -e AWS_BUCKET_NAME="your-bucket" \\
  -e AWS_REGION="us-east-1" \\
  live-boost-teams
```

### Zoom Bot

```bash
docker run --rm \\
  -e NODE_ENV=development \\
  -e BOT_DATA='{"id":1,"userId":"user-id","meetingInfo":{"platform":"zoom","meetingUrl":"https://zoom.us/j/123456789"},"meetingTitle":"Test Meeting","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test Bot","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' \\
  -e AWS_BUCKET_NAME="your-bucket" \\
  -e AWS_REGION="us-east-1" \\
  live-boost-zoom
```

## BOT_DATA Configuration

The `BOT_DATA` environment variable must be a JSON string with the following structure:

```json
{
  "id": 1,
  "userId": "unique-user-id",
  "meetingInfo": {
    "platform": "google|teams|zoom",
    "meetingUrl": "https://...",
    "meetingId": "optional-meeting-id",
    "meetingPassword": "optional-password"
  },
  "meetingTitle": "Meeting Title",
  "startTime": "2025-01-01T00:00:00Z",
  "endTime": "2025-01-01T01:00:00Z",
  "botDisplayName": "Bot Display Name",
  "heartbeatInterval": 10000,
  "automaticLeave": {
    "waitingRoomTimeout": 3600000,
    "noOneJoinedTimeout": 3600000,
    "everyoneLeftTimeout": 3600000,
    "inactivityTimeout": 3600000
  },
  "recordingEnabled": false,
  "callbackUrl": "optional-webhook-url"
}
```

### Platform-Specific meetingInfo

#### Google Meet
```json
"meetingInfo": {
  "platform": "google",
  "meetingUrl": "https://meet.google.com/abc-defg-hij"
}
```

#### Microsoft Teams
```json
"meetingInfo": {
  "platform": "teams",
  "meetingUrl": "https://teams.microsoft.com/l/meetup-join/...",
  "meetingId": "meeting-id",
  "organizerId": "organizer-id",
  "tenantId": "tenant-id"
}
```

#### Zoom
```json
"meetingInfo": {
  "platform": "zoom",
  "meetingUrl": "https://zoom.us/j/123456789?pwd=password",
  "meetingId": "123456789",
  "meetingPassword": "optional-password"
}
```

## Testing

### Quick Test Commands

```bash
# Test Google Meet bot (10 second run)
docker run --rm -e DISPLAY=:99 -e NODE_ENV=development -e BOT_DATA='{"id":1,"userId":"test","meetingInfo":{"platform":"google","meetingUrl":"https://meet.google.com/test"},"meetingTitle":"Test","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' -e AWS_BUCKET_NAME="test" -e AWS_REGION="us-east-1" live-boost-meet & sleep 10 && docker kill $(docker ps -q --filter ancestor=live-boost-meet) 2>/dev/null

# Test Teams bot (8 second run)
docker run --rm -e NODE_ENV=development -e BOT_DATA='{"id":1,"userId":"test","meetingInfo":{"platform":"teams","meetingUrl":"https://teams.microsoft.com/test"},"meetingTitle":"Test","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' -e AWS_BUCKET_NAME="test" -e AWS_REGION="us-east-1" live-boost-teams & sleep 8 && docker kill $(docker ps -q --filter ancestor=live-boost-teams) 2>/dev/null

# Test Zoom bot (8 second run)
docker run --rm -e NODE_ENV=development -e BOT_DATA='{"id":1,"userId":"test","meetingInfo":{"platform":"zoom","meetingUrl":"https://zoom.us/j/123456789"},"meetingTitle":"Test","startTime":"2025-01-01T00:00:00Z","endTime":"2025-01-01T01:00:00Z","botDisplayName":"Test","heartbeatInterval":10000,"automaticLeave":{"waitingRoomTimeout":3600000,"noOneJoinedTimeout":3600000,"everyoneLeftTimeout":3600000,"inactivityTimeout":3600000},"recordingEnabled":false}' -e AWS_BUCKET_NAME="test" -e AWS_REGION="us-east-1" live-boost-zoom & sleep 8 && docker kill $(docker ps -q --filter ancestor=live-boost-zoom) 2>/dev/null
```

## Troubleshooting

### Common Issues

1. **Module not found errors**: Ensure all dependencies are properly installed during build
2. **Platform warnings**: Images are now multi-platform compatible and will automatically use the correct architecture
3. **Browser launch failures**: Meet bot requires `DISPLAY=:99` environment variable for virtual display
4. **Permission errors**: All bots run as non-root users for security

### Build Logs

To see detailed build logs:
```bash
docker build -f providers/meet/Dockerfile -t live-boost-meet . --progress=plain
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
- ✅ **AMD64**: Intel/AMD processors, AWS ECS, most cloud providers
- ✅ **ARM64**: Apple Silicon (M1/M2), AWS Graviton, ARM-based servers

Images automatically build for the host architecture without any platform-specific configuration.

## Security

- All bots run as non-root users
- No hardcoded secrets or credentials
- Environment variables used for configuration
- Minimal attack surface with distroless/alpine base images where possible

## Performance

- **Google Meet**: ~4GB RAM, high CPU (video processing)
- **Teams/Zoom**: ~1GB RAM, moderate CPU (lighter automation)
- **Network**: Depends on video quality and recording settings