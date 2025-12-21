# ---------------------------------------------------------------------------------------------------------------------
# ECR Repositories Configuration
# ---------------------------------------------------------------------------------------------------------------------

# ECR Repository for Server
resource "aws_ecr_repository" "server" {
  name                 = "${local.name}/server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name}-server-ecr"
  }
}

# ECR Lifecycle Policy for Server
resource "aws_ecr_lifecycle_policy" "server" {
  repository = aws_ecr_repository.server.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "main", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR Repository for Google Meet Bot
resource "aws_ecr_repository" "google_meet_bot" {
  name                 = "${local.name}/bots/google-meet"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name}-google-meet-bot-ecr"
  }
}

# ECR Lifecycle Policy for Google Meet Bot
resource "aws_ecr_lifecycle_policy" "google_meet_bot" {
  repository = aws_ecr_repository.google_meet_bot.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "main", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR Repository for Microsoft Teams Bot
resource "aws_ecr_repository" "microsoft_teams_bot" {
  name                 = "${local.name}/bots/microsoft-teams"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name}-microsoft-teams-bot-ecr"
  }
}

# ECR Lifecycle Policy for Microsoft Teams Bot
resource "aws_ecr_lifecycle_policy" "microsoft_teams_bot" {
  repository = aws_ecr_repository.microsoft_teams_bot.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "main", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR Repository for Zoom Bot
resource "aws_ecr_repository" "zoom_bot" {
  name                 = "${local.name}/bots/zoom"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${local.name}-zoom-bot-ecr"
  }
}

# ECR Lifecycle Policy for Zoom Bot
resource "aws_ecr_lifecycle_policy" "zoom_bot" {
  repository = aws_ecr_repository.zoom_bot.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["sha-", "main", "v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# ECR IAM Policy for ECS Task Execution Role
# ---------------------------------------------------------------------------------------------------------------------

# Policy to allow ECS tasks to pull images from ECR
resource "aws_iam_policy" "ecr_policy" {
  name        = "${local.name}-ecr-policy"
  description = "Policy to allow ECS tasks to pull images from ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

# Attach ECR policy to ECS task execution role
resource "aws_iam_role_policy_attachment" "ecs_task_execution_ecr_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecr_policy.arn
}
