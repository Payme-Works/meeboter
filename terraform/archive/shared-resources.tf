# Data sources to reference shared resources created in terraform/shared/
data "terraform_remote_state" "shared" {
  backend = "s3"
  
  config = {
    bucket  = "tf-state-meeboter"
    key     = "meeboter/shared/terraform.tfstate"
    region  = "us-east-2"
    profile = "meeboter"
  }
}

# Local values for shared resources
locals {
  shared_hosted_zone_id = data.terraform_remote_state.shared.outputs.hosted_zone_id
  shared_certificate_arn = data.terraform_remote_state.shared.outputs.certificate_arn
  shared_domain_name = data.terraform_remote_state.shared.outputs.domain_name
  shared_github_oidc_provider_arn = data.terraform_remote_state.shared.outputs.github_oidc_provider_arn
}