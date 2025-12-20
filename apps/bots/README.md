# Bot Scripts

This directory serves as the central hub for the bot implementations, which are designed to automate the process of joining and recording virtual meetings across various platforms.

Each bot is responsible for executing the following key tasks:

- **Launching a Browser**: Initiating a browser instance to interact with the meeting platform.
- **Navigating to the Meeting**: Accessing the meeting URL or ID provided in the configuration.
- **Authenticating and Setting Identity**: Entering the required credentials and setting the bot's display name.
- **Joining the Meeting**: Successfully connecting to the meeting session.
- **Recording the Meeting**: Capturing the meeting's audio and/or video content.
- **Uploading the Recording**: Transferring the recorded content to a designated storage location upon completion.
- **Notifying the Backend**: Sending updates to the backend system to reflect the recording status and other relevant details.

These bots are integral to the Meeboter application, ensuring seamless and automated meeting recording functionality across supported platforms.

## File Structure

```
src/bots/
├── .env.example            # Example environment template file
├── package.json            # Global dependencies
├── package.json            # Workspace configuration
├── tsconfig.json           # Global ts configurations
├── jest.config.js          # Jest configuration for tests

├── src/
│   ├── index.ts          ! # Main script -- You'll want to look here first!!
│   ├── bot.ts              # Bot related classes and functions
│   ├── monitoring.ts       # Monitoring methods used by main script
│   ├── trpc.ts             # trpc client

├── microsoft-teams|zoom|google-meet/
│   ├── Dockerfile          # Bot-specific docker file
│   ├── package.json        # Bot-specific dependencies
│   ├── bun.lock
│   ├── tsconfig.json       # Bot-specific ts configurations
│   ├── src/
│   │   ├── bot.ts          # Platform-specific bot class

├── __mocks__/              # Mock implementations for classes
├── tests/                  # Jest test files
```

## Environment

Refer to the `.env.example` file for the required environment variables. Duplicate this file and rename it to `.env`. This `.env` file will be utilized by the application during execution.

### How Configuration Works

Bots fetch their configuration dynamically from the Milo API using `POOL_SLOT_UUID`. This pattern avoids issues with stale environment variables in containerized deployments.

**Startup flow:**
1. Bot container starts with `POOL_SLOT_UUID` and `MILO_URL` environment variables
2. Bot calls `getPoolSlot` API endpoint to fetch configuration (meeting details, timeouts, recording settings)
3. Bot uses `MILO_URL` env var for all tRPC API calls

This ensures:
- No stale configuration from cached container builds
- Dynamic configuration without container rebuilds
- Consistent behavior across Coolify, AWS ECS, and local development

### Required Environment Variables

```bash
# Pool slot identifier (used to fetch bot config from API)
POOL_SLOT_UUID="your-pool-slot-uuid"

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

### Meeting Info Structure

The `meeting_info` object is stored in the bot configuration (fetched from API) and contains platform-specific meeting information.

### Zoom

```json
{
  "meeting_info": {
    "platform": "zoom",
    "meetingId": "<MEETING_ID>",
    "meetingPassword": "<MEETING_PASSWORD>"
  }
}
```

### Google Meet

```json
{
  "meeting_info": {
    "platform": "google",
    "meetingUrl": "<MEETING_LINK>"
  }
}
```

Where Meeting Link is the full URL to the meeting.

### Microsoft Teams

```json
{
  "meeting_info": {
    "platform": "microsoft-teams",
    "meetingId": "<MEETING_ID>",
    "organizerId": "<ORGANIZER_ID>",
    "tenantId": "<TENANT_ID>"
  }
}
```

## Local Testing

The following code is used to run the bots locally in your own environment. Bot code should work as intended on your environment, but we make no guarentees about this. Instead, you should aim to test and develop your code in the docker environment.

```bash
cd apps/bots
bun install
bun run dev
```

## Building

This section provides instructions for building the Docker images required for the Meeboter application.
The code below outlines the necessary steps and configurations to create containerized environments
for deploying the bot services.

Ensure that [Docker](https://www.docker.com/) is installed and properly configured on your system before proceeding with the build process.

```bash
cd src/bots
docker build -f providers/google-meet/Dockerfile -t meeboter-google-meet-bot .
docker build -f providers/microsoft-teams/Dockerfile -t meeboter-microsoft-teams-bot .
docker build -f providers/zoom/Dockerfile -t meeboter-zoom-bot .
```

The above commands will build the three docker images of the bots.

# Running

To run your docker file, ensure you have created your `.env` file as described in an earlier section.
Ensure that the `.env` file and docker image you are running are configured for the same platform (either `google-meet | microsoft-teams | zoom`).

```bash
docker run --env-file .env <PLATFORM>
```

Where `<PLATFORM>` is one of either `meeboter-google-meet-bot | meeboter-microsoft-teams-bot | meeboter-zoom-bot`.

### Build Issues

If you get an strange erorr while running (eg. Browser not found at file specified), upgrade puppeteer to the latest version in the specific platform's `node_modules` folder.

```bash
cd apps/bots/providers/zoom
bun install puppeteer@latest
```
