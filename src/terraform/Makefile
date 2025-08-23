init:
	terraform init -backend-config=backend.tfvars
upgrade:
	terraform init -upgrade -backend-config=backend.tfvars
reconfigure:
	terraform init -reconfigure -backend-config=backend.tfvars

login:
	aws configure --profile meeting-bot
sso:
	aws configure sso --profile meeting-bot