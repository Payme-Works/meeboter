# Deployment Guide

This guide covers deploying Meeboter bots using either Coolify (pool-based) or AWS ECS (task-based) deployment strategies.

## Platform Selection

Meeboter supports two deployment platforms:

| Platform | Model | Best For |
|----------|-------|----------|
| **Coolify** | Pool-based | Self-hosted, bare-metal, cost-efficient at scale |
| **AWS ECS** | Task-based | Cloud-native, auto-scaling, pay-per-use |

### Auto-Detection

By default (`DEPLOYMENT_PLATFORM=auto`), Meeboter detects the platform based on available environment variables:

1. If `COOLIFY_API_URL` and `COOLIFY_API_TOKEN` are set → Uses Coolify
2. If `AWS_REGION` and `ECS_CLUSTER` are set → Uses AWS ECS
3. If both are configured → Coolify takes precedence (explicit selection recommended)

### Explicit Selection

Set `DEPLOYMENT_PLATFORM` to explicitly choose:

```bash
DEPLOYMENT_PLATFORM="coolify"  # Force Coolify platform
DEPLOYMENT_PLATFORM="aws"      # Force AWS ECS platform
DEPLOYMENT_PLATFORM="auto"     # Auto-detect (default)
```

---

## Coolify Deployment (Pool-Based)

Coolify deployment uses a pre-provisioned pool of bot containers. When a meeting is scheduled, an idle container is configured and started. After the meeting ends, the container returns to the pool.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Coolify Server                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ Slot 1  │ │ Slot 2  │ │ Slot 3  │ │ Slot N  │          │
│  │ (idle)  │ │ (busy)  │ │ (idle)  │ │ (idle)  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Prerequisites

1. **Coolify Instance**: Self-hosted Coolify installation
2. **Docker Registry Access**: GHCR or private registry with bot images
3. **PostgreSQL Database**: For Meeboter API state

### Environment Variables

```bash
# Platform Selection
DEPLOYMENT_PLATFORM="coolify"

# Coolify API Configuration
COOLIFY_API_URL="https://coolify.example.com/api/v1"
COOLIFY_API_TOKEN="your-coolify-api-token"

# Coolify Resource IDs
COOLIFY_PROJECT_UUID="your-project-uuid"
COOLIFY_SERVER_UUID="your-server-uuid"
COOLIFY_ENVIRONMENT_NAME="production"
COOLIFY_DESTINATION_UUID="your-destination-uuid"

# Bot Images (GitHub Container Registry)
GHCR_ORG="your-github-org"
MILO_AUTH_TOKEN="your-milo-auth-token"
```

### Getting Coolify UUIDs

1. **API Token**: Settings → API Tokens → Create new token
2. **Project UUID**: Projects → Select project → Copy UUID from URL
3. **Server UUID**: Servers → Select server → Copy UUID from URL
4. **Destination UUID**: Servers → Select server → Destinations → Copy UUID

### Pool Configuration

The pool automatically scales based on demand:

- **Minimum Slots**: Pool maintains at least 1 idle slot
- **Maximum Slots**: Limited by Coolify server resources
- **Queue System**: Requests queue when all slots are busy
- **Recovery**: Failed slots are automatically recovered or replaced

### Pool Management Endpoints

```bash
# Get pool statistics
GET /api/bots/pool-stats

# Response
{
  "total": 5,
  "idle": 3,
  "busy": 2,
  "error": 0,
  "queueLength": 0
}
```

---

## AWS ECS Deployment (Task-Based)

AWS ECS deployment creates ephemeral Fargate tasks for each meeting. Tasks are created on-demand and terminated after the meeting ends.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       AWS ECS Cluster                        │
│                                                              │
│   Meeting 1 → [Task A] ──────────────────────→ Terminated   │
│   Meeting 2 → [Task B] ────────────────→ Terminated         │
│   Meeting 3 → [Task C] ──→ Running...                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Prerequisites

1. **AWS Account**: With ECS, ECR, and VPC configured
2. **ECS Cluster**: Fargate-enabled cluster
3. **Task Definitions**: One per meeting platform (Zoom, Teams, Meet)
4. **IAM Roles**: Task execution role with ECR pull permissions
5. **VPC Configuration**: Subnets and security groups

### Environment Variables

```bash
# Platform Selection
DEPLOYMENT_PLATFORM="aws"

# AWS Configuration
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"        # Or use IAM roles
AWS_SECRET_ACCESS_KEY="your-secret-key"    # Or use IAM roles

# ECS Configuration
ECS_CLUSTER="meeboter-cluster"
ECS_SUBNETS="subnet-xxx,subnet-yyy"
ECS_SECURITY_GROUPS="sg-xxx"
ECS_ASSIGN_PUBLIC_IP="true"

# Task Definitions (family:revision or just family for latest)
ECS_TASK_DEF_ZOOM="meeboter-zoom-bot:1"
ECS_TASK_DEF_MICROSOFT_TEAMS="meeboter-microsoft-teams-bot:1"
ECS_TASK_DEF_GOOGLE_MEET="meeboter-google-meet-bot:1"

# Bot Configuration
MILO_AUTH_TOKEN="your-milo-auth-token"
```

### Task Definition Setup

Create ECS task definitions for each meeting platform. Example for Zoom:

```json
{
  "family": "meeboter-zoom-bot",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "zoom-bot",
      "image": "ghcr.io/your-org/meeboter-zoom-bot:latest",
      "essential": true,
      "environment": [
        {"name": "BOT_TYPE", "value": "zoom"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/meeboter-zoom-bot",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### VPC and Security Group Configuration

**Subnets**: Use private subnets with NAT gateway, or public subnets with auto-assign public IP enabled.

**Security Group Rules**:
```
Outbound:
- All traffic to 0.0.0.0/0 (for meeting connections)

Inbound:
- None required (bots initiate all connections)
```

### IAM Permissions

The Meeboter API needs permissions to manage ECS tasks:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RunTask",
        "ecs:StopTask",
        "ecs:DescribeTasks"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole"
    }
  ]
}
```

---

## Bot Image Configuration

Both platforms require bot container images. Meeboter supports:

- **Zoom Bot**: `ghcr.io/{org}/meeboter-zoom-bot:{tag}`
- **Microsoft Teams Bot**: `ghcr.io/{org}/meeboter-microsoft-teams-bot:{tag}`
- **Meet Bot**: `ghcr.io/{org}/meeboter-google-meet-bot:{tag}`

### Environment Variables Passed to Bots

| Variable | Description |
|----------|-------------|
| `BOT_ID` | Unique bot identifier |
| `MEETING_URL` | Meeting URL to join |
| `MEETING_PLATFORM` | Platform type (zoom, teams, meet) |
| `BOT_NAME` | Display name in meeting |
| `API_CALLBACK_URL` | Meeboter API callback endpoint |
| `MILO_AUTH_TOKEN` | Authentication token for Milo API calls |
| `RECORDING_MODE` | Recording configuration |

---

## Storage Configuration

Bot recordings are stored in S3-compatible storage (MinIO or AWS S3):

```bash
# MinIO (Self-hosted)
S3_ENDPOINT="http://minio:9000"
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"
S3_BUCKET_NAME="meeboter-recordings"
S3_REGION="us-east-1"

# AWS S3
S3_ENDPOINT="https://s3.us-east-1.amazonaws.com"
S3_ACCESS_KEY="your-aws-access-key"
S3_SECRET_KEY="your-aws-secret-key"
S3_BUCKET_NAME="meeboter-recordings"
S3_REGION="us-east-1"
```

---

## Monitoring and Health

### Bot Status Lifecycle

```
DEPLOYING → JOINING_CALL → IN_WAITING_ROOM → IN_CALL → ENDED
                  ↓                                        ↓
                FATAL ←────────────────────────────────────┘
```

### Heartbeat Monitoring

Bots send heartbeats every 30 seconds. If no heartbeat is received for 5 minutes, the bot is marked as `FATAL` and resources are released.

### Recovery Systems

**Coolify**: Slot recovery job runs every 5 minutes to recover error slots or delete permanently failed ones.

**AWS ECS**: Failed tasks are automatically cleaned up. New tasks are created for retry attempts.

---

## Troubleshooting

### Coolify Issues

**Slots stuck in "deploying" state**:
- Check Coolify server logs
- Verify Docker image is accessible
- Recovery job will clean up after 5 minutes

**Pool not scaling**:
- Verify Coolify API token permissions
- Check server resource limits
- Review Coolify project quotas

### AWS ECS Issues

**Tasks fail to start**:
- Check CloudWatch logs for container errors
- Verify task definition exists and is active
- Check subnet and security group configuration
- Verify IAM role permissions

**Tasks not receiving environment variables**:
- Ensure task definition allows environment overrides
- Check container definition configuration

### General Issues

**Bots not joining meetings**:
- Verify meeting URL format
- Check bot authentication token
- Review meeting platform-specific requirements

**Recordings not uploading**:
- Verify storage credentials
- Check bucket permissions
- Ensure network connectivity to storage endpoint

---

## Migration Between Platforms

To switch from Coolify to AWS ECS (or vice versa):

1. **Stop all active bots**: Ensure no meetings are in progress
2. **Update environment variables**: Change `DEPLOYMENT_PLATFORM` and related config
3. **Restart Meeboter API**: Apply new configuration
4. **Verify deployment**: Create a test bot to confirm new platform works

Note: Switching platforms does not migrate existing bot data. Historical records remain in the database regardless of platform.
