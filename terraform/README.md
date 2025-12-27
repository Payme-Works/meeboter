# Meeboter AWS Bot Infrastructure

Terraform configuration for deploying meeting bots on AWS ECS Fargate.

## Directory Structure

```
terraform/
├── setup-aws.ts           # TypeScript setup script
├── bots/                   # AWS ECS infrastructure for bots
│   ├── main.tf            # Provider and backend config
│   ├── variables.tf       # Input variables (with defaults)
│   ├── terraform.tfvars   # Your configuration (gitignored)
│   ├── ecs.tf             # ECS cluster + task definitions
│   ├── vpc.tf             # VPC with public subnets
│   ├── security.tf        # Security groups
│   ├── iam.tf             # IAM roles
│   ├── logs.tf            # CloudWatch logs
│   └── outputs.tf         # Milo configuration output
└── archive/               # Old full-stack configs (reference only)
```

## Architecture

- ECS Fargate cluster with Spot + Standard capacity (70/30 split)
- Public subnets only (no NAT gateway for cost savings)
- Ephemeral tasks via RunTask API (no persistent services)
- CloudWatch logs with 3-day retention
- Container images from GHCR (GitHub Container Registry)

### Cost Optimization

- $0 fixed monthly cost (no NAT, no persistent services)
- ~$0.02/bot-hour using Fargate Spot

## Quick Start

### Prerequisites

1. AWS CLI configured (default profile or specify with `--profile`)
2. Terraform >= 1.0 installed
3. Bun runtime installed

### Setup

```bash
# Interactive mode (recommended)
bun terraform/setup-aws.ts --interactive

# Or with flags (uses default profile if not specified)
bun terraform/setup-aws.ts --region us-east-2
```

### Manual Setup

```bash
cd terraform/bots

# Create tfvars
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your ghcr_org

# Initialize
terraform init

# Plan and apply
terraform plan -out=tfplan
terraform apply tfplan
```

## Configuration

### Variables

| Variable       | Default      | Required | Description                    |
| -------------- | ------------ | -------- | ------------------------------ |
| `project_name` | `meeboter`   | No       | Project name for resource tags |
| `aws_profile`  | `default`    | No       | AWS CLI profile                |
| `aws_region`   | `us-east-2`  | No       | AWS region                     |
| `ghcr_org`     | -            | Yes      | GitHub Container Registry org  |

### terraform.tfvars

```hcl
ghcr_org = "your-github-org"
```

## Outputs

After applying, the script outputs Milo environment configuration:

```bash
terraform output -raw milo_env_config
```

This provides the environment variables needed for Milo to deploy bots to AWS.

## Task Definitions

Three task definitions are created for each bot platform:

| Bot              | Image                                   | Resources        |
| ---------------- | --------------------------------------- | ---------------- |
| Google Meet      | `ghcr.io/{org}/meeboter-google-meet-bot`      | 1 vCPU, 2GB RAM  |
| Microsoft Teams  | `ghcr.io/{org}/meeboter-microsoft-teams-bot`  | 1 vCPU, 2GB RAM  |
| Zoom             | `ghcr.io/{org}/meeboter-zoom-bot`             | 1 vCPU, 2GB RAM  |
