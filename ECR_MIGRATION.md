# GitHub Packages to ECR Migration Guide

This document outlines the changes made to migrate from GitHub Container Registry (ghcr.io) to Amazon Elastic Container Registry (ECR).

## Overview

The migration involves:
1. Creating ECR repositories in AWS
2. Updating Terraform configuration to use ECR image URLs
3. Modifying GitHub Actions workflow to push to ECR
4. Setting up proper IAM roles and permissions

## Changes Made

### 1. Terraform Configuration

#### New Files:
- **`src/terraform/ecr.tf`**: ECR repositories and IAM policies
- **`src/terraform/github-oidc.tf`**: GitHub Actions OIDC configuration

#### Modified Files:
- **`src/terraform/ecs.tf`**: Updated container image URLs from `ghcr.io/*` to ECR URLs
- **`src/terraform/output.tf`**: Added ECR repository URLs and GitHub Actions role ARN outputs

### 2. GitHub Actions Workflow

#### Modified Files:
- **`.github/workflows/docker.yml`**: 
  - Replaced GitHub Package Registry authentication with AWS ECR authentication
  - Updated image naming to use ECR repository URLs
  - Changed permissions from `packages: write` to `id-token: write` for OIDC

## Required Setup Steps

### 1. GitHub OIDC Provider Setup

The GitHub OIDC provider needs to exist in your AWS account. If it doesn't exist, uncomment the resource in `src/terraform/github-oidc.tf`:

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  
  client_id_list = [
    "sts.amazonaws.com",
  ]
  
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]
}
```

### 2. GitHub Repository Settings

Add the following secret to your GitHub repository:
- **`AWS_ROLE_ARN`**: The ARN of the GitHub Actions role (output from Terraform)

### 3. Repository Name Configuration

Update the repository condition in `src/terraform/github-oidc.tf` to match your actual GitHub repository:

```hcl
StringLike = {
  "token.actions.githubusercontent.com:sub" = "repo:YOUR_GITHUB_ORG/YOUR_REPO_NAME/*"
}
```

Replace `meeting-bot` with your actual GitHub organization/user name.

## Deployment Order

1. **Apply Terraform changes** to create ECR repositories and IAM roles
2. **Get the GitHub Actions role ARN** from Terraform outputs
3. **Add AWS_ROLE_ARN secret** to GitHub repository settings
4. **Push changes** to trigger the updated Docker workflow

## ECR Repository Structure

The following ECR repositories will be created:
- `meeting-bot-{workspace}/server`
- `meeting-bot-{workspace}/bots/meet`
- `meeting-bot-{workspace}/bots/teams`
- `meeting-bot-{workspace}/bots/zoom`

Where `{workspace}` is your Terraform workspace (e.g., `dev`, `stage`, `prod`).

## Image Lifecycle Management

ECR repositories are configured with lifecycle policies to:
- Keep the last 10 tagged images (with prefixes: `sha-`, `main`, `v`)
- Delete untagged images after 1 day
- Enable image scanning on push

## Security Considerations

1. **IAM Role Permissions**: The GitHub Actions role has minimal permissions only for ECR operations
2. **Repository Access**: OIDC conditions limit access to specific repository patterns
3. **Image Scanning**: All pushed images are automatically scanned for vulnerabilities
4. **Cross-Account Access**: ECR repositories are private to your AWS account

## Rollback Plan

If you need to rollback to GitHub Packages:
1. Revert the changes in `.github/workflows/docker.yml`
2. Update Terraform `ecs.tf` to use `ghcr.io` URLs
3. Remove ECR-related Terraform resources (optional, but recommended for cleanup)

## Cost Considerations

- ECR charges for storage and data transfer
- GitHub Packages was free for public repositories
- Monitor ECR costs in AWS Cost Explorer

## Troubleshooting

### Common Issues:

1. **OIDC Provider Not Found**: Uncomment and apply the OIDC provider resource
2. **Permission Denied**: Verify AWS_ROLE_ARN secret is correctly set
3. **Repository Not Found**: Ensure ECR repositories are created before pushing images
4. **Image Pull Failures**: Check ECS task execution role has ECR permissions

### Useful Commands:

```bash
# Test ECR authentication locally
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-2.amazonaws.com

# List ECR repositories
aws ecr describe-repositories --region us-east-2

# View ECR images
aws ecr describe-images --repository-name meeting-bot-dev/server --region us-east-2
```
