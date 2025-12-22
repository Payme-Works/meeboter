#!/bin/bash

# Terraform initialization script
# Handles S3 bucket creation and terraform init

set -euo pipefail

# Disable AWS CLI pager for non-interactive usage
export AWS_PAGER=""

# Configuration
AWS_BUCKET_NAME=${AWS_BUCKET_NAME:-"tf-state-meeboter"}
AWS_REGION=${AWS_REGION:-"us-east-2"}
AWS_PROFILE=${AWS_PROFILE:-"meeboter"}

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

# Parse command line arguments
INIT_ARGS=""

case "${1:-}" in
    "upgrade")
        INIT_ARGS="-upgrade"
        log_info "Running terraform init with upgrade..."
        ;;
    "reconfigure")
        INIT_ARGS="-reconfigure"
        log_info "Running terraform init with reconfigure..."
        ;;
    *)
        log_info "Running terraform init..."
        ;;
esac

log_info "Initializing Terraform with backend configuration"
log_info "Bucket: $AWS_BUCKET_NAME"
log_info "Region: $AWS_REGION"
log_info "Profile: $AWS_PROFILE"

# Check if bucket exists
log_info "Checking if S3 bucket exists..."
if aws s3api head-bucket --bucket "$AWS_BUCKET_NAME" --profile "$AWS_PROFILE" --region "$AWS_REGION" 2>/dev/null; then
    log_success "S3 bucket '$AWS_BUCKET_NAME' already exists"
else
    log_warning "S3 bucket '$AWS_BUCKET_NAME' does not exist"
    log_info "Creating S3 bucket..."
    
    # Create bucket
    if aws s3 mb "s3://$AWS_BUCKET_NAME" --profile "$AWS_PROFILE" --region "$AWS_REGION"; then
        log_success "S3 bucket '$AWS_BUCKET_NAME' created"
    else
        log_error "Failed to create S3 bucket '$AWS_BUCKET_NAME'"
        exit 1
    fi
    
    # Enable versioning
    log_info "Enabling versioning on bucket..."
    if aws s3api put-bucket-versioning \
        --bucket "$AWS_BUCKET_NAME" \
        --versioning-configuration Status=Enabled \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"; then
        log_success "Versioning enabled"
    else
        log_warning "Failed to enable versioning"
    fi
    
    # Enable server-side encryption
    log_info "Enabling server-side encryption..."
    if aws s3api put-bucket-encryption \
        --bucket "$AWS_BUCKET_NAME" \
        --server-side-encryption-configuration '{
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }
            ]
        }' \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"; then
        log_success "Server-side encryption enabled"
    else
        log_warning "Failed to enable server-side encryption"
    fi
    
    # Block public access
    log_info "Blocking public access..."
    if aws s3api put-public-access-block \
        --bucket "$AWS_BUCKET_NAME" \
        --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION"; then
        log_success "Public access blocked"
    else
        log_warning "Failed to block public access"
    fi
    
    log_success "S3 bucket '$AWS_BUCKET_NAME' created and configured successfully"
fi

log_info "Running terraform init..."

# Check if we're in the shared directory
if [[ $(basename "$PWD") == "shared" ]]; then
    log_info "You're in the shared resources directory"
    log_info "Initializing shared resources..."
    
    # For shared directory, use the embedded backend configuration
    if terraform init $INIT_ARGS; then
        log_success "Shared resources initialization completed successfully!"
        
        log_info "Next steps:"
        log_info "  • terraform plan"
        log_info "  • terraform apply"
    else
        log_error "Failed to initialize shared resources"
        exit 1
    fi
    
elif [[ -d "shared" ]]; then
    log_info "Initializing both main terraform and shared resources..."
    
    # First initialize shared resources using dedicated script
    log_info "Initializing shared resources using dedicated script..."
    if [[ -f "shared/scripts/init.sh" ]]; then
        if shared/scripts/init.sh; then
            log_success "Shared resources initialized successfully!"
        else
            log_error "Failed to initialize shared resources"
            exit 1
        fi
    else
        log_warning "Shared init script not found, using fallback method..."
        cd shared
        if terraform init $INIT_ARGS; then
            log_success "Shared resources initialized successfully!"
        else
            log_error "Failed to initialize shared resources"
            exit 1
        fi
        cd ..
    fi
    
    # Then initialize main terraform directory
    log_info "Initializing main terraform resources..."

    if terraform init $INIT_ARGS; then 
        log_success "Main terraform resources initialized successfully!"
    else
        log_error "Failed to initialize main terraform resources"
        exit 1
    fi
    
    log_info "Setting up development workspace..."
    
    # Create development workspace if it doesn't exist
    if terraform workspace list | grep -q "development"; then
        log_success "Development workspace already exists"
    else
        log_info "Creating development workspace..."
        if terraform workspace new development; then
            log_success "Development workspace created"
        else
            log_error "Failed to create development workspace"
            exit 1
        fi
    fi
    
    # Select development workspace
    log_info "Selecting development workspace..."
    if terraform workspace select development; then
        log_success "Development workspace selected"
    else
        log_error "Failed to select development workspace"
        exit 1
    fi
    
    log_success "Both terraform configurations initialized successfully!"
    log_info "Currently in workspace: $(terraform workspace show)"
    
    log_info "Next steps:"
    log_info "  • ./apply.sh development - Deploy infrastructure"
    log_info "  • terraform plan - Preview changes"
    log_info "  • terraform apply - Apply changes manually"
    log_info "  • To switch workspaces: terraform workspace select <environment>"
    
    log_info "Available commands:"
    log_info "  • ./init.sh upgrade    - Upgrade providers"
    log_info "  • ./init.sh reconfigure - Reconfigure backend"
else
    # Main terraform directory without shared directory
    log_info "Initializing main terraform resources..."
    
    if terraform init $INIT_ARGS; then
        log_success "Main terraform resources initialized successfully!"
    else
        log_error "Failed to initialize main terraform resources"
        exit 1
    fi
    
    log_info "Setting up development workspace..."
    
    # Create development workspace if it doesn't exist
    if terraform workspace list | grep -q "development"; then
        log_success "Development workspace already exists"
    else
        log_info "Creating development workspace..."
        if terraform workspace new development; then
            log_success "Development workspace created"
        else
            log_error "Failed to create development workspace"
            exit 1
        fi
    fi
    
    # Select development workspace
    log_info "Selecting development workspace..."
    if terraform workspace select development; then
        log_success "Development workspace selected"
    else
        log_error "Failed to select development workspace"
        exit 1
    fi
    
    log_success "Terraform initialization completed successfully!"
    log_info "Currently in workspace: $(terraform workspace show)"
    
    log_info "Next steps:"
    log_info "  • terraform plan"
    log_info "  • terraform apply"
    log_info "  • To switch workspaces: terraform workspace select <environment>"
    
    log_info "Available commands:"
    log_info "  • ./init.sh upgrade    - Upgrade providers"
    log_info "  • ./init.sh reconfigure - Reconfigure backend"
fi