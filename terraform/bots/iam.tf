# ─── Task Execution Role ──────────────────────────────────────────────────────
# For ECS to pull images from GHCR and write logs to CloudWatch

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

resource "aws_iam_role_policy" "task_execution_ghcr" {
  name = "ghcr-secret-access"
  role = aws_iam_role.task_execution.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = aws_secretsmanager_secret.ghcr.arn
    }]
  })
}

# ─── GHCR Credentials Secret ─────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "ghcr" {
  name        = "${local.name}/ghcr-credentials"
  description = "GitHub Container Registry credentials for pulling bot images"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "ghcr" {
  secret_id = aws_secretsmanager_secret.ghcr.id
  secret_string = jsonencode({
    username = var.ghcr_org
    password = var.ghcr_token
  })
}

# ─── Task Role ────────────────────────────────────────────────────────────────
# For bot application runtime permissions

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

# ─── Milo API User ────────────────────────────────────────────────────────────
# IAM user for Milo (running on Coolify) to manage ECS tasks

resource "aws_iam_user" "milo" {
  name = "${local.name}-milo-api"
  tags = local.common_tags
}

resource "aws_iam_user_policy" "milo_ecs" {
  name = "ecs-task-management"
  user = aws_iam_user.milo.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSTaskManagement"
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:StopTask",
          "ecs:DescribeTasks",
          "ecs:ListTasks"
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "ecs:cluster" = aws_ecs_cluster.this.arn
          }
        }
      },
      {
        Sid    = "PassRoleToECS"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          aws_iam_role.task_execution.arn,
          aws_iam_role.bot_task.arn
        ]
      }
    ]
  })
}

resource "aws_iam_access_key" "milo" {
  user = aws_iam_user.milo.name
}
