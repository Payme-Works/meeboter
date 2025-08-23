#!/bin/bash

# Meeting Bot Docker Build & Push Script
# This script builds all Docker images and pushes them to AWS ECR
# It also creates the S3 bucket for Terraform state if it doesn't exist

set -euo pipefail

# Configuration
AWS_PROFILE=${AWS_PROFILE:-"meeting-bot"}
PROJECT_NAME="meeting-bot"
AWS_REGION=${AWS_REGION:-"us-east-2"}
TERRAFORM_WORKSPACE=${TERRAFORM_WORKSPACE:-"default"}
TAG=${TAG:-"sha-$(git rev-parse --short HEAD)"}
SKIP_RESTART=${SKIP_RESTART:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running from project root
    if [[ ! -f "package.json" ]] || [[ ! -d "src" ]]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    # Check required tools
    local required_tools=("docker" "aws" "git" "pnpm")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" &> /dev/null; then
        log_error "AWS credentials not configured or invalid for profile: $AWS_PROFILE"
        exit 1
    fi
    
    # Check git status
    if [[ -n $(git status --porcelain) ]]; then
        log_warning "Working directory has uncommitted changes"
    fi
    
    log_success "All prerequisites met"
}

# Get AWS account ID
get_aws_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    log_info "Using AWS Account: $AWS_ACCOUNT_ID"
}

# Create S3 bucket for Terraform state if it doesn't exist
create_s3_bucket() {
    local bucket_name="tf-state-meeting-bot"
    
    log_info "Checking if S3 bucket '$bucket_name' exists..."
    
    if aws s3api head-bucket --bucket "$bucket_name" --profile "$AWS_PROFILE" --region "$AWS_REGION" 2>/dev/null; then
        log_success "S3 bucket '$bucket_name' already exists"
        return 0
    fi
    
    log_info "Creating S3 bucket '$bucket_name' for Terraform state..."
    
    # Create the bucket
    if aws s3api create-bucket \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION" 2>/dev/null; then
        
        log_success "S3 bucket '$bucket_name' created successfully"
    else
        # If LocationConstraint fails (us-east-1 doesn't support it), try without it
        if aws s3api create-bucket \
            --bucket "$bucket_name" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" 2>/dev/null; then
            
            log_success "S3 bucket '$bucket_name' created successfully"
        else
            log_error "Failed to create S3 bucket '$bucket_name'"
            exit 1
        fi
    fi
    
    # Enable versioning for the bucket
    log_info "Enabling versioning for S3 bucket '$bucket_name'..."
    if aws s3api put-bucket-versioning \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --versioning-configuration Status=Enabled; then
        
        log_success "Versioning enabled for S3 bucket '$bucket_name'"
    else
        log_warning "Failed to enable versioning for S3 bucket '$bucket_name'"
    fi
    
    # Add encryption by default
    log_info "Configuring default encryption for S3 bucket '$bucket_name'..."
    if aws s3api put-bucket-encryption \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --server-side-encryption-configuration '{
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }
            ]
        }'; then
        
        log_success "Default encryption configured for S3 bucket '$bucket_name'"
    else
        log_warning "Failed to configure default encryption for S3 bucket '$bucket_name'"
    fi
    
    # Block public access
    log_info "Blocking public access for S3 bucket '$bucket_name'..."
    if aws s3api put-public-access-block \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true; then
        
        log_success "Public access blocked for S3 bucket '$bucket_name'"
    else
        log_warning "Failed to block public access for S3 bucket '$bucket_name'"
    fi
}

# Build ECR repository URLs
build_ecr_urls() {
    ECR_BASE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
    ECR_SERVER="$ECR_BASE/$PROJECT_NAME-$TERRAFORM_WORKSPACE/server"
    ECR_MEET="$ECR_BASE/$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/meet"
    ECR_TEAMS="$ECR_BASE/$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/teams"
    ECR_ZOOM="$ECR_BASE/$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/zoom"
    
    log_info "ECR URLs configured for workspace: $TERRAFORM_WORKSPACE"
}

# Login to ECR
ecr_login() {
    log_info "Logging into AWS ECR..."
    aws ecr get-login-password --profile "$AWS_PROFILE" --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_BASE"
    log_success "ECR login successful"
}

# Check if ECR repositories exist
check_ecr_repositories() {
    log_info "Checking ECR repositories..."
    
    local repos=(
        "$PROJECT_NAME-$TERRAFORM_WORKSPACE/server"
        "$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/meet"
        "$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/teams"
        "$PROJECT_NAME-$TERRAFORM_WORKSPACE/bots/zoom"
    )
    
    for repo in "${repos[@]}"; do
        if ! aws ecr describe-repositories --profile "$AWS_PROFILE" --repository-names "$repo" --region "$AWS_REGION" &> /dev/null; then
            log_error "ECR repository '$repo' not found. Please run 'terraform apply' first."
            exit 1
        fi
    done
    
    log_success "All ECR repositories exist"
}

# Install dependencies and run typecheck
prepare_build() {
    log_info "Installing dependencies and running typecheck..."
    
    # Install root dependencies
    pnpm install
    
    # Run typecheck
    if pnpm run typecheck; then
        log_success "Typecheck passed"
    else
        log_error "Typecheck failed"
        exit 1
    fi
}

# Build and push server image
build_server() {
    log_info "Building server image..."
    
    cd src/server
    
    # Build the Docker image
    if ! docker build \
        --platform linux/amd64 \
        --build-arg AUTH_SECRET="dummy" \
        --build-arg AUTH_GITHUB_ID="dummy" \
        --build-arg AUTH_GITHUB_SECRET="dummy" \
        --build-arg DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
        --build-arg GITHUB_TOKEN="dummy" \
        --build-arg AWS_ACCESS_KEY_ID="dummy" \
        --build-arg AWS_SECRET_ACCESS_KEY="dummy" \
        --build-arg AWS_BUCKET_NAME="dummy" \
        --build-arg AWS_REGION="dummy" \
        --build-arg ECS_TASK_DEFINITION_MEET="dummy" \
        --build-arg ECS_TASK_DEFINITION_TEAMS="dummy" \
        --build-arg ECS_TASK_DEFINITION_ZOOM="dummy" \
        --build-arg ECS_CLUSTER_NAME="dummy" \
        --build-arg ECS_SUBNETS="dummy" \
        --build-arg ECS_SECURITY_GROUPS="dummy" \
        -t "$ECR_SERVER:$TAG" \
        -t "$ECR_SERVER:latest" \
        .; then
        
        log_error "Failed to build server image"
        cd ../..
        exit 1
    fi
    
    # Push images
    if ! docker push "$ECR_SERVER:$TAG"; then
        log_error "Failed to push server image with tag $TAG"
        cd ../..
        exit 1
    fi
    
    if ! docker push "$ECR_SERVER:latest"; then
        log_error "Failed to push server image with latest tag"
        cd ../..
        exit 1
    fi
    
    cd ../..
    log_success "Server image built and pushed"
}

# Build and push bot images
build_bot() {
    local bot_type=$1
    local ecr_url=$2
    
    log_info "Building $bot_type bot image..."
    
    cd src/bots
    
    # Build the Docker image
    if ! docker build \
        --platform linux/amd64 \
        -f "$bot_type/Dockerfile" \
        -t "$ecr_url:$TAG" \
        -t "$ecr_url:latest" \
        .; then
        
        log_error "Failed to build $bot_type bot image"
        cd ../..
        exit 1
    fi
    
    # Push images
    if ! docker push "$ecr_url:$TAG"; then
        log_error "Failed to push $bot_type bot image with tag $TAG"
        cd ../..
        exit 1
    fi
    
    if ! docker push "$ecr_url:latest"; then
        log_error "Failed to push $bot_type bot image with latest tag"
        cd ../..
        exit 1
    fi
    
    cd ../..
    log_success "$bot_type bot image built and pushed"
}

# Restart ECS services to pull latest images
restart_services() {
    log_info "Restarting ECS services to pull latest images..."
    
    # Get cluster name from Terraform outputs or use default
    local cluster_name
    if command -v terraform &> /dev/null && [[ -d src/terraform ]]; then
        cd src/terraform
        cluster_name=$(terraform output -raw ecs_cluster_name 2>/dev/null || echo "$PROJECT_NAME-$TERRAFORM_WORKSPACE")
        cd ../..
    else
        cluster_name="$PROJECT_NAME-$TERRAFORM_WORKSPACE"
        log_warning "Terraform not available, using default cluster name: $cluster_name"
    fi
    
    # List of services to restart
    local services=(
        "$PROJECT_NAME-$TERRAFORM_WORKSPACE-server"
    )
    
    # Force new deployment for each service
    for service in "${services[@]}"; do
        log_info "Restarting service: $service"
        
        # Check if service exists
        if aws ecs describe-services \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --cluster "$cluster_name" \
            --services "$service" \
            --query 'services[0].serviceName' \
            --output text 2>/dev/null | grep -q "$service"; then
            
            # Force new deployment
            aws ecs update-service \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --service "$service" \
                --force-new-deployment \
                --output text > /dev/null
            
            log_success "Service $service deployment initiated"
            
            # Wait for deployment to complete
            log_info "Waiting for $service deployment to complete..."
            if aws ecs wait services-stable \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --services "$service" \
                --max-attempts 20 \
                --delay 30; then
                log_success "Service $service deployed successfully"
            else
                log_warning "Service $service deployment may still be in progress"
            fi
        else
            log_warning "Service $service not found in cluster $cluster_name"
        fi
    done
    
    log_success "All services restart initiated"
}

# Clean up Docker images locally
cleanup() {
    log_info "Cleaning up local Docker images..."
    
    # Remove local images to free up space
    docker rmi "$ECR_SERVER:$TAG" "$ECR_SERVER:latest" 2>/dev/null || true
    docker rmi "$ECR_MEET:$TAG" "$ECR_MEET:latest" 2>/dev/null || true
    docker rmi "$ECR_TEAMS:$TAG" "$ECR_TEAMS:latest" 2>/dev/null || true
    docker rmi "$ECR_ZOOM:$TAG" "$ECR_ZOOM:latest" 2>/dev/null || true
    
    # Prune unused images and build cache
    docker image prune -f
    docker builder prune -f
    
    log_success "Cleanup completed"
}

# Main execution
main() {
    log_info "Starting Meeting Bot build and deployment process..."
    log_info "Tag: $TAG"
    log_info "AWS Region: $AWS_REGION"
    log_info "Terraform Workspace: $TERRAFORM_WORKSPACE"
    
    check_prerequisites
    get_aws_account_id
    create_s3_bucket
    build_ecr_urls
    ecr_login
    check_ecr_repositories
    prepare_build
    
    # Build and push all images
    build_server
    build_bot "meet" "$ECR_MEET"
    build_bot "teams" "$ECR_TEAMS"
    build_bot "zoom" "$ECR_ZOOM"
    
    # Restart services to pull latest images (unless skipped)
    if [[ "$SKIP_RESTART" != "true" ]]; then
        restart_services
    else
        log_info "Skipping service restart (SKIP_RESTART=true)"
    fi
    
    # Cleanup
    cleanup
    
    log_success "Build and deployment process completed!"
    log_info "Tagged images:"
    log_info "  Server: $ECR_SERVER:$TAG"
    log_info "  Meet Bot: $ECR_MEET:$TAG"
    log_info "  Teams Bot: $ECR_TEAMS:$TAG"
    log_info "  Zoom Bot: $ECR_ZOOM:$TAG"
}

# Handle script interruption - only cleanup on normal exit, not on errors
trap cleanup_on_interrupt INT TERM

cleanup_on_interrupt() {
    log_warning "Build process interrupted"
    exit 130
}

# Show help
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    cat <<EOF
Meeting Bot Docker Build & Push Script

Usage: $0 [OPTIONS]

Environment Variables:
  AWS_REGION              AWS region (default: us-east-2)
  TERRAFORM_WORKSPACE     Terraform workspace (default: default)
  TAG                     Docker image tag (default: git short hash)
  SKIP_RESTART            Skip ECS service restart (default: false)

Options:
  -h, --help             Show this help message

Examples:
  $0                                    # Build with defaults
  AWS_REGION=us-west-2 $0              # Build for different region
  TERRAFORM_WORKSPACE=prod $0          # Build for production
  TAG=v1.0.0 $0                       # Build with custom tag
  SKIP_RESTART=true $0                 # Build without restarting services

Prerequisites:
  - Docker installed and running
  - AWS CLI configured with appropriate permissions
  - pnpm package manager
  - git repository
  - Terraform infrastructure deployed (ECR repositories must exist)
  - S3 bucket for Terraform state will be created automatically if needed

The script will:
  1. Validate prerequisites
  2. Create S3 bucket for Terraform state if it doesn't exist
  3. Build all Docker images (server + 3 bot types)
  4. Push images to AWS ECR
  5. Restart ECS services to pull latest images
  6. Clean up local Docker images
EOF
    exit 0
fi

# Run main function
main "$@"