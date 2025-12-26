# Deployment Guide

This guide covers deploying Meeboter bots using Coolify (pool-based), AWS ECS (task-based), or Kubernetes (pod-based) deployment strategies.

## Platform Selection

Meeboter supports three deployment platforms with hybrid fallback:

| Platform | Model | Best For |
|----------|-------|----------|
| **Coolify** | Pool-based | Self-hosted, bare-metal, cost-efficient at scale |
| **AWS ECS** | Task-based | Cloud-native, auto-scaling, pay-per-use |
| **Kubernetes** | Pod-based | Enterprise, multi-cloud, existing K8s infrastructure |

### Platform Priority (Hybrid Deployment)

Use `PLATFORM_PRIORITY` to configure platform fallback order:

```bash
# Single platform
PLATFORM_PRIORITY="k8s"

# Hybrid: try K8s first, fall back to AWS if at capacity
PLATFORM_PRIORITY="k8s,aws"

# Full fallback chain
PLATFORM_PRIORITY="k8s,aws,coolify"

# Local development
PLATFORM_PRIORITY="local"
```

When a platform reaches its bot limit, the next platform in the chain is used.

### Global Queue Configuration

```bash
# Maximum time a bot can wait in the global queue
GLOBAL_QUEUE_TIMEOUT_MS="600000"  # 10 minutes (default)

# Maximum concurrent deployments across all platforms
DEPLOYMENT_QUEUE_MAX_CONCURRENT="4"
```

---

## Coolify Deployment (Pool-Based)

Coolify deployment uses a pre-provisioned pool of bot containers. When a meeting is scheduled, an idle container is configured and started. After the meeting ends, the container returns to the pool.

### Architecture

```
+-------------------------------------------------------------+
|                    Coolify Server                           |
|  +--------+ +--------+ +--------+ +--------+                |
|  | Slot 1 | | Slot 2 | | Slot 3 | | Slot N |                |
|  | (idle) | | (busy) | | (idle) | | (idle) |                |
|  +--------+ +--------+ +--------+ +--------+                |
+-------------------------------------------------------------+
```

### Prerequisites

1. **Coolify Instance**: Self-hosted Coolify installation
2. **Docker Registry Access**: GHCR or private registry with bot images
3. **PostgreSQL Database**: For Meeboter API state

### Environment Variables

```bash
# Platform Selection (or use PLATFORM_PRIORITY for hybrid)
PLATFORM_PRIORITY="coolify"   # Or "k8s,coolify" for fallback chain

# Coolify API Configuration
COOLIFY_API_URL="https://coolify.example.com/api/v1"
COOLIFY_API_TOKEN="your-coolify-api-token"

# Coolify Resource IDs
COOLIFY_PROJECT_UUID="your-project-uuid"
COOLIFY_SERVER_UUID="your-server-uuid"
COOLIFY_ENVIRONMENT_NAME="production"
COOLIFY_DESTINATION_UUID="your-destination-uuid"

# Capacity Limits
COOLIFY_BOT_LIMIT="20"              # Max concurrent bots
COOLIFY_QUEUE_TIMEOUT_MS="300000"   # Queue timeout (5 min)

# Bot Images
GHCR_ORG="Payme-Works"
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
+-------------------------------------------------------------+
|                       AWS ECS Cluster                       |
|                                                             |
|   Meeting 1 --> [Task A] ----------------------> Terminated |
|   Meeting 2 --> [Task B] -----------------> Terminated      |
|   Meeting 3 --> [Task C] --> Running...                     |
|                                                             |
+-------------------------------------------------------------+
```

### Prerequisites

1. **AWS Account**: With ECS and VPC configured
2. **ECS Cluster**: Fargate-enabled cluster (provision with `bun terraform/setup-aws.ts`)
3. **Task Definitions**: Created by terraform, one per platform
4. **IAM Roles**: Created by terraform with GHCR pull permissions
5. **VPC Configuration**: Public subnets (no NAT gateway needed)

### Infrastructure Setup

```bash
# Provision AWS infrastructure (interactive)
bun terraform/setup-aws.ts --interactive

# Or with flags
bun terraform/setup-aws.ts --profile meeboter --region us-east-2
```

### Environment Variables

```bash
# Platform Selection
PLATFORM_PRIORITY="aws"             # Or "k8s,aws,coolify" for fallback chain

# AWS Region
AWS_REGION="us-east-2"

# AWS ECS Cluster & Network (from terraform output)
AWS_ECS_CLUSTER="meeboter-bots"
AWS_ECS_SUBNETS="subnet-xxx,subnet-yyy"
AWS_ECS_SECURITY_GROUPS="sg-xxx"
AWS_ECS_ASSIGN_PUBLIC_IP="true"

# AWS ECS Task Definitions (family name, uses latest revision)
AWS_ECS_TASK_DEF_GOOGLE_MEET="meeboter-google-meet-bot"
AWS_ECS_TASK_DEF_MICROSOFT_TEAMS="meeboter-microsoft-teams-bot"
AWS_ECS_TASK_DEF_ZOOM="meeboter-zoom-bot"

# AWS Capacity Limits
AWS_BOT_LIMIT="50"
AWS_QUEUE_TIMEOUT_MS="30000"

# Bot Authentication
MILO_AUTH_TOKEN="your-milo-auth-token"
```

### Task Definitions

Task definitions are created by terraform. The terraform module creates:

| Task Definition | Container Name | Image |
|-----------------|----------------|-------|
| `meeboter-google-meet-bot` | `google-meet-bot` | `ghcr.io/Payme-Works/meeboter-google-meet-bot:latest` |
| `meeboter-microsoft-teams-bot` | `microsoft-teams-bot` | `ghcr.io/Payme-Works/meeboter-microsoft-teams-bot:latest` |
| `meeboter-zoom-bot` | `zoom-bot` | `ghcr.io/Payme-Works/meeboter-zoom-bot:latest` |

All tasks use:
- **CPU**: 1024 (1 vCPU)
- **Memory**: 2048 MB
- **Network**: awsvpc with public IP
- **Logs**: CloudWatch `/ecs/meeboter-bots`

### VPC and Security Group Configuration

Terraform creates a VPC with **public subnets only** (no NAT gateway for cost savings):

- 2 public subnets across availability zones
- Internet gateway for outbound traffic
- Security group with outbound-only rules

**Security Group Rules** (created by terraform):
```
Outbound:
- All traffic to 0.0.0.0/0 (for meeting connections)

Inbound:
- None (bots initiate all connections)
```

### IAM Roles

Terraform creates two IAM roles:

1. **Task Execution Role** (`meeboter-bots-task-execution`):
   - Pull images from GHCR
   - Write logs to CloudWatch

2. **Task Role** (`meeboter-bots-task`):
   - Bot container permissions (currently minimal)

---

## Kubernetes Deployment (Pod-Based)

Kubernetes deployment uses Kubernetes Jobs to create ephemeral pods for each meeting, similar to AWS ECS. Pods are created on-demand and automatically cleaned up after the meeting ends.

> **Design Document:** [`docs/plans/2025-12-22-kubernetes-bot-deployment-design.md`](docs/plans/2025-12-22-kubernetes-bot-deployment-design.md)

### Architecture

```
+-------------------------------------------------------------+
|                    Kubernetes Cluster                       |
|                                                             |
|   Meeting 1 --> [Job/Pod A] --------------------> Completed |
|   Meeting 2 --> [Job/Pod B] ---------------> Completed      |
|   Meeting 3 --> [Job/Pod C] --> Running...                  |
|                                                             |
+-------------------------------------------------------------+
```

### Prerequisites

1. **Kubernetes Cluster**: K3s, K8s, or managed Kubernetes (EKS, GKE, AKS)
2. **kubectl access**: Valid kubeconfig for the cluster
3. **Namespace**: Dedicated namespace for Meeboter bots
4. **Container Registry Access**: Ability to pull from GHCR

### Environment Variables

```bash
# Platform Selection (or use PLATFORM_PRIORITY for hybrid)
PLATFORM_PRIORITY="k8s"   # Or "k8s,aws,coolify" for fallback chain

# Kubernetes Configuration
K8S_NAMESPACE="meeboter"
K8S_KUBECONFIG="/path/to/kubeconfig"  # Optional, uses in-cluster config if not set

# Container Images
K8S_IMAGE_REGISTRY="ghcr.io/Payme-Works"  # Optional, defaults to GHCR_ORG
K8S_IMAGE_TAG="latest"

# Bot Resources (defaults shown)
K8S_BOT_CPU_REQUEST="500m"
K8S_BOT_CPU_LIMIT="1000m"
K8S_BOT_MEMORY_REQUEST="1Gi"
K8S_BOT_MEMORY_LIMIT="2Gi"

# Image Pull Lock (prevents concurrent pulls of same image)
K8S_IMAGE_PULL_LOCK_ENABLED="true"

# Capacity Limits
K8S_BOT_LIMIT="80"                  # Max concurrent bots
K8S_QUEUE_TIMEOUT_MS="60000"        # Queue timeout

# Bot Configuration
MILO_AUTH_TOKEN="your-milo-auth-token"
```

### Cluster Setup

1. **Create namespace**:
```bash
kubectl create namespace meeboter
```

2. **Create image pull secret** (for private registries):
```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace=meeboter
```

3. **Apply ResourceQuota** (optimized for 80 bots on 24 CPU / 64GB node):
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: meeboter-quota
  namespace: meeboter
spec:
  hard:
    pods: "100"
    requests.cpu: "14"        # 80 bots × 150m = 12 cores
    requests.memory: "45Gi"   # 80 bots × 512Mi = 40Gi
    limits.cpu: "45"          # Overcommit OK for burst
    limits.memory: "85Gi"     # Overcommit OK for burst
```

### Capacity Planning

| Cluster Size | Total CPU | Total RAM | Max Bots |
|--------------|-----------|-----------|----------|
| 1 node (20 cores, 56GB) | 20 cores | 56 GB | 40-80 |
| 3 nodes (60 cores, 168GB) | 60 cores | 168 GB | 120-240 |

### Kubernetes-Specific Features

- **Job completion tracking**: Automatically detects when bots finish
- **Pod logs**: Full log access via kubectl
- **Resource limits**: Prevents runaway containers
- **Node scheduling**: Distributes bots across available nodes

---

## Bot Image Configuration

All platforms use container images from GHCR:

| Bot | Image |
|-----|-------|
| Google Meet | `ghcr.io/Payme-Works/meeboter-google-meet-bot:latest` |
| Microsoft Teams | `ghcr.io/Payme-Works/meeboter-microsoft-teams-bot:latest` |
| Zoom | `ghcr.io/Payme-Works/meeboter-zoom-bot:latest` |

Images are built automatically via GitHub Actions on push to `main`.

### Environment Variables Passed to Bots

Platform services pass these environment variables to bot containers at runtime:

| Variable | Description |
|----------|-------------|
| `BOT_ID` | Bot identifier (fetches config from Milo API) |
| `MILO_URL` | Milo API URL for tRPC calls |
| `MILO_AUTH_TOKEN` | Authentication token for Milo API |
| `S3_ENDPOINT` | S3-compatible storage endpoint |
| `S3_ACCESS_KEY` | Storage access key |
| `S3_SECRET_KEY` | Storage secret key |
| `S3_BUCKET_NAME` | Bucket for recordings |
| `S3_REGION` | Storage region |
| `NODE_ENV` | Always `production` |

Bots fetch their full configuration (meeting URL, display name, etc.) from Milo API using `BOT_ID`.

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
DEPLOYING --> JOINING_CALL --> IN_WAITING_ROOM --> IN_CALL --> ENDED
                   |                                    |
                   v                                    v
                 FATAL <--------------------------------+
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

To switch platforms or change priority order:

1. **Stop all active bots**: Ensure no meetings are in progress
2. **Update environment variables**: Change `PLATFORM_PRIORITY` and related config
3. **Restart Meeboter API**: Apply new configuration
4. **Verify deployment**: Create a test bot to confirm new platform works

Note: Switching platforms does not migrate existing bot data. Historical records remain in the database regardless of platform.
