provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags {
    tags = {
      Service     = "Meeting Bot"
      Environment = terraform.workspace == "production" ? "Production" : (terraform.workspace == "staging" ? "Staging" : "Development")
    }
  }
}

data "aws_availability_zones" "available" {}

locals {
  name = "meeting-bot-${terraform.workspace}"

  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  current_commit_sha_short = substr(trimspace(file("../.git/${trimspace(trimprefix(file("../.git/HEAD"), "ref:"))}")), 0, 7)

  prod = terraform.workspace == "production"
}

terraform {
  backend "s3" {
    encrypt = true
  }
}
