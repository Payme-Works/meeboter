# Terraform Scripts Reference

Quick reference guide for all available scripts in the terraform infrastructure.

## 🚀 Main Scripts (terraform/)

### `./init.sh`
**Initialize all terraform resources (shared + environment)**
```bash
./init.sh                    # Standard initialization
./init.sh upgrade           # Initialize with provider upgrades
./init.sh reconfigure       # Initialize with backend reconfiguration
```

### `./apply.sh`  
**Deploy complete infrastructure (shared + environment)**
```bash
./apply.sh development      # Deploy to development environment
./apply.sh staging         # Deploy to staging environment  
./apply.sh production      # Deploy to production environment
```

## 🔧 Shared Resources Scripts (terraform/shared/scripts/)

### `./shared/scripts/init.sh`
**Initialize shared resources only**
```bash
cd shared/ && ./scripts/init.sh
# OR
./shared/scripts/init.sh     # From terraform/ directory
```

### `./shared/scripts/apply.sh`
**Deploy shared resources only**
```bash
cd shared/ && ./scripts/apply.sh
# OR  
./shared/scripts/apply.sh    # From terraform/ directory
```

## 📋 Script Features

All scripts include:
- ✅ Consistent color-coded logging
- ✅ Error handling with `set -euo pipefail`
- ✅ AWS CLI pager disabled for automation
- ✅ Proper workspace management
- ✅ Environment variable support

## 🎯 Common Usage Patterns

### First-time Setup
```bash
./init.sh
./apply.sh development
```

### Deploy Only Shared Resources
```bash
cd shared/
./scripts/init.sh
./scripts/apply.sh
```

### Deploy Only Environment Resources
```bash
# Ensure shared resources exist first
terraform workspace select development
terraform apply
```

### Update Provider Versions
```bash
./init.sh upgrade
```

### Reconfigure Backend
```bash
./init.sh reconfigure
```

## 🔍 Environment Variables

All scripts support these environment variables:

```bash
export AWS_PROFILE=live-boost      # AWS profile to use
export AWS_REGION=us-east-2        # AWS region
```

## ⚠️ Important Notes

1. **Shared resources always use `default` workspace** - never change this
2. **Environment resources use named workspaces** - development, staging, production
3. **Deploy shared resources first** - main apply.sh handles this automatically
4. **All scripts are idempotent** - safe to run multiple times