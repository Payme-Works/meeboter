data "aws_route53_zone" "this" {
  name = var.domain_name
}

locals {
  # Create workspace-specific subdomain, except for production which uses the root domain
  workspace_domain = terraform.workspace == "production" ? var.domain_name : "${terraform.workspace}.${var.domain_name}"
}

# Workspace-specific domain A record pointing to the load balancer
resource "aws_route53_record" "root" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = local.workspace_domain
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
