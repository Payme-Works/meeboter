output "hosted_zone_id" {
  description = "The hosted zone ID for the domain"
  value       = aws_route53_zone.this.zone_id
}

output "hosted_zone_name_servers" {
  description = "The name servers for the hosted zone"
  value       = aws_route53_zone.this.name_servers
}

output "certificate_arn" {
  description = "The ARN of the wildcard certificate"
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "domain_name" {
  description = "The domain name"
  value       = var.domain_name
}

output "github_oidc_provider_arn" {
  description = "The ARN of the GitHub OIDC provider"
  value       = aws_iam_openid_connect_provider.github.arn
}