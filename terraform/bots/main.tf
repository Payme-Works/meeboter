terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # S3 backend for remote state (bucket created by setup-aws.ts)
  backend "s3" {
    bucket = "tf-state-meeboter"
    key    = "bots/terraform.tfstate"
    region = "us-east-2"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

locals {
  # Production and default use no suffix, other environments get suffixed
  is_production = contains(["production", "default"], terraform.workspace)
  name          = local.is_production ? "${var.project_name}-bots" : "${var.project_name}-bots-${terraform.workspace}"

  common_tags = {
    Project     = var.project_name
    Component   = "bots"
    ManagedBy   = "terraform"
    Environment = terraform.workspace
  }
}
