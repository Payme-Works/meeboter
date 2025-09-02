// ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${local.name}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = aws_vpc.this.id

  tags = {
    Name = "${local.name}-alb-sg"
  }
}

// Ingress rule for ALB HTTP
resource "aws_security_group_rule" "alb_http_ingress" {
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP web traffic"
  security_group_id = aws_security_group.alb.id
}

// Ingress rule for ALB HTTPS
resource "aws_security_group_rule" "alb_https_ingress" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS web traffic"
  security_group_id = aws_security_group.alb.id
}

// Egress rule for ALB
resource "aws_security_group_rule" "alb_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = [aws_vpc.this.cidr_block]
  security_group_id = aws_security_group.alb.id
}

// Application Load Balancer
resource "aws_lb" "this" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = "${local.name}-alb"
  }
}

// Server Target Group
resource "aws_lb_target_group" "server" {
  name        = "${local.name}-server"
  port        = local.server_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.this.id
  target_type = "instance"

  deregistration_delay = 5

  health_check {
    enabled             = true
    healthy_threshold   = 5
    interval            = 30
    matcher             = "200"
    path                = "/"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 10
    unhealthy_threshold = 2
  }

  load_balancing_cross_zone_enabled = true

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name}-server"
  }
}

# Certificate is now managed in terraform/shared/ - reference it via data source

// HTTP Listener - Redirects ALL traffic to HTTPS
resource "aws_lb_listener" "server_http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

// HTTPS Listener
resource "aws_lb_listener" "server_https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = local.shared_certificate_arn

  default_action {
    type = "forward"
    forward {
      target_group {
        arn = aws_lb_target_group.server.arn
      }
    }
  }
}
