# ─── Project Configuration ────────────────────────────────────────────────────

variable "project_name" {
  type        = string
  description = "Project name used for resource naming"
  default     = "meeboter"
}

# ─── AWS Configuration ────────────────────────────────────────────────────────

variable "aws_profile" {
  type        = string
  description = "AWS CLI profile to use"
  default     = "default"
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment"
  default     = "us-east-2"
}

# ─── Bot Container Images ─────────────────────────────────────────────────────

variable "ghcr_org" {
  type        = string
  description = "GitHub Container Registry organization"
}

variable "ghcr_token" {
  type        = string
  description = "GitHub Personal Access Token with read:packages scope for pulling container images"
  sensitive   = true
}
