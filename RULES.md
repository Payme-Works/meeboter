# Agent Rules

## General Guidelines

- Follow existing code conventions and patterns in the codebase
- Use existing libraries and frameworks already present in the project
- Never assume libraries are available - always check package.json, requirements.txt, or other dependency files first
- Follow security best practices - never expose secrets or credentials
- Write clean, maintainable code with appropriate error handling
- Use TypeScript strict mode when working with TypeScript files

## AWS Configuration

- **Default Profile**: `live-boost`
- **Default Region**: `us-east-2`
- Always use the live-boost profile for AWS operations
- S3 bucket for Terraform state: `tf-state-live-boost`

### AWS CLI Commands

Always include the profile and region when running AWS CLI commands:

```bash
aws <service> <command> --profile live-boost --region us-east-2
```

## Terraform Guidelines

- **State Backend**: Store Terraform state in S3 bucket `tf-state-live-boost`
- **Region**: All resources should be deployed to `us-east-2` unless specified otherwise
- Use proper Terraform formatting with `terraform fmt`
- Always run `terraform plan` before `terraform apply`
- Use meaningful resource names with consistent naming conventions
- Tag all resources appropriately for cost tracking and organization

### Terraform Backend Configuration

```hcl
terraform {
  backend "s3" {
    bucket  = "tf-state-live-boost"
    key     = "terraform.tfstate"
    region  = "us-east-2"
    profile = "live-boost"
  }
}
```

### Terraform Provider Configuration

```hcl
provider "aws" {
  region  = "us-east-2"
  profile = "live-boost"
}
```

## Development Workflow

1. Always check existing code patterns before implementing new features
2. Run linting and type checking before committing changes
3. Test changes thoroughly in development environment
4. Use meaningful commit messages
5. Never commit secrets, API keys, or sensitive information

## Code Quality

- Write self-documenting code with clear variable and function names
- Add comments only when necessary to explain complex logic
- Follow the principle of single responsibility
- Handle errors gracefully with appropriate logging
- Use consistent indentation and formatting

## Security

- Never hardcode credentials or API keys
- Use environment variables for configuration
- Validate all inputs
- Follow principle of least privilege for AWS IAM roles and policies
- Keep dependencies updated and scan for vulnerabilities
