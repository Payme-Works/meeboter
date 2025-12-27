# ─── CloudWatch Log Group ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "bots" {
  name              = "/ecs/${local.name}"
  retention_in_days = 1 # Cost optimization: minimal retention for ephemeral bot logs

  tags = local.common_tags
}
