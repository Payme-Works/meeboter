output "database_url" {
  description = "The PostgreSQL connection string for the database"
  value       = "postgresql://${aws_db_instance.this.username}:${random_password.db_password.result}@${aws_db_instance.this.endpoint}/${aws_db_instance.this.db_name}"
  sensitive   = true
}

# ECR Repository URLs
output "ecr_server_repository_url" {
  description = "The URL of the ECR repository for the server"
  value       = aws_ecr_repository.server.repository_url
}

output "ecr_meet_bot_repository_url" {
  description = "The URL of the ECR repository for the meet bot"
  value       = aws_ecr_repository.meet_bot.repository_url
}

output "ecr_teams_bot_repository_url" {
  description = "The URL of the ECR repository for the teams bot"
  value       = aws_ecr_repository.teams_bot.repository_url
}

output "ecr_zoom_bot_repository_url" {
  description = "The URL of the ECR repository for the zoom bot"
  value       = aws_ecr_repository.zoom_bot.repository_url
}

# GitHub Actions Role ARN
output "github_actions_role_arn" {
  description = "The ARN of the IAM role for GitHub Actions OIDC"
  value       = aws_iam_role.github_actions.arn
}
