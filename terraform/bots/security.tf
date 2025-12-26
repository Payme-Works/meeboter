# ─── Security Group for Bot Tasks ─────────────────────────────────────────────

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
