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

## Docker Build Guidelines

### Monorepo Docker Builds

- **Always build from monorepo root**: Use `docker build -f apps/<app>/Dockerfile .` 
- **Never build from subdirectories**: Workspace dependencies won't resolve correctly
- **Include workspace context**: Copy `pnpm-workspace.yaml`, root `package.json`, and `packages/` directory
- **Use workspace filtering**: For builds, use `pnpm --filter @package/name build`
- **Protection checks**: All Dockerfiles include root directory validation
- **Disk cleanup**: Run `docker system prune -f --volumes` after builds to manage disk space

### Docker Build Commands

```bash
# Server
docker build -f apps/server/Dockerfile -t live-boost-server .

# Bots  
docker build -f apps/bots/providers/meet/Dockerfile -t live-boost-meet .
docker build -f apps/bots/providers/teams/Dockerfile -t live-boost-teams .
docker build -f apps/bots/providers/zoom/Dockerfile -t live-boost-zoom .
```

## Development Workflow

1. Always check existing code patterns before implementing new features
2. Run linting and type checking before committing changes
3. Test changes thoroughly in development environment
4. Use meaningful commit messages
5. Never commit secrets, API keys, or sensitive information

## Database Migration Rules

- **NEVER run database migrations automatically** - migrations must be explicitly requested by the user
- **NEVER generate migration files** unless specifically asked to do so
- **Always implement schema changes first** in the schema.ts file without running migrations
- **ALWAYS run lint and typecheck after ANY implementation or change** - this is mandatory
- When user requests migration generation, use the appropriate database migration tool (e.g., `drizzle-kit generate`, `prisma migrate dev`)
- Always backup database before running migrations in production environments

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
