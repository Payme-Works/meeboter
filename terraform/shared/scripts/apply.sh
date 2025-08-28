#!/bin/bash

# Shared resources apply script
# Always uses default workspace for shared resources

set -euo pipefail

# Disable AWS CLI pager for non-interactive usage
export AWS_PAGER=""

# Configuration
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

log_info "Applying shared Terraform resources"

# Ensure we're in the shared directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")"

cd "$SHARED_DIR"

log_info "Working directory: $(pwd)"

# Check if shared resources are already initialized
if [[ ! -d ".terraform" ]]; then
    log_info "Initializing shared resources..."
    if [[ -f "scripts/init.sh" ]]; then
        scripts/init.sh
    else
        log_error "init.sh not found at scripts/init.sh"
        exit 1
    fi
fi

# Ensure shared resources always use default workspace
log_info "Ensuring shared resources use default workspace..."
CURRENT_WORKSPACE=$(terraform workspace show)

if [[ "$CURRENT_WORKSPACE" != "default" ]]; then
    log_info "Switching from '$CURRENT_WORKSPACE' to 'default' workspace"
    terraform workspace select default
    log_info "Switched to default workspace for shared resources"
else
    log_info "Already on default workspace"
fi

# Plan shared resources
log_info "Planning shared resources..."

if terraform plan -out=shared.tfplan; then
    log_success "Planning completed successfully"
else
    log_error "Planning failed"
    exit 1
fi

# Apply shared resources
log_info "Applying shared resources..."

if terraform apply shared.tfplan; then
    rm shared.tfplan
    log_success "Shared resources deployed successfully!"
else
    log_error "Failed to apply shared resources"
    rm -f shared.tfplan
    exit 1
fi

log_success "Shared resources deployment completed!"

# Display outputs
log_info "Shared resource outputs:"
terraform output
