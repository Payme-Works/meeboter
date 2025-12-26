# ─── CloudWatch Log Group ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "bots" {
  name              = "/ecs/${local.name}"
  retention_in_days = 3

  tags = local.common_tags
}
