terraform {
  required_version = ">= 1.0"

  backend "s3" {
    bucket  = "tf-state-live-boost"
    key     = "live-boost/terraform.tfstate"
    region  = "us-east-2"
    profile = "live-boost"
    encrypt = true
  }
}

provider "aws" {
  region  = "us-east-2"
  profile = "live-boost"

  default_tags {
    tags = {
      Project     = "Live Boost"
      Component   = "Workspace"
      ManagedBy   = "Terraform"
      Environment = terraform.workspace == "production" ? "Production" : (terraform.workspace == "staging" ? "Staging" : "Development")
    }
  }
}

data "aws_availability_zones" "available" {}

locals {
  name = "live-boost-${terraform.workspace}"

  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  current_commit_sha_short = substr(trimspace(file("../.git/${trimspace(trimprefix(file("../.git/HEAD"), "ref:"))}")), 0, 7)

  prod = terraform.workspace == "production"
}
