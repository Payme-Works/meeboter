# ─── ECS Cluster (Fargate only) ───────────────────────────────────────────────

resource "aws_ecs_cluster" "this" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled" # Temporarily enabled to gather memory/CPU metrics for optimization
  }

  tags = local.common_tags
}

# ─── Capacity Providers (Spot with Standard fallback) ─────────────────────────

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # Cost optimization: 95% Spot for maximum savings (~$71/month at 500 bots/day)
  # Meeting bots are interruption-tolerant since they can rejoin if terminated
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 95
    base              = 0
  }

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 5
    base              = 1
  }
}

# ─── Google Meet Bot Task Definition ──────────────────────────────────────────

resource "aws_ecs_task_definition" "google_meet_bot" {
  family                   = "${var.project_name}-google-meet-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # Cost optimization: 0.5 vCPU sufficient for browser automation
  memory                   = 2048 # Keep 2 GB for Chromium/Playwright
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  # Cost optimization: ARM64 Graviton is 20% cheaper than x86
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "google-meet-bot"
    image     = "ghcr.io/${var.ghcr_org}/${var.project_name}-google-meet-bot:latest"
    essential = true

    repositoryCredentials = {
      credentialsParameter = aws_secretsmanager_secret.ghcr.arn
    }

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

# ─── Zoom Bot Task Definition ─────────────────────────────────────────────────

resource "aws_ecs_task_definition" "zoom_bot" {
  family                   = "${var.project_name}-zoom-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # Cost optimization: 0.5 vCPU sufficient for browser automation
  memory                   = 2048 # Keep 2 GB for Chromium/Playwright
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  # Cost optimization: ARM64 Graviton is 20% cheaper than x86
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "zoom-bot"
    image     = "ghcr.io/${var.ghcr_org}/${var.project_name}-zoom-bot:latest"
    essential = true

    repositoryCredentials = {
      credentialsParameter = aws_secretsmanager_secret.ghcr.arn
    }

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

# ─── Microsoft Teams Bot Task Definition ──────────────────────────────────────

resource "aws_ecs_task_definition" "microsoft_teams_bot" {
  family                   = "${var.project_name}-microsoft-teams-bot"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512  # Cost optimization: 0.5 vCPU sufficient for browser automation
  memory                   = 2048 # Keep 2 GB for Chromium/Playwright
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.bot_task.arn

  # Cost optimization: ARM64 Graviton is 20% cheaper than x86
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "microsoft-teams-bot"
    image     = "ghcr.io/${var.ghcr_org}/${var.project_name}-microsoft-teams-bot:latest"
    essential = true

    repositoryCredentials = {
      credentialsParameter = aws_secretsmanager_secret.ghcr.arn
    }

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
