init:
	terraform init && terraform workspace new development && terraform workspace select development
upgrade:
	terraform init -upgrade
reconfigure:
	terraform init -reconfigure

login:
	aws configure --profile live-boost
sso:
	aws configure sso --profile live-boost