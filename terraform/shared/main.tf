terraform {
  required_version = ">= 1.0"
  
  backend "s3" {
    bucket  = "tf-state-meeboter"
    key     = "meeboter/shared/terraform.tfstate"
    region  = "us-east-2"
    profile = "meeboter"
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
  profile = "meeboter"
  
  default_tags {
    tags = {
      Project     = "Live Boost"
      Component   = "Shared"
      ManagedBy   = "Terraform"
    }
  }
}