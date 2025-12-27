# Deployment Guide

This guide covers deploying Meeboter to different platforms. Choose based on your requirements:

| Platform | Best For | Monthly Cost | Setup Time |
|----------|----------|--------------|------------|
| [Coolify](#coolify-deployment) | Self-hosted, predictable workloads | ~$50-90 | 30 min |
| [Kubernetes](#kubernetes-deployment) | Existing K8s, multi-cloud | ~$60-200 | 1 hour |
| [AWS ECS](#aws-ecs-deployment) | Auto-scaling, pay-per-use | ~$80-500 | 15 min |
| [Hybrid](#hybrid-deployment) | Best of both worlds | Variable | 1+ hour |

---

## Prerequisites

All deployments require:

- PostgreSQL 15+ database
- S3-compatible storage (MinIO, AWS S3, Cloudflare R2)
- Docker container registry access (GHCR)

---

## Coolify Deployment

Pool-based deployment using pre-provisioned Docker containers.

### Overview

```
+-----------------------------------------------------+
|                 Coolify Server                      |
|                                                     |
|  +-------------+    +---------------------------+   |
|  | Milo API    |    |       Bot Pool            |   |
|  | (Next.js)   |--->| [idle] [busy] [idle] ...  |   |
|  +-------------+    +---------------------------+   |
|                                                     |
|  +-------------+    +-------------+                 |
|  | PostgreSQL  |    | MinIO (S3)  |                 |
|  +-------------+    +-------------+                 |
+-----------------------------------------------------+
```

### Setup Steps

#### 1. Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

#### 2. Deploy Milo API

1. Create a new project in Coolify
2. Add a new service → Docker Compose
3. Configure environment variables (see below)
4. Deploy

#### 3. Configure Environment Variables

```bash
# Platform Configuration
PLATFORM_PRIORITY="coolify"

# Coolify API
COOLIFY_API_URL="https://coolify.example.com/api/v1"
COOLIFY_API_TOKEN="your-api-token"
COOLIFY_PROJECT_UUID="project-uuid"
COOLIFY_SERVER_UUID="server-uuid"
COOLIFY_DESTINATION_UUID="destination-uuid"

# Pool Configuration
COOLIFY_BOT_LIMIT="20"              # Max concurrent bots
POOL_MIN_IDLE_SLOTS="5"             # Minimum idle slots to maintain
POOL_MAX_SIZE="30"                  # Maximum pool size

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/meeboter"

# S3 Storage
S3_ENDPOINT="https://s3.example.com"
S3_ACCESS_KEY_ID="your-access-key"
S3_SECRET_ACCESS_KEY="your-secret-key"
S3_BUCKET="meeboter-recordings"
S3_REGION="us-east-1"

# Bot Images (GHCR)
BOT_IMAGE_REGISTRY="ghcr.io/payme-works"
BOT_IMAGE_TAG="latest"
```

#### 4. Initialize Bot Pool

The pool initializes automatically on first bot deployment. To pre-warm:

```bash
# Via API
curl -X POST https://api.example.com/api/trpc/pool.initialize
```

### Cost Estimate

| Server | Cost | Concurrent Bots | Bot-Hours/Month |
|--------|------|-----------------|-----------------|
| Hetzner AX41 | ~$50/mo | 20-30 | 15,000-22,500 |
| Hetzner AX52 | ~$80/mo | 40-50 | 30,000-37,500 |
| Custom | Variable | Depends | Depends |

**Cost per bot-hour**: ~$0.002-0.005

---

## Kubernetes Deployment

Pod-based deployment using Kubernetes Jobs.

### Overview

```
+-----------------------------------------------------+
|                 Kubernetes Cluster                  |
|                                                     |
|  +-------------+    +---------------------------+   |
|  | Milo API    |    |    namespace: meeboter    |   |
|  | (Deployment)|--->| [Job A] [Job B] [Job C]   |   |
|  +-------------+    +---------------------------+   |
|                                                     |
|  +--------------+   +-------------+                 |
|  | PostgreSQL   |   | MinIO (S3)  |                 |
|  | (StatefulSet)|   | (Deployment)|                 |
|  +--------------+   +-------------+                 |
+-----------------------------------------------------+
```

### Setup Steps

#### 1. Create Namespace

```bash
kubectl create namespace meeboter
```

#### 2. Create Secrets

```bash
kubectl create secret generic meeboter-secrets \
  --namespace meeboter \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=S3_ACCESS_KEY_ID="..." \
  --from-literal=S3_SECRET_ACCESS_KEY="..."
```

#### 3. Deploy Milo API

```yaml
# milo-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: milo
  namespace: meeboter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: milo
  template:
    metadata:
      labels:
        app: milo
    spec:
      containers:
      - name: milo
        image: ghcr.io/payme-works/meeboter-milo:latest
        ports:
        - containerPort: 3000
        env:
        - name: PLATFORM_PRIORITY
          value: "k8s"
        - name: K8S_NAMESPACE
          value: "meeboter"
        - name: K8S_IMAGE_REGISTRY
          value: "ghcr.io/payme-works"
        - name: K8S_IMAGE_TAG
          value: "latest"
        - name: K8S_BOT_CPU_REQUEST
          value: "500m"
        - name: K8S_BOT_CPU_LIMIT
          value: "1000m"
        - name: K8S_BOT_MEMORY_REQUEST
          value: "1Gi"
        - name: K8S_BOT_MEMORY_LIMIT
          value: "2Gi"
        - name: K8S_BOT_LIMIT
          value: "50"
        envFrom:
        - secretRef:
            name: meeboter-secrets
```

```bash
kubectl apply -f milo-deployment.yaml
```

#### 4. Configure RBAC

```yaml
# rbac.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: meeboter
  name: bot-manager
rules:
- apiGroups: ["batch"]
  resources: ["jobs"]
  verbs: ["create", "delete", "get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: milo-bot-manager
  namespace: meeboter
subjects:
- kind: ServiceAccount
  name: default
  namespace: meeboter
roleRef:
  kind: Role
  name: bot-manager
  apiGroup: rbac.authorization.k8s.io
```

### Environment Variables

```bash
# Platform Configuration
PLATFORM_PRIORITY="k8s"

# Kubernetes
K8S_NAMESPACE="meeboter"
K8S_KUBECONFIG="/path/to/kubeconfig"  # Optional, uses in-cluster config if not set
K8S_IMAGE_REGISTRY="ghcr.io/payme-works"
K8S_IMAGE_TAG="latest"

# Resource Limits
K8S_BOT_CPU_REQUEST="500m"
K8S_BOT_CPU_LIMIT="1000m"
K8S_BOT_MEMORY_REQUEST="1Gi"
K8S_BOT_MEMORY_LIMIT="2Gi"
K8S_BOT_LIMIT="80"
```

### Cost Estimate

| Setup | Cost | Concurrent Bots |
|-------|------|-----------------|
| K3s single node | ~$40-60/mo | 20-30 |
| K3s 3-node cluster | ~$120-180/mo | 60-90 |
| EKS/GKE managed | ~$150-400/mo | 50-150 |

---

## AWS ECS Deployment

Task-based deployment using Fargate (serverless containers).

### Overview

```
+-----------------------------------------------------+
|                    AWS Cloud                        |
|                                                     |
|  +---------------------------------------------+   |
|  |              VPC (10.0.0.0/16)              |   |
|  |                                             |   |
|  |  +-------------+    +-------------+         |   |
|  |  | Subnet AZ-a |    | Subnet AZ-b |         |   |
|  |  | (public)    |    | (public)    |         |   |
|  |  |             |    |             |         |   |
|  |  | [Task A]    |    | [Task B]    |         |   |
|  |  | [Task C]    |    | [Task D]    |         |   |
|  |  +-------------+    +-------------+         |   |
|  +---------------------------------------------+   |
|                                                     |
|  +---------------+  +---------------+               |
|  | ECS Cluster   |  | CloudWatch    |               |
|  | (Fargate)     |  | Logs          |               |
|  +---------------+  +---------------+               |
+-----------------------------------------------------+
```

### Setup Steps

#### 1. Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform >= 1.0
- GitHub Personal Access Token with `read:packages` scope

#### 2. Run Setup Script

```bash
cd terraform/bots
bun ../setup-aws.ts
```

This interactive script will:
1. Configure AWS region and profile
2. Request GHCR credentials
3. Run `terraform init` and `terraform apply`
4. Output environment variables for Milo

#### 3. Manual Terraform Setup (Alternative)

```bash
cd terraform/bots

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
aws_region = "us-east-2"
aws_profile = "default"
ghcr_org = "payme-works"
ghcr_token = "ghp_your_token_here"
EOF

# Initialize and apply
terraform init
terraform apply
```

#### 4. Configure Milo

Add the Terraform outputs to your Milo environment:

```bash
# Platform Configuration
PLATFORM_PRIORITY="aws"

# AWS Credentials (from Terraform output)
AWS_ACCESS_KEY_ID="AKIA..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="us-east-2"

# ECS Configuration (from Terraform output)
AWS_ECS_CLUSTER="meeboter-bots"
AWS_ECS_SUBNETS="subnet-xxx,subnet-yyy"
AWS_ECS_SECURITY_GROUPS="sg-xxx"
AWS_ECS_ASSIGN_PUBLIC_IP="true"

# Task Definitions (from Terraform output)
AWS_ECS_TASK_DEF_GOOGLE_MEET="meeboter-google-meet-bot"
AWS_ECS_TASK_DEF_MICROSOFT_TEAMS="meeboter-microsoft-teams-bot"
AWS_ECS_TASK_DEF_ZOOM="meeboter-zoom-bot"

# Limits
AWS_BOT_LIMIT="100"
```

### Infrastructure Details

| Component | Configuration | Cost Impact |
|-----------|---------------|-------------|
| ECS Cluster | Fargate-only | No fixed cost |
| Capacity Providers | 90% Spot, 10% On-Demand | ~70% savings |
| Task CPU | 0.5 vCPU (ARM64) | ~50% savings |
| Task Memory | 2 GB | Required for Chromium |
| VPC | Public subnets only | No NAT ($32/mo saved) |
| CloudWatch | 1-day retention | Minimal log costs |

### Cost Estimate

| Daily Bots | Avg Duration | Monthly Cost |
|------------|--------------|--------------|
| 100 | 45 min | ~$22 |
| 500 | 45 min | ~$100 |
| 1,000 | 45 min | ~$197 |
| 2,000 | 45 min | ~$391 |

See [ARCHITECTURE.md](../ARCHITECTURE.md) for detailed cost breakdown.

---

## Hybrid Deployment

Combine multiple platforms with automatic failover.

### Overview

```
+------------------------------------------------------------+
|                      Milo API Server                       |
|                                                            |
|  +------------------------------------------------------+  |
|  |              Hybrid Platform Service                 |  |
|  |                                                      |  |
|  |   PLATFORM_PRIORITY="coolify,aws,k8s"               |  |
|  |                                                      |  |
|  |   1. Try Coolify pool (fastest, cheapest)           |  |
|  |   2. Overflow to AWS ECS (auto-scale)               |  |
|  |   3. Fallback to K8s (if configured)                |  |
|  +------------------------------------------------------+  |
+------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+-------------+      +-------------+      +-------------+
|   Coolify   |      |   AWS ECS   |      | Kubernetes  |
|  (20 slots) |      |  (100 max)  |      |  (50 max)   |
+-------------+      +-------------+      +-------------+
```

### Configuration

```bash
# Platform priority (comma-separated, first = highest priority)
PLATFORM_PRIORITY="coolify,aws"

# Per-platform limits
COOLIFY_BOT_LIMIT="20"
AWS_BOT_LIMIT="100"
K8S_BOT_LIMIT="50"

# Queue timeouts (ms) - how long to wait before trying next platform
COOLIFY_QUEUE_TIMEOUT_MS="30000"    # 30 seconds
AWS_QUEUE_TIMEOUT_MS="60000"         # 1 minute
K8S_QUEUE_TIMEOUT_MS="60000"         # 1 minute
GLOBAL_QUEUE_TIMEOUT_MS="600000"     # 10 minutes (all platforms exhausted)
```

### Behavior

1. **Normal Load**: Bots deploy to first available platform (Coolify)
2. **Pool Exhausted**: Overflow to next platform (AWS ECS)
3. **All Platforms Busy**: Requests queue with configurable timeouts
4. **Platform Failure**: Automatic failover to next platform

### Cost Optimization Strategy

| Load | Platform Used | Cost |
|------|---------------|------|
| 0-20 concurrent | Coolify only | Fixed ~$80/mo |
| 21-100 concurrent | Coolify + AWS | $80 + variable |
| Burst (100+) | All platforms | Variable |

---

## Environment Variables Reference

### Core Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PLATFORM_PRIORITY` | Yes | Platform order (e.g., "coolify,aws") |
| `NEXTAUTH_SECRET` | Yes | Auth secret for sessions |
| `NEXTAUTH_URL` | Yes | Public URL of Milo API |

### S3 Storage

| Variable | Required | Description |
|----------|----------|-------------|
| `S3_ENDPOINT` | Yes | S3 endpoint URL |
| `S3_ACCESS_KEY_ID` | Yes | Access key |
| `S3_SECRET_ACCESS_KEY` | Yes | Secret key |
| `S3_BUCKET` | Yes | Bucket name |
| `S3_REGION` | Yes | Region |

### Bot Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `BOT_IMAGE_REGISTRY` | ghcr.io/payme-works | Container registry |
| `BOT_IMAGE_TAG` | latest | Image tag |
| `BOT_HEARTBEAT_INTERVAL` | 30000 | Heartbeat interval (ms) |
| `BOT_MAX_DURATION` | 14400000 | Max meeting duration (ms) |

### Platform-Specific

See individual platform sections above for platform-specific variables.

---

## Monitoring

### Health Checks

```bash
# API health
curl https://api.example.com/api/health

# Pool statistics (Coolify)
curl https://api.example.com/api/trpc/pool.statistics.getPool

# Active bots
curl https://api.example.com/api/trpc/bots.list?status=IN_CALL
```

### Logs

| Platform | Log Location |
|----------|--------------|
| Coolify | Docker container logs |
| Kubernetes | `kubectl logs -n meeboter job/bot-xxx` |
| AWS ECS | CloudWatch Logs `/ecs/meeboter` |

### Alerts

Configure alerts for:
- Bot failure rate > 5%
- Pool exhaustion (Coolify)
- High queue wait times
- ECS task failures

---

## Troubleshooting

### Common Issues

#### Bot fails to join meeting

1. Check bot logs for error messages
2. Verify meeting URL is valid and accessible
3. Check if meeting requires sign-in (not supported)
4. Verify network connectivity from bot container

#### Pool exhaustion (Coolify)

1. Check pool statistics: `/api/trpc/pool.statistics.getPool`
2. Increase `COOLIFY_BOT_LIMIT` if server has capacity
3. Configure overflow to AWS ECS

#### ECS task fails to start

1. Check CloudWatch logs for errors
2. Verify GHCR credentials are valid
3. Check security group allows outbound traffic
4. Verify subnet has internet access

#### High deploy times

| Platform | Expected | If Slower |
|----------|----------|-----------|
| Coolify | ~30s | Check pool health |
| K8s | ~30-60s | Check node resources |
| AWS ECS | ~60-90s | Check image caching |

---

## Security Recommendations

1. **Network**: Use private subnets with NAT for production (adds ~$32/mo)
2. **Secrets**: Use AWS Secrets Manager or Kubernetes secrets
3. **Access**: Restrict API access with authentication
4. **Monitoring**: Enable CloudWatch Container Insights for production
5. **Updates**: Keep bot images updated for browser security patches
