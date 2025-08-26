#!/bin/bash

# Terraform apply script
# Handles shared resources first, then environment resources

set -euo pipefail

# Disable AWS CLI pager for non-interactive usage
export AWS_PAGER=""

# Configuration
ENVIRONMENT="${1:-development}"
SHARED_DIR="shared"
AWS_PROFILE=${AWS_PROFILE:-"live-boost"}
AWS_REGION=${AWS_REGION:-"us-east-2"}

# Colors for output (same as deploy.sh)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions (same as deploy.sh)
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

log_info "Applying Terraform"
log_info "Environment: $ENVIRONMENT"

# Detect if we're running from project root or terraform directory
if [[ -f "terraform/apply.sh" && ! -f "apply.sh" ]]; then
    # Running from project root, change to terraform directory
    log_info "Changing to terraform directory..."
    cd terraform
fi

# Step 1: Deploy shared resources first
if [[ -d "$SHARED_DIR" ]]; then
    log_info "Deploying shared resources using dedicated script..."
    
    if [[ -f "$SHARED_DIR/scripts/apply.sh" ]]; then
        if "$SHARED_DIR/scripts/apply.sh"; then
            log_success "Shared resources deployment completed!"
        else
            log_error "Failed to deploy shared resources"
            exit 1
        fi
    else
        log_error "Shared apply script not found at $SHARED_DIR/scripts/apply.sh"
        exit 1
    fi
else
    log_warning "Shared directory not found, skipping shared resources"
fi

log_info "Deploying environment resources..."

# Check if environment resources are initialized
if [[ ! -d ".terraform" ]]; then
    log_info "Initializing environment resources..."

    if [[ -f "init.sh" ]]; then
        ./init.sh
    else
        log_error "init.sh not found in current directory"
        exit 1
    fi
fi

# Select the correct workspace
log_info "Selecting workspace: $ENVIRONMENT"

if terraform workspace list | grep -q "$ENVIRONMENT"; then
    terraform workspace select "$ENVIRONMENT"
    log_success "Selected existing workspace: $ENVIRONMENT"
else
    log_info "Creating new workspace: $ENVIRONMENT"
    terraform workspace new "$ENVIRONMENT"
    log_success "Created and selected workspace: $ENVIRONMENT"
fi

# Plan environment resources
log_info "Planning environment resources..."

if terraform plan -out="${ENVIRONMENT}.tfplan"; then
    log_success "Planning completed successfully"
else
    log_error "Planning failed"
    exit 1
fi

# Apply environment resources
log_info "Applying environment resources..."

if terraform apply "${ENVIRONMENT}.tfplan"; then
    rm "${ENVIRONMENT}.tfplan"
    log_success "Environment resources deployed successfully!"
else
    log_error "Failed to apply environment resources"
    rm -f "${ENVIRONMENT}.tfplan"
    exit 1
fi

log_success "Deployment completed successfully!"
log_info "Current workspace: $(terraform workspace show)"

# Try to get domain name from terraform outputs
DOMAIN_NAME=$(terraform output -raw domain_name 2>/dev/null || echo "Not available")

if [[ "$DOMAIN_NAME" != "Not available" ]]; then
    log_info "Domain: $DOMAIN_NAME"
fi

# Try to get load balancer DNS name
ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")

if [[ -n "$ALB_DNS" ]]; then
    log_info "Load Balancer: $ALB_DNS"
fi

log_info "Next steps:"
log_info "  • Check your resources in AWS Console"
log_info "  • Update your domain's nameservers if this is the first deployment"
log_info "  • Test your application endpoints"