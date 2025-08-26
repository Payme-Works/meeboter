# Create hosted zone - shared across all environments
resource "aws_route53_zone" "this" {
  name = var.domain_name

  tags = {
    Name    = var.domain_name
    Service = "Live Boost"
  }
  
  lifecycle {
    # Prevent destruction since this is shared across environments
    prevent_destroy = true
  }
}