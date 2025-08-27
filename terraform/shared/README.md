# Shared Terraform Resources

This directory contains Terraform resources that are shared across all environments (development, staging, production).

## Structure

```
shared/
├── README.md                    # This file
├── scripts/
│   ├── init.sh                 # Initialize shared resources
│   └── apply.sh                # Deploy shared resources
├── certificate.tf              # Wildcard SSL certificate
├── dns.tf                      # Route53 hosted zone
├── github-oidc.tf              # GitHub Actions OIDC provider
├── main.tf                     # Provider and backend configuration
├── outputs.tf                  # Shared resource outputs
└── variables.tf                # Input variables
```

## Resources Managed

1. **Route53 Hosted Zone**: `live-boost.andredezzy.com`
2. **ACM Certificate**: Wildcard certificate for `*.live-boost.andredezzy.com`
3. **GitHub OIDC Provider**: For GitHub Actions authentication with AWS

## Important Notes

- **Always uses `default` workspace**: Shared resources don't use environment-specific workspaces
- **Single source of truth**: All environments reference these shared resources via remote state
- **Separate state file**: `live-boost/shared/terraform.tfstate` in S3 bucket
- **Deploy once**: These resources need to be deployed only once, regardless of how many environments you have

## Usage

### Initialize Shared Resources

```bash
cd terraform/shared
./scripts/init.sh
```

### Deploy Shared Resources

```bash
cd terraform/shared
./scripts/apply.sh
```

### From Main Terraform

The main `terraform/apply.sh` script automatically handles shared resources deployment.

## Environment Integration

Environment-specific Terraform configurations reference these shared resources via:

```hcl
# In terraform/shared-resources.tf
data "terraform_remote_state" "shared" {
  backend = "s3"
  config = {
    bucket  = "tf-state-live-boost"
    key     = "live-boost/shared/terraform.tfstate"
    region  = "us-east-2"
    profile = "live-boost"
  }
}

locals {
  shared_hosted_zone_id = data.terraform_remote_state.shared.outputs.hosted_zone_id
  shared_certificate_arn = data.terraform_remote_state.shared.outputs.certificate_arn
  shared_domain_name = data.terraform_remote_state.shared.outputs.domain_name
  shared_github_oidc_provider_arn = data.terraform_remote_state.shared.outputs.github_oidc_provider_arn
}
```

## Outputs Available

- `hosted_zone_id`: Route53 hosted zone ID
- `hosted_zone_name_servers`: DNS name servers for domain configuration
- `certificate_arn`: ARN of the wildcard SSL certificate
- `domain_name`: The base domain name
- `github_oidc_provider_arn`: ARN of the GitHub OIDC provider

## Best Practices

1. **Deploy shared resources first**: Always deploy shared resources before environment resources
2. **Use default workspace**: Never change from default workspace in shared resources
3. **Minimal changes**: Shared resources should be stable and change infrequently
4. **Backup state**: The shared state file is critical for all environments
