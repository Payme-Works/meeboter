#!/bin/bash

# Meeboter Deployment Script
# This script deploys the Meeboter infrastructure and applications
# It applies Terraform, builds Docker images, and pushes them to AWS ECR
#
# Usage:
#   ./deploy.sh                                    # Deploy all images to development
#   ./deploy.sh --images server                    # Build only server image
#   ./deploy.sh --images server,bots-meet          # Build server and meet bot images
#   ./deploy.sh --workspace production             # Deploy to production
#   ./deploy.sh --skip-terraform --images server   # Only build/push images, skip infrastructure
#   ./deploy.sh -w staging --images bots-meet      # Deploy meet bot to staging

set -euo pipefail

# Configuration
PROJECT_NAME="meeboter"

AWS_PROFILE=${AWS_PROFILE:-"meeboter"}
AWS_REGION=${AWS_REGION:-"us-east-2"}

TERRAFORM_WORKSPACE=${TERRAFORM_WORKSPACE:-"development"}  # Default to development

TAG=${TAG:-"sha-$(git rev-parse --short HEAD)"}

SKIP_RESTART=${SKIP_RESTART:-false}
SKIP_TERRAFORM=${SKIP_TERRAFORM:-false}
IMAGES=${IMAGES:-"all"}

# Disable AWS CLI pager globally
export AWS_PAGER=""

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

# Select environment function
select_environment() {
    log_info "Available environments:"
    echo "  1) development (default)"
    echo "  2) staging" 
    echo "  3) production"
    echo
    
    while true; do
        read -p "Please select an environment (1-3, or press Enter for development): " choice
        # Default to development if user just presses Enter
        if [[ -z "$choice" ]]; then
            choice=1
        fi
        
        case $choice in
            1)
                TERRAFORM_WORKSPACE="development"
                break
                ;;
            2)
                TERRAFORM_WORKSPACE="staging"
                break
                ;;
            3)
                TERRAFORM_WORKSPACE="production"
                break
                ;;
            *)
                log_error "Invalid selection. Please choose 1, 2, or 3."
                ;;
        esac
    done
    
    log_success "Selected environment: $TERRAFORM_WORKSPACE"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running from project root
    if [[ ! -f "package.json" ]] || [[ ! -d "apps" ]]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    # Check required tools
    local required_tools=("docker" "aws" "git" "bun")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check AWS credentials
    check_aws_credentials
    
    # Check git status
    if [[ -n $(git status --porcelain) ]]; then
        log_warning "Working directory has uncommitted changes"
    fi
    
    log_success "All prerequisites met"
}

# Check AWS credentials and handle SSO login
check_aws_credentials() {
    log_info "Checking AWS credentials for profile: $AWS_PROFILE"
    
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --no-cli-pager &> /dev/null; then
        log_warning "AWS credentials not configured or invalid for profile: $AWS_PROFILE"
        log_info "Attempting to login via AWS SSO..."
        
        if aws sso login --profile "$AWS_PROFILE"; then
            log_success "AWS SSO login successful"
            
            # Verify credentials after login
            if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --no-cli-pager &> /dev/null; then
                log_error "AWS credentials still invalid after SSO login"
                exit 1
            fi
        else
            log_error "AWS SSO login failed"
            log_error "Please ensure your AWS SSO configuration is correct and try again"
            exit 1
        fi
    else
        log_success "AWS credentials are valid"
    fi
}

# Get AWS account ID
get_aws_account_id() {
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text --no-cli-pager)
    log_info "Using AWS Account: $AWS_ACCOUNT_ID"
}

# Create S3 bucket for Terraform state if it doesn't exist
create_s3_bucket() {
    local bucket_name="tf-state-meeboter"
    
    log_info "Checking if S3 bucket '$bucket_name' exists..."
    
    if aws s3api head-bucket --bucket "$bucket_name" --profile "$AWS_PROFILE" --region "$AWS_REGION" --no-cli-pager 2>/dev/null; then
        log_success "S3 bucket '$bucket_name' already exists"
        return 0
    fi
    
    log_info "Creating S3 bucket '$bucket_name' for Terraform state..."
    
    # Create the bucket
    if aws s3api create-bucket \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION" \
        --no-cli-pager 2>/dev/null; then
        
        log_success "S3 bucket '$bucket_name' created successfully"
    else
        # If LocationConstraint fails (us-east-1 doesn't support it), try without it
        if aws s3api create-bucket \
            --bucket "$bucket_name" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --no-cli-pager 2>/dev/null; then
            
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
        --versioning-configuration Status=Enabled \
        --no-cli-pager; then
        
        log_success "Versioning enabled for S3 bucket '$bucket_name'"
    else
        log_warning "Failed to enable versioning for S3 bucket '$bucket_name'"
    fi
    
    # Add encryption by default
    log_info "Configuring default encryption for S3 bucket '$bucket_name'..."

    if aws s3api put-bucket-encryption \
        --bucket "$bucket_name" \
        --profile "$AWS_PROFILE" \
        --no-cli-pager \
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
        --no-cli-pager \
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

# Check Docker daemon health
check_docker() {
    log_info "Checking Docker daemon..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker info >/dev/null 2>&1; then
            log_success "Docker daemon is ready"
            return 0
        fi
        
        log_warning "Docker daemon not ready, attempt $attempt/$max_attempts (waiting 2s...)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "Docker daemon is not responding after $max_attempts attempts"
    log_error "Please ensure Docker Desktop is running and try again"
    exit 1
}

# Login to ECR
ecr_login() {
    log_info "Logging into AWS ECR..."
    
    # Check Docker daemon first
    check_docker
    
    # Test ECR connectivity
    log_info "Testing ECR connectivity..."
    if ! aws ecr describe-repositories --profile "$AWS_PROFILE" --region "$AWS_REGION" --max-items 1 >/dev/null 2>&1; then
        log_error "Cannot connect to ECR. Check AWS credentials and permissions."
        exit 1
    fi
    
    # Get login password
    log_info "Getting ECR login token..."
    local login_password
    if ! login_password=$(aws ecr get-login-password --profile "$AWS_PROFILE" --region "$AWS_REGION" --no-cli-pager 2>/dev/null); then
        log_error "Failed to get ECR login password. Check AWS credentials."
        exit 1
    fi
    
    # Docker login with retry mechanism
    log_info "Logging into Docker registry..."
    local login_attempts=3
    local attempt=1
    
    while [ $attempt -le $login_attempts ]; do
        if echo "$login_password" | docker login --username AWS --password-stdin "$ECR_BASE" >/dev/null 2>&1; then
            log_success "ECR login successful"
            return 0
        fi
        
        log_warning "ECR login attempt $attempt/$login_attempts failed, retrying..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "Failed to login to ECR Docker registry after $login_attempts attempts"
    exit 1
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
        if ! aws ecr describe-repositories --profile "$AWS_PROFILE" --repository-names "$repo" --region "$AWS_REGION" --no-cli-pager &> /dev/null; then
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
    bun install
    
    # Run typecheck
    if bun run typecheck; then
        log_success "Typecheck passed"
    else
        log_error "Typecheck failed"
        exit 1
    fi
}

# Check if an image should be built based on IMAGES variable
should_build_image() {
    local image_name=$1
    
    if [[ "$IMAGES" == "all" ]]; then
        return 0
    fi
    
    # Convert comma-separated list to array and check each item
    IFS=',' read -ra ADDR <<< "$IMAGES"
    for i in "${ADDR[@]}"; do
        if [[ "$i" == "$image_name" ]]; then
            return 0
        fi
    done
    
    return 1
}

# Build, push, and remove server image
build_and_push_server() {
    if ! should_build_image "server"; then
        log_info "Skipping server image build (not in --images list)"
        return 0
    fi
    
    log_info "Building server image..."
    
    # Build from monorepo root with proper context
    if ! docker build \
        --platform linux/amd64 \
        --build-arg AUTH_SECRET="dummy" \
        --build-arg AUTH_GITHUB_ID="dummy" \
        --build-arg AUTH_GITHUB_SECRET="dummy" \
        --build-arg DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
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
        -f apps/milo/Dockerfile \
        -t "$ECR_SERVER:$TAG" \
        -t "$ECR_SERVER:latest" \
        .; then
        
        log_error "Failed to build server image"
        exit 1
    fi
    
    log_success "Server image built"
    
    # Push immediately after build
    log_info "Pushing server image to ECR..."

    docker push "$ECR_SERVER:$TAG"
    docker push "$ECR_SERVER:latest"

    log_success "Server image pushed"
}

# Build, push, and remove bot images
build_and_push_bot_provider() {
    local bot_type=$1
    local ecr_url=$2
    local image_name="bots-$bot_type"
    
    if ! should_build_image "$image_name"; then
        log_info "Skipping $bot_type bot image build (not in --images list)"
        return 0
    fi
    
    log_info "Building $bot_type bot image..."
    
    # Build from monorepo root with proper context
    if ! docker build \
        --platform linux/amd64 \
        -f "apps/bots/providers/$bot_type/Dockerfile" \
        -t "$ecr_url:$TAG" \
        -t "$ecr_url:latest" \
        .; then
        
        log_error "Failed to build $bot_type bot image"
        exit 1
    fi
    
    log_success "$bot_type bot image built"
    
    # Push immediately after build
    log_info "Pushing $bot_type bot image to ECR..."

    docker push "$ecr_url:$TAG"
    docker push "$ecr_url:latest"

    log_success "$bot_type bot image pushed"
}


# Comprehensive Docker cleanup function
docker_cleanup() {
    local cleanup_type=${1:-"standard"}
    
    case $cleanup_type in
        "error")
            log_error "Deployment failed, performing comprehensive Docker cleanup..."
            
            # Kill any running Docker builds
            docker ps -q --filter "ancestor=node:20-alpine" | xargs -r docker kill 2>/dev/null || true
            docker ps -q --filter "ancestor=mcr.microsoft.com/playwright:v1.52.0-jammy" | xargs -r docker kill 2>/dev/null || true
            
            # Remove any images that might have been built but not pushed or removed
            docker rmi "$ECR_SERVER:$TAG" "$ECR_SERVER:latest" 2>/dev/null || true
            docker rmi "$ECR_MEET:$TAG" "$ECR_MEET:latest" 2>/dev/null || true
            docker rmi "$ECR_TEAMS:$TAG" "$ECR_TEAMS:latest" 2>/dev/null || true
            docker rmi "$ECR_ZOOM:$TAG" "$ECR_ZOOM:latest" 2>/dev/null || true
            
            # Remove intermediate/untagged images
            docker images --filter "dangling=true" -q | xargs -r docker rmi 2>/dev/null || true
            ;;
        *)
            log_info "Running Docker cleanup..."
            ;;
    esac
    
    # Common cleanup operations for all types
    # Remove all stopped containers
    docker container prune -f 2>/dev/null || true
    
    # Remove all dangling images
    docker image prune -f 2>/dev/null || true
    
    # Remove unused networks
    docker network prune -f 2>/dev/null || true
    
    # Remove unused volumes
    docker volume prune -f 2>/dev/null || true
    
    # Clean build cache aggressively
    docker builder prune -af 2>/dev/null || true
    
    # System-wide cleanup to free maximum disk space
    docker system prune -af --volumes 2>/dev/null || true
    
    log_success "Docker cleanup completed"
}

# Restart ECS services to pull latest images
restart_services() {
    log_info "Restarting ECS services to pull latest images..."
    
    # Get cluster name from Terraform outputs or use default
    local cluster_name
    if command -v terraform &> /dev/null && [[ -d terraform ]]; then
        cd terraform
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
            --output text \
            --no-cli-pager 2>/dev/null | grep -q "$service"; then
            
            # Force new deployment
            aws ecs update-service \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --service "$service" \
                --force-new-deployment \
                --output text \
                --no-cli-pager > /dev/null
            
            log_success "Service $service deployment initiated"
            
            # Wait for deployment to complete
            log_info "Waiting for $service deployment to complete..."
            if aws ecs wait services-stable \
                --profile "$AWS_PROFILE" \
                --region "$AWS_REGION" \
                --cluster "$cluster_name" \
                --services "$service" \
                --no-cli-pager; then
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

# Apply Terraform changes for the selected workspace
apply_terraform() {
    log_info "Applying Terraform changes for workspace: $TERRAFORM_WORKSPACE"
    
    # Use the dedicated apply script
    if [[ -f "terraform/apply.sh" ]]; then
        log_info "Using terraform/apply.sh for deployment..."
        if bash terraform/apply.sh "$TERRAFORM_WORKSPACE"; then
            log_success "Terraform apply completed successfully"
        else
            log_error "Terraform apply failed"
            exit 1
        fi
    else
        log_warning "terraform/apply.sh not found, falling back to direct terraform commands"
        
        # Navigate to terraform directory
        local current_dir=$(pwd)
        cd terraform
        
        # Initialize if needed
        if [[ ! -d ".terraform" ]]; then
            log_info "Initializing Terraform..."
            ./init.sh
        fi
        
        # Select the workspace
        log_info "Selecting Terraform workspace: $TERRAFORM_WORKSPACE"
        if terraform workspace list | grep -q "\\s$TERRAFORM_WORKSPACE$"; then
            terraform workspace select "$TERRAFORM_WORKSPACE"
        else
            log_info "Creating new workspace: $TERRAFORM_WORKSPACE"
            terraform workspace new "$TERRAFORM_WORKSPACE"
        fi
        
        # Apply terraform changes
        log_info "Applying Terraform configuration..."
        if terraform apply -auto-approve; then
            log_success "Terraform apply completed successfully"
        else
            log_error "Terraform apply failed"
            cd "$current_dir"
            exit 1
        fi
        
        # Return to original directory
        cd "$current_dir"
    fi
}


# Main execution with guaranteed cleanup
main() {
    log_info "Starting Meeboter deployment process..."
    
    # Set up cleanup trap for both success and failure
    trap 'cleanup_on_exit' EXIT
    
    # Check Docker daemon first before any operations
    check_docker
    
    # Skip environment selection if workspace was provided via flag or env var
    # But allow SKIP_ENV_PROMPT env var to skip the prompt for automation
    if [[ "${SKIP_ENV_PROMPT:-false}" == "true" ]] || [[ "${WORKSPACE_PROVIDED:-false}" == "true" ]]; then
        # Validate provided workspace name
        case "$TERRAFORM_WORKSPACE" in
            "development"|"staging"|"production")
                log_success "Using environment: $TERRAFORM_WORKSPACE (${WORKSPACE_PROVIDED:+flag provided}${SKIP_ENV_PROMPT:+prompt skipped})"
                ;;
            *)
                log_error "Invalid TERRAFORM_WORKSPACE: $TERRAFORM_WORKSPACE. Must be one of: development, staging, production"
                exit 1
                ;;
        esac
    else
        # Show environment selection to make user aware
        select_environment
    fi
    
    log_info "Tag: $TAG"
    log_info "AWS Region: $AWS_REGION"
    log_info "Terraform Workspace: $TERRAFORM_WORKSPACE"
    log_info "Images to build: $IMAGES"
    
    check_prerequisites
    get_aws_account_id
    create_s3_bucket
    
    # Apply Terraform changes for the selected workspace first (unless skipped)
    if [[ "$SKIP_TERRAFORM" != "true" ]]; then
        apply_terraform
    else
        log_info "Skipping Terraform apply (SKIP_TERRAFORM=true)"
    fi
    
    build_ecr_urls
    ecr_login
    check_ecr_repositories
    prepare_build
    
    # Build, push, and remove images one by one to save disk space
    build_and_push_server

    docker_cleanup "standard"

    build_and_push_bot_provider "meet" "$ECR_MEET"

    docker_cleanup "standard"

    build_and_push_bot_provider "teams" "$ECR_TEAMS"

    docker_cleanup "standard"

    build_and_push_bot_provider "zoom" "$ECR_ZOOM"

    docker_cleanup "standard"
    
    # Restart services to pull latest images (unless skipped)
    if [[ "$SKIP_RESTART" != "true" ]]; then
        restart_services
    else
        log_info "Skipping service restart (SKIP_RESTART=true)"
    fi
    
    log_success "Deployment process completed!"
    log_info "Tagged images:"
    log_info "- Server: $ECR_SERVER:$TAG"
    log_info "- Meet Bot: $ECR_MEET:$TAG"
    log_info "- Teams Bot: $ECR_TEAMS:$TAG"
    log_info "- Zoom Bot: $ECR_ZOOM:$TAG"
}


# Unified cleanup function that runs on any exit
cleanup_on_exit() {
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        log_info "Deployment completed successfully, running cleanup..."
        docker_cleanup "standard"
    else
        log_error "Deployment failed (exit code: $exit_code), running comprehensive cleanup..."
        docker_cleanup "error"
    fi
}

cleanup_on_failure() {
    log_error "Build failed, running cleanup..."
    docker_cleanup "error"
    exit 1
}

cleanup_on_interrupt() {
    log_warning "Build process interrupted"
    docker_cleanup "error"
    exit 130
}

trap cleanup_on_interrupt INT TERM
trap cleanup_on_failure ERR

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --images)
                IMAGES="$2"
                shift 2
                ;;
            --workspace|-w)
                TERRAFORM_WORKSPACE="$2"
                WORKSPACE_PROVIDED="true"
                shift 2
                ;;
            --skip-terraform)
                SKIP_TERRAFORM="true"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Show help
show_help() {
    cat <<EOF
Meeboter Deployment Script

Usage: $0 [OPTIONS]

Environment Variables:
  AWS_REGION              AWS region (default: us-east-2)
  TERRAFORM_WORKSPACE     Terraform workspace (default: development)
  TAG                     Docker image tag (default: git short hash)
  SKIP_RESTART            Skip ECS service restart (default: false)
  SKIP_TERRAFORM          Skip Terraform apply (default: false)
  IMAGES                  Images to build (default: all)

Options:
  --images <list>        Comma-separated list of images to build
                         Options: server, bots-meet, bots-teams, bots-zoom, all
                         Examples: --images server
                                  --images server,bots-meet
                                  --images bots-meet,bots-teams,bots-zoom
  -w, --workspace <env>  Terraform workspace (development, staging, production)
  --skip-terraform       Skip Terraform apply step
  -h, --help             Show this help message

Examples:
  $0                                    # Deploy to development (default)
  $0 --workspace production             # Deploy to production
  $0 -w staging                         # Deploy to staging  
  TAG=v1.0.0 $0                        # Deploy with custom tag
  SKIP_RESTART=true $0                 # Deploy without restarting services
  $0 --skip-terraform                  # Only build/push images, skip infrastructure
  $0 --images server                   # Build and push only server image
  $0 --images server,bots-meet         # Build and push server and meet bot images
  $0 --workspace staging --images server # Build server image for staging
  $0 --skip-terraform --images bots-meet # Build meet bot without Terraform

Prerequisites:
  - Docker installed and running
  - AWS CLI configured with appropriate permissions
  - bun package manager
  - git repository
  - Terraform installed and configured
  - S3 bucket for Terraform state will be created automatically if needed

The script will:
  1. Prompt for environment selection (development/staging/production)
  2. Validate prerequisites and AWS credentials
  3. Create S3 bucket for Terraform state if it doesn't exist
  4. Apply Terraform configuration for selected workspace
  5. Build all Docker images (server + 3 bot providers)
  6. Push images to AWS ECR
  7. Restart ECS services to deploy latest images
  8. Clean up local Docker images
EOF
}

# Parse arguments and run main function
parse_args "$@"
main