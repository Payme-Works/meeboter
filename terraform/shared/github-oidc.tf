# ---------------------------------------------------------------------------------------------------------------------
# GitHub Actions OIDC Provider - Shared Resource
# ---------------------------------------------------------------------------------------------------------------------

# GitHub OIDC provider - shared across all environments
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
  
  client_id_list = [
    "sts.amazonaws.com"
  ]
  
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]

  tags = {
    Name = "github-actions-oidc-provider"
    Project = "Live Boost"
    Component = "Shared"
    ManagedBy = "Terraform"
  }
  
  lifecycle {
    # Prevent destruction since this is shared across environments
    prevent_destroy = true
  }
}