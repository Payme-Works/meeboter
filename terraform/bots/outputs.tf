# ─── Cluster Outputs ──────────────────────────────────────────────────────────

output "cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.this.arn
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.this.name
}

# ─── Network Outputs ──────────────────────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.this.id
}

output "subnet_ids" {
  description = "Public subnet IDs for bot tasks"
  value       = join(",", aws_subnet.public[*].id)
}

output "security_group_id" {
  description = "Security group ID for bot tasks"
  value       = aws_security_group.bot_tasks.id
}

# ─── Task Definition Outputs ──────────────────────────────────────────────────

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

# ─── Milo API Credentials ────────────────────────────────────────────────────

output "milo_aws_access_key_id" {
  description = "AWS Access Key ID for Milo"
  value       = aws_iam_access_key.milo.id
  sensitive   = false
}

output "milo_aws_secret_access_key" {
  description = "AWS Secret Access Key for Milo"
  value       = aws_iam_access_key.milo.secret
  sensitive   = true
}

# ─── Milo Environment Configuration ───────────────────────────────────────────

output "milo_env_config" {
  description = "Environment variables for Milo (credentials shown separately)"
  value       = <<-EOT
# AWS ECS Configuration (add to Milo .env)

AWS_REGION=${var.aws_region}
AWS_ACCESS_KEY_ID=${aws_iam_access_key.milo.id}
AWS_SECRET_ACCESS_KEY=<run: terraform output -raw milo_aws_secret_access_key>
AWS_ECS_CLUSTER=${aws_ecs_cluster.this.name}
AWS_ECS_SUBNETS=${join(",", aws_subnet.public[*].id)}
AWS_ECS_SECURITY_GROUPS=${aws_security_group.bot_tasks.id}
AWS_ECS_TASK_DEF_GOOGLE_MEET=${aws_ecs_task_definition.google_meet_bot.family}
AWS_ECS_TASK_DEF_MICROSOFT_TEAMS=${aws_ecs_task_definition.microsoft_teams_bot.family}
AWS_ECS_TASK_DEF_ZOOM=${aws_ecs_task_definition.zoom_bot.family}
AWS_ECS_ASSIGN_PUBLIC_IP=true
AWS_BOT_LIMIT=200
EOT
}
