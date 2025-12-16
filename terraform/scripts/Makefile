init:
	terraform init && terraform workspace new development && terraform workspace select development
upgrade:
	terraform init -upgrade
reconfigure:
	terraform init -reconfigure

login:
	aws configure --profile meeboter
sso:
	aws configure sso --profile meeboter