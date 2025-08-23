# ---------------------------------------------------------------------------------------------------------------------
# GitHub Actions OIDC Configuration
# ---------------------------------------------------------------------------------------------------------------------

# Data source to get GitHub OIDC provider (assumes it already exists)
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

# If the OIDC provider doesn't exist, uncomment the resource below:
# resource "aws_iam_openid_connect_provider" "github" {
#   url = "https://token.actions.githubusercontent.com"
#   
#   client_id_list = [
#     "sts.amazonaws.com",
#   ]
#   
#   thumbprint_list = [
#     "6938fd4d98bab03faadb97b34396831e3780aea1",
#     "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
#   ]
#   
#   tags = {
#     Name = "${local.name}-github-oidc"
#   }
# }

# IAM role for GitHub Actions
resource "aws_iam_role" "github_actions" {
  name = "${local.name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:meeting-bot/*"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.name}-github-actions-role"
  }
}

# Policy for GitHub Actions to push to ECR
resource "aws_iam_policy" "github_actions_ecr" {
  name        = "${local.name}-github-actions-ecr-policy"
  description = "Policy for GitHub Actions to push images to ECR"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = [
          aws_ecr_repository.server.arn,
          aws_ecr_repository.meet_bot.arn,
          aws_ecr_repository.teams_bot.arn,
          aws_ecr_repository.zoom_bot.arn
        ]
      }
    ]
  })
}

# Attach ECR policy to GitHub Actions role
resource "aws_iam_role_policy_attachment" "github_actions_ecr" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.github_actions_ecr.arn
}
