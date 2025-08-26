terraform {
  required_version = ">= 1.0"
  
  backend "s3" {
    bucket  = "tf-state-live-boost"
    key     = "live-boost/shared/terraform.tfstate"
    region  = "us-east-2"
    profile = "live-boost"
  }
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = "us-east-2"
  profile = "live-boost"
  
  default_tags {
    tags = {
      Project     = "Live Boost"
      Component   = "Shared"
      ManagedBy   = "Terraform"
    }
  }
}