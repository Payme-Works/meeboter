# Hosted zone is now managed in terraform/shared/ - reference it via data source

locals {
  # Create workspace-specific subdomain, except for production which uses the root domain
  workspace_domain = terraform.workspace == "production" ? local.shared_domain_name : "${terraform.workspace}.${local.shared_domain_name}"
}

# Workspace-specific domain A record pointing to the load balancer
resource "aws_route53_record" "root" {
  zone_id = local.shared_hosted_zone_id
  name    = local.workspace_domain
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
