#!/bin/bash

# Shared resources initialization script
# Always uses default workspace for shared resources

set -euo pipefail

# Disable AWS CLI pager for non-interactive usage
export AWS_PAGER=""

# Configuration
AWS_PROFILE=${AWS_PROFILE:-"meeboter"}
AWS_REGION=${AWS_REGION:-"us-east-2"}
S3_BUCKET="tf-state-meeboter"
STATE_KEY="meeboter/shared/terraform.tfstate"

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

log_info "Initializing shared Terraform resources"

# Ensure we're in the shared directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHARED_DIR="$(dirname "$SCRIPT_DIR")"

cd "$SHARED_DIR"

log_info "Working directory: $(pwd)"
log_info "AWS Profile: $AWS_PROFILE"
log_info "AWS Region: $AWS_REGION"
log_info "S3 Bucket: $S3_BUCKET"
log_info "State Key: $STATE_KEY"

# Check if S3 bucket exists, create if it doesn't
log_info "Checking if S3 bucket exists..."

if aws s3 ls "s3://$S3_BUCKET" --profile "$AWS_PROFILE" --region "$AWS_REGION" >/dev/null 2>&1; then
    log_success "S3 bucket '$S3_BUCKET' already exists"
else
    log_info "Creating S3 bucket '$S3_BUCKET'..."
    
    if aws s3 mb "s3://$S3_BUCKET" --profile "$AWS_PROFILE" --region "$AWS_REGION"; then
        log_success "S3 bucket created successfully"
        
        # Enable versioning
        log_info "Enabling versioning on S3 bucket..."
        aws s3api put-bucket-versioning \
            --bucket "$S3_BUCKET" \
            --versioning-configuration Status=Enabled \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Versioning enabled"
        
        # Enable server-side encryption
        log_info "Enabling server-side encryption on S3 bucket..."
        aws s3api put-bucket-encryption \
            --bucket "$S3_BUCKET" \
            --server-side-encryption-configuration '{
                "Rules": [
                    {
                        "ApplyServerSideEncryptionByDefault": {
                            "SSEAlgorithm": "AES256"
                        },
                        "BucketKeyEnabled": true
                    }
                ]
            }' \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION"
        log_success "Server-side encryption enabled"
        
    else
        log_error "Failed to create S3 bucket"
        exit 1
    fi
fi

# Initialize Terraform
log_info "Initializing Terraform..."

if terraform init \
    -backend-config="bucket=$S3_BUCKET" \
    -backend-config="key=$STATE_KEY" \
    -backend-config="region=$AWS_REGION" \
    -backend-config="profile=$AWS_PROFILE" \
    -backend-config="encrypt=true"; then
    log_success "Terraform initialized successfully"
else
    log_error "Failed to initialize Terraform"
    exit 1
fi

# Ensure we're on the default workspace
log_info "Ensuring we're on the default workspace..."
CURRENT_WORKSPACE=$(terraform workspace show)

if [[ "$CURRENT_WORKSPACE" != "default" ]]; then
    log_info "Switching from '$CURRENT_WORKSPACE' to 'default' workspace"
    terraform workspace select default
    log_info "Switched to default workspace"
else
    log_info "Already on default workspace"
fi

log_success "Shared resources initialization completed!"
log_info "Ready to deploy shared resources with apply.sh"