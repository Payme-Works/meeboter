# Live Boost Terraform Infrastructure

This directory contains the Terraform infrastructure configuration for the Live Boost project, supporting multiple environments (development, staging, production) with shared resources architecture.

## 📁 Directory Structure

```
terraform/
├── README.md                   # This documentation
├── init.sh                     # Initialize all terraform resources
├── apply.sh                    # Deploy infrastructure (shared + environment)
├── shared/                     # Shared resources across environments
│   ├── README.md              # Shared resources documentation
│   ├── scripts/
│   │   ├── init.sh           # Initialize shared resources only
│   │   └── apply.sh          # Deploy shared resources only
│   ├── main.tf               # Shared provider configuration
│   ├── variables.tf          # Shared input variables
│   ├── outputs.tf            # Shared resource outputs
│   ├── route53.tf            # Route53 hosted zone
│   ├── certificate.tf        # Wildcard SSL certificate
│   └── github-oidc.tf        # GitHub Actions OIDC provider
├── main.tf                    # Main provider & backend config
├── variables.tf               # Environment variables
├── output.tf                  # Environment outputs
├── shared-resources.tf        # References to shared resources
├── vpc.tf                     # VPC and networking
├── alb.tf                     # Application Load Balancer
├── dns.tf                     # Environment DNS records
├── rds.tf                     # PostgreSQL database
├── s3.tf                      # S3 buckets
├── ec2.tf                     # ECS EC2 instances
├── ecs.tf                     # ECS cluster and services
├── ecr.tf                     # Container registries
├── github-oidc.tf             # GitHub Actions IAM roles
└── terraform.tfvars.example   # Example variables file
```

## 🚀 Quick Start

### Prerequisites

1. **AWS CLI configured** with the `meeboter` profile:

   ```bash
   aws configure --profile meeboter
   ```

2. **Terraform installed** (>= 1.0):

   ```bash
   terraform version
   ```

3. **Domain ownership**: You must own `meeboter.andredezzy.com` and be able to configure its nameservers

### Initial Setup (Recommended)

```bash
# 1. Clone and navigate to terraform directory
cd terraform/

# 2. Copy and configure variables (optional - has sensible defaults)
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your specific values if needed

# 3. Initialize everything (shared + environment resources)
./init.sh

# 4. Deploy infrastructure to development environment
./apply.sh development
```

### Alternative Setup (Manual)

```bash
# 1. Initialize shared resources first
cd shared/
./scripts/init.sh
./scripts/apply.sh
cd ..

# 2. Initialize environment resources
./init.sh

# 3. Deploy to specific environment
./apply.sh development
```

## 🏗️ Architecture Overview

### Shared Resources (Single Instance)

- **Route53 Hosted Zone**: `meeboter.andredezzy.com`
- **ACM Certificate**: Wildcard `*.meeboter.andredezzy.com`
- **GitHub OIDC Provider**: For GitHub Actions authentication

### Environment-Specific Resources

- **VPC**: Isolated network per environment
- **ALB**: Load balancer with HTTPS termination
- **ECS Cluster**: Container orchestration
- **RDS**: PostgreSQL database
- **ECR**: Container image repositories
- **S3**: Bot data storage
- **DNS**: Environment subdomain (e.g., `development.meeboter.andredezzy.com`)

## 🌍 Environment Management

### Available Environments

- **development**: `development.meeboter.andredezzy.com`
- **staging**: `staging.meeboter.andredezzy.com`
- **production**: `meeboter.andredezzy.com`

### Workspace Usage

**Shared Resources**: Always use `default` workspace

```bash
cd shared/
terraform workspace show  # Always shows 'default'
```

**Environment Resources**: Use environment-specific workspaces

```bash
terraform workspace list
terraform workspace select development
terraform workspace select staging
terraform workspace select production
```

## 🛠️ Scripts & Commands

### Initialization Scripts

| Script                     | Purpose                | Usage                              |
| -------------------------- | ---------------------- | ---------------------------------- |
| `./init.sh`                | Initialize everything  | `./init.sh [upgrade\|reconfigure]` |
| `./shared/scripts/init.sh` | Initialize shared only | Run from terraform/ or shared/     |

### Deployment Scripts

| Script                      | Purpose            | Usage                                           |
| --------------------------- | ------------------ | ----------------------------------------------- |
| `./apply.sh`                | Deploy everything  | `./apply.sh [development\|staging\|production]` |
| `./shared/scripts/apply.sh` | Deploy shared only | Run from terraform/ or shared/                  |

### Common Commands

```bash
# Initialize with provider upgrades
./init.sh upgrade

# Initialize with backend reconfiguration
./init.sh reconfigure

# Deploy to specific environment
./apply.sh development
./apply.sh staging
./apply.sh production

# Manual terraform operations
terraform workspace select development
terraform plan
terraform apply
terraform destroy

# Check current workspace
terraform workspace show

# List all workspaces
terraform workspace list
```

## 📋 Configuration

### Required Variables

Create `terraform.tfvars` with:

```hcl
# Domain configuration
domain_name = "meeboter.andredezzy.com"

# Database configuration
db_instance_class = "db.t3.micro"  # or db.t3.small for production

# GitHub repository (for OIDC)
github_repository = "your-org/your-repo"
```

### Environment Variables

Set these for deployment:

```bash
export AWS_PROFILE=meeboter
export AWS_REGION=us-east-2
```

## 🔧 Advanced Usage

### Working with Shared Resources Only

```bash
# Navigate to shared directory
cd shared/

# Initialize shared resources
./scripts/init.sh

# Deploy shared resources
./scripts/apply.sh

# Check shared outputs
terraform output
```

### Working with Environment Resources Only

```bash
# Ensure shared resources are deployed first
cd shared/ && ./scripts/apply.sh && cd ..

# Select target environment
terraform workspace select development

# Plan changes
terraform plan

# Apply changes
terraform apply
```

### Creating New Environments

```bash
# Create new workspace
terraform workspace new staging

# Deploy to new environment
./apply.sh staging
```

## 🔍 Troubleshooting

### Common Issues

**1. GitHub OIDC Provider Already Exists**

```
Error: EntityAlreadyExists: Provider with url https://token.actions.githubusercontent.com already exists.
```

_Solution_: The provider is now managed in shared resources. No manual import needed.

**2. Certificate Validation Timeout**

```
Error: timeout while waiting for state to become 'ISSUED'
```

_Solution_: Check that your domain's nameservers are set to AWS Route53 nameservers.

**3. Workspace Confusion**

```
Error: Workspaces not supported
```

_Solution_: Ensure you're in the right directory. Shared resources always use default workspace.

**4. State Lock Issues**

```
Error: Error acquiring the state lock
```

_Solution_: Wait for concurrent operations to finish, or force unlock if needed:

```bash
terraform force-unlock LOCK-ID
```

### Debug Commands

```bash
# Check AWS credentials
aws sts get-caller-identity --profile meeboter

# Verify S3 backend
aws s3 ls s3://tf-state-meeboter --profile meeboter

# Check terraform state
terraform state list
terraform show

# Validate configuration
terraform validate

# Check formatting
terraform fmt -check -diff
```

## 📊 Monitoring & Outputs

### Environment Outputs

After deployment, check these outputs:

```bash
terraform output

# Key outputs:
# - ecr_server_repository_url: Docker registry for server
# - database_url: PostgreSQL connection string (sensitive)
# - github_actions_role_arn: IAM role for GitHub Actions
```

### Shared Resource Outputs

```bash
cd shared/
terraform output

# Key outputs:
# - hosted_zone_id: Route53 zone for DNS records
# - certificate_arn: SSL certificate ARN
# - github_oidc_provider_arn: OIDC provider ARN
# - hosted_zone_name_servers: DNS nameservers to configure
```

## 🔒 Security Best Practices

1. **State File Security**: Terraform state is stored in encrypted S3 bucket
2. **IAM Least Privilege**: Each service has minimal required permissions
3. **HTTPS Enforcement**: All traffic redirected from HTTP to HTTPS
4. **Database Security**: RDS in private subnets with security groups
5. **Container Security**: ECR repositories with lifecycle policies

## 📚 Additional Resources

- [Terraform Documentation](https://www.terraform.io/docs)
- [AWS Provider Documentation](https://registry.terraform.io/providers/hashicorp/aws)
- [Live Boost Project README](../README.md)
- [Shared Resources Documentation](./shared/README.md)

## 🆘 Support

For issues or questions:

1. Check this documentation first
2. Review terraform state: `terraform state list`
3. Check AWS Console for resource status
4. Review logs and error messages carefully

---

**Note**: Always deploy shared resources before environment resources. The main `./apply.sh` script handles this automatically.
