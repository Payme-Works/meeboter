# AWS Bot Infrastructure Design

**Date**: 2025-12-26
**Status**: Approved

## Overview

Adapt AWS infrastructure for bot-only deployments. Milo stays on Coolify, bots use AWS ECS Fargate via hybrid deployment.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Milo hosting | Coolify | Already configured, separate from bots |
| Bot images | GHCR (`:latest` tag) | No ECR needed, images built externally |
| Execution model | Ephemeral tasks via RunTask API | Matches existing AWSPlatformService |
| Networking | Public subnets only (no NAT) | Saves ~$30-45/month |
| Compute | Fargate Spot with Standard fallback | ~70% cost savings |
| Task resources | 1 vCPU, 2GB per bot | Headroom for Playwright + recording |
| Log retention | 3 days | Minimal cost, sufficient for debugging |
| Script naming | `scripts/setup-aws.ts` | TypeScript, consistent with codebase |

## Cost Analysis

### Fixed Monthly Costs

| Component | Cost |
|-----------|------|
| VPC, Subnets, Internet Gateway | $0 |
| ECS Cluster | $0 |
| Task Definitions | $0 |
| Security Groups | $0 |
| **Total Fixed** | **$0/month** |

### Variable Costs (Per Bot Run)

| Duration | Fargate Spot (~70% of runs) | Standard Fallback |
|----------|----------------------------|-------------------|
| 30 min | ~$0.008 | ~$0.025 |
| 1 hour | ~$0.015 | ~$0.05 |
| 2 hours | ~$0.03 | ~$0.10 |

**Average cost per bot-hour: ~$0.02** (assuming 70% Spot success rate)

## Architecture

### terraform/bots/ Module Structure

```
terraform/bots/
├── main.tf           # Provider, backend config, locals
├── variables.tf      # Input variables
├── outputs.tf        # Outputs for Milo configuration
├── vpc.tf            # VPC + 2 public subnets (no NAT gateway)
├── ecs.tf            # ECS cluster + 3 task definitions
├── iam.tf            # Task execution role + task role
├── security.tf       # Security groups (outbound only)
└── logs.tf           # CloudWatch log group (3-day retention)
```

### Task Definition Configuration

Each platform has its own task definition:

| Platform | Task Family | Container Name | Image |
|----------|-------------|----------------|-------|
| Google Meet | `meeboter-google-meet-bot` | `google-meet-bot` | `ghcr.io/<org>/meeboter-bots-google-meet:latest` |
| Zoom | `meeboter-zoom-bot` | `zoom-bot` | `ghcr.io/<org>/meeboter-bots-zoom:latest` |
| Microsoft Teams | `meeboter-microsoft-teams-bot` | `microsoft-teams-bot` | `ghcr.io/<org>/meeboter-bots-microsoft-teams:latest` |

**Container names match `AWSPlatformService.getContainerName()` in Milo code.**

### Resource Allocation

```hcl
cpu    = 1024  # 1 vCPU
memory = 2048  # 2 GB
```

### Capacity Provider Strategy

```hcl
capacity_provider_strategy {
  capacity_provider = "FARGATE_SPOT"
  weight            = 70
  base              = 0
}

capacity_provider_strategy {
  capacity_provider = "FARGATE"
  weight            = 30
  base              = 1  # Ensure at least one task can run on standard
}
```

## Files to Create

### 1. terraform/bots/main.tf

```hcl
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "tf-state-meeboter"
    key    = "bots/terraform.tfstate"
    region = "us-east-2"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

locals {
  name = "meeboter-bots"

  common_tags = {
    Project     = "meeboter"
    Component   = "bots"
    ManagedBy   = "terraform"
    Environment = terraform.workspace
  }
}
```

### 2. terraform/bots/variables.tf

```hcl
variable "aws_profile" {
  type        = string
  description = "AWS CLI profile to use"
  default     = "meeboter"
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-2"
}

variable "ghcr_org" {
  type        = string
  description = "GitHub Container Registry organization"
}

variable "milo_url" {
  type        = string
  description = "Milo API URL for bot callbacks"
}

variable "milo_auth_token" {
  type        = string
  description = "Authentication token for Milo API"
  sensitive   = true
}

variable "s3_endpoint" {
  type        = string
  description = "S3-compatible storage endpoint"
}

variable "s3_access_key" {
  type        = string
  description = "S3 access key"
  sensitive   = true
}

variable "s3_secret_key" {
  type        = string
  description = "S3 secret key"
  sensitive   = true
}

variable "s3_bucket_name" {
  type        = string
  description = "S3 bucket name for recordings"
}

variable "s3_region" {
  type        = string
  description = "S3 region"
  default     = "us-east-1"
}
```

### 3. terraform/bots/vpc.tf

```hcl
# VPC
resource "aws_vpc" "this" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-vpc"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(local.common_tags, {
    Name = "${local.name}-igw"
  })
}

# Public Subnets (2 AZs for redundancy)
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-public-${count.index + 1}"
  })
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

### 4. terraform/bots/security.tf

```hcl
resource "aws_security_group" "bot_tasks" {
  name        = "${local.name}-tasks-sg"
  description = "Security group for bot ECS tasks"
  vpc_id      = aws_vpc.this.id

  # Allow all outbound traffic (GHCR, Milo, S3)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-tasks-sg"
  })
}
```

### 5. terraform/bots/iam.tf

```hcl
# Task Execution Role (for ECS to pull images, write logs)
resource "aws_iam_role" "task_execution" {
  name = "${local.name}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role (for bot application to access S3)
resource "aws_iam_role" "bot_task" {
  name = "${local.name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

# Note: S3 access is via access keys passed as env vars, not IAM role
# This allows using external S3-compatible storage (MinIO, etc.)
```

### 6. terraform/bots/logs.tf

```hcl
resource "aws_cloudwatch_log_group" "bots" {
  name              = "/ecs/${local.name}"
  retention_in_days = 3

  tags = local.common_tags
}
```

### 7. terraform/bots/ecs.tf

```hcl
# ECS Cluster (Fargate only)
resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"  # Cost optimization
  }

  tags = local.common_tags
}

# Capacity providers for Spot with Standard fallback
resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 70
    base              = 0
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 30
    base              = 1
  }
}

# Google Meet Bot Task Definition
resource "aws_ecs_task_definition" "google_meet_bot" {
  family                   = "meeboter-google-meet-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  container_definitions = jsonencode([{
    name      = "google-meet-bot"
    image     = "ghcr.io/${var.ghcr_org}/meeboter-bots-google-meet:latest"
    essential = true

    # Environment variables set at runtime via container overrides
    environment = []

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.bots.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "google-meet"
      }
    }
  }])

  tags = local.common_tags
}

# Zoom Bot Task Definition
resource "aws_ecs_task_definition" "zoom_bot" {
  family                   = "meeboter-zoom-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  container_definitions = jsonencode([{
    name      = "zoom-bot"
    image     = "ghcr.io/${var.ghcr_org}/meeboter-bots-zoom:latest"
    essential = true

    environment = []

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.bots.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "zoom"
      }
    }
  }])

  tags = local.common_tags
}

# Microsoft Teams Bot Task Definition
resource "aws_ecs_task_definition" "microsoft_teams_bot" {
  family                   = "meeboter-microsoft-teams-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  container_definitions = jsonencode([{
    name      = "microsoft-teams-bot"
    image     = "ghcr.io/${var.ghcr_org}/meeboter-bots-microsoft-teams:latest"
    essential = true

    environment = []

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.bots.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "microsoft-teams"
      }
    }
  }])

  tags = local.common_tags
}
```

### 8. terraform/bots/outputs.tf

```hcl
output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

output "subnet_ids" {
  description = "Public subnet IDs for bot tasks"
  value       = join(",", aws_subnet.public[*].id)
}

output "security_group_id" {
  description = "Security group ID for bot tasks"
  value       = aws_security_group.bot_tasks.id
}

output "task_definition_google_meet" {
  description = "Google Meet bot task definition family"
  value       = aws_ecs_task_definition.google_meet_bot.family
}

output "task_definition_zoom" {
  description = "Zoom bot task definition family"
  value       = aws_ecs_task_definition.zoom_bot.family
}

output "task_definition_microsoft_teams" {
  description = "Microsoft Teams bot task definition family"
  value       = aws_ecs_task_definition.microsoft_teams_bot.family
}

# Output for easy copy-paste to Milo .env
output "milo_env_config" {
  description = "Environment variables for Milo"
  value       = <<-EOT
    # AWS ECS Configuration (add to Milo .env)
    
    AWS_REGION=${var.aws_region}
    AWS_ECS_CLUSTER=${aws_ecs_cluster.this.name}
    AWS_ECS_SUBNETS=${join(",", aws_subnet.public[*].id)}
    AWS_ECS_SECURITY_GROUPS=${aws_security_group.bot_tasks.id}
    AWS_ECS_TASK_DEF_GOOGLE_MEET=${aws_ecs_task_definition.google_meet_bot.family}
    AWS_ECS_TASK_DEF_MICROSOFT_TEAMS=${aws_ecs_task_definition.microsoft_teams_bot.family}
    AWS_ECS_TASK_DEF_ZOOM=${aws_ecs_task_definition.zoom_bot.family}
    AWS_ECS_ASSIGN_PUBLIC_IP=true
    AWS_BOT_LIMIT=50
  EOT
}
```

### 9. scripts/setup-aws.ts

```typescript
#!/usr/bin/env bun

/**
 * Meeboter AWS Bot Infrastructure Setup
 * Provisions/updates AWS infrastructure for bot deployments
 *
 * Usage:
 *   bun scripts/setup-aws.ts
 *   bun scripts/setup-aws.ts --profile myprofile --region us-west-2
 *   bun scripts/setup-aws.ts --interactive
 */

import { Command } from "commander";
import { confirm, select } from "@inquirer/prompts";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

// ─── Constants ───────────────────────────────────────────────────────────────

const TERRAFORM_DIR = join(import.meta.dir, "../terraform/bots");

const AWS_REGIONS = [
	{ name: "US East (Ohio) - us-east-2", value: "us-east-2" },
	{ name: "US East (N. Virginia) - us-east-1", value: "us-east-1" },
	{ name: "US West (Oregon) - us-west-2", value: "us-west-2" },
	{ name: "EU (Ireland) - eu-west-1", value: "eu-west-1" },
	{ name: "EU (Frankfurt) - eu-central-1", value: "eu-central-1" },
	{ name: "Asia Pacific (Tokyo) - ap-northeast-1", value: "ap-northeast-1" },
	{ name: "South America (São Paulo) - sa-east-1", value: "sa-east-1" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupOptions {
	profile: string;
	region: string;
	interactive: boolean;
	autoApprove: boolean;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const log = {
	info: (msg: string) => console.log(`\x1b[34m[INFO]\x1b[0m ${msg}`),
	success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
	error: (msg: string) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
	warn: (msg: string) => console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`),
};

// ─── Interactive Prompts ─────────────────────────────────────────────────────

async function promptForOptions(defaults: SetupOptions): Promise<SetupOptions> {
	console.log("\n🚀 Meeboter AWS Bot Infrastructure Setup\n");

	const region = await select({
		message: "Select AWS region:",
		choices: AWS_REGIONS,
		default: defaults.region,
	});

	const profile = await select({
		message: "Select AWS profile:",
		choices: [
			{ name: "meeboter (default)", value: "meeboter" },
			{ name: "default", value: "default" },
			{ name: "Other (enter manually)", value: "__other__" },
		],
		default: defaults.profile,
	});

	let finalProfile = profile;
	if (profile === "__other__") {
		const { input } = await import("@inquirer/prompts");
		finalProfile = await input({
			message: "Enter AWS profile name:",
			default: "meeboter",
		});
	}

	const autoApprove = await confirm({
		message: "Auto-approve Terraform changes?",
		default: false,
	});

	return {
		profile: finalProfile,
		region,
		interactive: true,
		autoApprove,
	};
}

// ─── Prerequisites ───────────────────────────────────────────────────────────

async function checkPrerequisites(profile: string): Promise<void> {
	log.info("Checking prerequisites...");

	// Check required tools
	for (const tool of ["terraform", "aws"]) {
		const result = await $`which ${tool}`.quiet().nothrow();
		if (result.exitCode !== 0) {
			log.error(`${tool} is required but not installed`);
			process.exit(1);
		}
	}

	// Check AWS credentials
	const stsResult = await $`aws sts get-caller-identity --profile ${profile}`
		.quiet()
		.nothrow();

	if (stsResult.exitCode !== 0) {
		log.warn("AWS credentials invalid or expired");

		const shouldLogin = await confirm({
			message: "Would you like to login via AWS SSO?",
			default: true,
		});

		if (shouldLogin) {
			await $`aws sso login --profile ${profile}`;
		} else {
			log.error("Valid AWS credentials required");
			process.exit(1);
		}
	}

	log.success("Prerequisites met");
}

// ─── Terraform ───────────────────────────────────────────────────────────────

async function applyTerraform(options: SetupOptions): Promise<void> {
	log.info("Applying Terraform configuration...");

	// Check if terraform directory exists
	if (!existsSync(TERRAFORM_DIR)) {
		log.error(`Terraform directory not found: ${TERRAFORM_DIR}`);
		process.exit(1);
	}

	// Initialize if needed
	if (!existsSync(join(TERRAFORM_DIR, ".terraform"))) {
		log.info("Initializing Terraform...");
		await $`terraform -chdir=${TERRAFORM_DIR} init`;
	}

	// Plan first
	log.info("Running Terraform plan...");
	await $`terraform -chdir=${TERRAFORM_DIR} plan -out=tfplan`;

	// Apply
	if (options.autoApprove) {
		await $`terraform -chdir=${TERRAFORM_DIR} apply tfplan`;
	} else {
		const shouldApply = await confirm({
			message: "Apply these changes?",
			default: true,
		});

		if (shouldApply) {
			await $`terraform -chdir=${TERRAFORM_DIR} apply tfplan`;
		} else {
			log.warn("Terraform apply cancelled");
			return;
		}
	}

	log.success("Infrastructure provisioned");

	// Show Milo configuration
	console.log("\n" + "─".repeat(60));
	log.info("Add the following to your Milo .env:\n");
	const output = await $`terraform -chdir=${TERRAFORM_DIR} output -raw milo_env_config`.text();
	console.log(output);
	console.log("─".repeat(60) + "\n");
}

// ─── CLI Setup ───────────────────────────────────────────────────────────────

const program = new Command()
	.name("setup-aws")
	.description("Meeboter AWS Bot Infrastructure Setup")
	.version("1.0.0")
	.option("-p, --profile <name>", "AWS CLI profile", "meeboter")
	.option("-r, --region <region>", "AWS region", "us-east-2")
	.option("-i, --interactive", "Interactive mode with prompts", false)
	.option("-y, --auto-approve", "Auto-approve Terraform changes", false)
	.action(async (opts) => {
		try {
			let options: SetupOptions = {
				profile: opts.profile,
				region: opts.region,
				interactive: opts.interactive,
				autoApprove: opts.autoApprove,
			};

			// Interactive mode
			if (opts.interactive) {
				options = await promptForOptions(options);
			}

			log.info("Starting AWS bot infrastructure setup...");
			log.info(`Region: ${options.region}`);
			log.info(`Profile: ${options.profile}`);

			await checkPrerequisites(options.profile);
			await applyTerraform(options);

			log.success("Setup complete!");
		} catch (error) {
			if (error instanceof Error) {
				log.error(error.message);
			}
			process.exit(1);
		}
	});

program.parse();
```

**Dependencies to add:**
```bash
bun add -D commander @inquirer/prompts
```

## Files to Archive

Move existing terraform files to archive for reference:

```bash
mkdir -p terraform/archive/full-stack
mv terraform/*.tf terraform/archive/full-stack/
mv terraform/shared terraform/archive/full-stack/
# Keep terraform/bots/ as active module
```

## Milo Environment Variables

After running `setup-aws.sh`, add outputs to Milo's `.env`:

```env
# Hybrid Platform Configuration
PLATFORM_PRIORITY=k8s,aws,coolify

# AWS ECS Configuration

AWS_REGION=us-east-2
AWS_ECS_CLUSTER=meeboter-bots
AWS_ECS_SUBNETS=subnet-xxx,subnet-yyy
AWS_ECS_SECURITY_GROUPS=sg-xxx
AWS_ECS_TASK_DEF_GOOGLE_MEET=meeboter-google-meet-bot
AWS_ECS_TASK_DEF_MICROSOFT_TEAMS=meeboter-microsoft-teams-bot
AWS_ECS_TASK_DEF_ZOOM=meeboter-zoom-bot
AWS_ECS_ASSIGN_PUBLIC_IP=true
AWS_BOT_LIMIT=50
```

## Implementation Steps

1. [ ] Add CLI dependencies: `bun add -D commander @inquirer/prompts`
2. [ ] Create `terraform/bots/` directory structure
3. [ ] Write all terraform files (main.tf, variables.tf, vpc.tf, etc.)
4. [ ] Create `scripts/setup-aws.ts` script
5. [ ] Archive old terraform files to `terraform/archive/full-stack/`
6. [ ] Create `terraform/bots/terraform.tfvars.example` template
7. [ ] Update `.gitignore` for terraform state and tfplan
8. [ ] Delete old `deploy.sh` script
9. [ ] Test with `terraform plan` (no apply yet)
10. [ ] Update CLAUDE.md with new setup instructions
