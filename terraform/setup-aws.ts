#!/usr/bin/env bun

/**
 * Meeboter AWS Bot Infrastructure Setup
 * Provisions/updates AWS infrastructure for bot deployments
 *
 * Usage:
 *   bun terraform/setup-aws.ts
 *   bun terraform/setup-aws.ts --profile myprofile --region us-west-2
 *   bun terraform/setup-aws.ts --interactive
 *   bun terraform/setup-aws.ts --environment production
 *   bun terraform/setup-aws.ts --environment development
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";
import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { $ } from "bun";
import { Command } from "commander";
import ora, { type Ora } from "ora";

// ─── Constants ───────────────────────────────────────────────────────────────

const TERRAFORM_DIR = join(import.meta.dir, "bots");
const STATE_BUCKET_NAME = "tf-state-meeboter";
const PROJECT_NAME = "meeboter";

const AWS_REGIONS = [
	{ name: "US East (Ohio) - us-east-2", value: "us-east-2" },
	{ name: "US East (N. Virginia) - us-east-1", value: "us-east-1" },
	{ name: "US West (Oregon) - us-west-2", value: "us-west-2" },
	{ name: "EU (Ireland) - eu-west-1", value: "eu-west-1" },
	{ name: "EU (Frankfurt) - eu-central-1", value: "eu-central-1" },
	{ name: "Asia Pacific (Tokyo) - ap-northeast-1", value: "ap-northeast-1" },
	{ name: "South America (São Paulo) - sa-east-1", value: "sa-east-1" },
];

const ENVIRONMENTS = [
	{
		name: "Production (meeboter-bots)",
		value: "production",
		description: "Production environment - no suffix",
	},
	{
		name: "Development (meeboter-bots-development)",
		value: "development",
		description: "Development environment - with suffix",
	},
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupOptions {
	profile: string;
	region: string;
	interactive: boolean;
	autoApprove: boolean;
	environments: string[];
	importExisting: boolean;
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

const ui = {
	blank: () => console.log(),
	title: (text: string) => {
		ui.blank();

		console.log(styleText(["bgRed", "bold"], ` ${text} `));

		ui.blank();
	},
	section: (text: string) => {
		ui.blank();
		console.log(styleText(["green", "bold"], text));
		ui.blank();
	},
	keyValue: (key: string, value: string) => {
		console.log(
			`${styleText("dim", `${key}=`)}${styleText("cyan", `"${value}"`)}`,
		);
	},
	dim: (text: string) => {
		console.log(styleText("dim", text));
	},
	info: (text: string) => {
		console.log(styleText("blue", `ℹ ${text}`));
	},
};

const log = {
	success: (msg: string) =>
		console.log(styleText(["green", "bold"], `✓ ${msg}`)),
	error: (msg: string) => console.error(styleText(["red", "bold"], `✗ ${msg}`)),
	warn: (msg: string) =>
		console.warn(styleText(["yellow", "bold"], `⚠ ${msg}`)),
};

function spinner(text: string): Ora {
	return ora(text);
}

// ─── Environment Helpers ─────────────────────────────────────────────────────

function isProductionEnv(env: string): boolean {
	return env === "production" || env === "default";
}

function getResourceName(env: string): string {
	return isProductionEnv(env)
		? `${PROJECT_NAME}-bots`
		: `${PROJECT_NAME}-bots-${env}`;
}

// ─── Interactive Prompts ─────────────────────────────────────────────────────

async function promptForOptions(defaults: SetupOptions): Promise<SetupOptions> {
	ui.title("Meeboter AWS Bot Infrastructure");

	const region = await select({
		message: "Select AWS region:",
		choices: AWS_REGIONS,
		default: defaults.region,
	});

	const profile = await select({
		message: "Select AWS profile:",
		choices: [
			{ name: "default", value: "default" },
			{ name: "Other (enter manually)", value: "__other__" },
		],
		default: defaults.profile,
	});

	let finalProfile = profile;

	if (profile === "__other__") {
		finalProfile = await input({
			message: "Enter AWS profile name:",
			default: "default",
		});
	}

	const environments = await checkbox({
		message: "Select environments to deploy:",
		choices: ENVIRONMENTS.map((env) => ({
			name: env.name,
			value: env.value,
			checked: env.value === "production",
		})),
	});

	if (environments.length === 0) {
		log.error("At least one environment must be selected");
		process.exit(1);
	}

	const importExisting = await confirm({
		message: "Import existing AWS resources into state? (if they exist)",
		default: true,
	});

	const autoApprove = await confirm({
		message: "Auto-approve Terraform changes?",
		default: false,
	});

	return {
		profile: finalProfile,
		region,
		interactive: true,
		autoApprove,
		environments,
		importExisting,
	};
}

// ─── Prerequisites ───────────────────────────────────────────────────────────

async function checkPrerequisites(profile: string): Promise<void> {
	const s = spinner("Checking prerequisites").start();

	// Check required tools
	for (const tool of ["terraform", "aws"]) {
		const result = await $`which ${tool}`.quiet().nothrow();

		if (result.exitCode !== 0) {
			s.fail(`${tool} is required but not installed`);
			process.exit(1);
		}
	}

	// Check AWS credentials
	const stsResult = await $`aws sts get-caller-identity --profile ${profile}`
		.quiet()
		.nothrow();

	if (stsResult.exitCode !== 0) {
		s.warn("AWS credentials invalid or expired");

		const shouldLogin = await confirm({
			message: "Would you like to login via AWS SSO?",
			default: true,
		});

		if (shouldLogin) {
			await $`aws sso login --profile ${profile}`;
		} else {
			log.error("Valid AWS credentials required");
			process.exit(1);
		}
	}

	s.succeed("Prerequisites verified");
}

// ─── S3 State Bucket ─────────────────────────────────────────────────────────

async function ensureStateBucket(
	profile: string,
	region: string,
): Promise<void> {
	const s = spinner(`Checking S3 state bucket: ${STATE_BUCKET_NAME}`).start();

	// Check if bucket exists
	const checkResult =
		await $`aws s3api head-bucket --bucket ${STATE_BUCKET_NAME} --profile ${profile}`
			.quiet()
			.nothrow();

	if (checkResult.exitCode === 0) {
		s.succeed("S3 state bucket exists");

		return;
	}

	// Bucket doesn't exist, create it
	s.text = `Creating S3 state bucket: ${STATE_BUCKET_NAME}`;

	// Create bucket (us-east-1 doesn't need LocationConstraint)
	if (region === "us-east-1") {
		await $`aws s3api create-bucket --bucket ${STATE_BUCKET_NAME} --profile ${profile}`;
	} else {
		await $`aws s3api create-bucket --bucket ${STATE_BUCKET_NAME} --profile ${profile} --region ${region} --create-bucket-configuration LocationConstraint=${region}`;
	}

	// Enable versioning for state safety
	s.text = "Enabling bucket versioning";
	await $`aws s3api put-bucket-versioning --bucket ${STATE_BUCKET_NAME} --profile ${profile} --versioning-configuration Status=Enabled`;

	// Block public access
	s.text = "Blocking public access";
	await $`aws s3api put-public-access-block --bucket ${STATE_BUCKET_NAME} --profile ${profile} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`;

	s.succeed("S3 state bucket created");
}

// ─── Terraform Workspace ─────────────────────────────────────────────────────

async function ensureWorkspace(environment: string): Promise<void> {
	const s = spinner(`Setting up workspace: ${environment}`).start();

	// List existing workspaces
	const listResult =
		await $`terraform -chdir=${TERRAFORM_DIR} workspace list`.quiet().nothrow();
	const workspaces = listResult.stdout.toString();

	if (workspaces.includes(environment)) {
		// Workspace exists, select it
		await $`terraform -chdir=${TERRAFORM_DIR} workspace select ${environment}`
			.quiet()
			.nothrow();
		s.succeed(`Workspace selected: ${environment}`);
	} else {
		// Create new workspace
		const createResult =
			await $`terraform -chdir=${TERRAFORM_DIR} workspace new ${environment}`
				.quiet()
				.nothrow();

		if (createResult.exitCode !== 0) {
			s.fail(`Failed to create workspace: ${environment}`);
			console.error(createResult.stderr.toString());
			process.exit(1);
		}

		s.succeed(`Workspace created: ${environment}`);
	}
}

// ─── Import Existing Resources ───────────────────────────────────────────────

interface ImportableResource {
	type: string;
	name: string;
	getAwsId: (resourceName: string, profile: string) => Promise<string | null>;
}

const IMPORTABLE_RESOURCES: ImportableResource[] = [
	{
		type: "aws_iam_role",
		name: "task_execution",
		getAwsId: async (resourceName) => `${resourceName}-execution-role`,
	},
	{
		type: "aws_iam_role",
		name: "bot_task",
		getAwsId: async (resourceName) => `${resourceName}-task-role`,
	},
	{
		type: "aws_iam_user",
		name: "milo",
		getAwsId: async (resourceName) => `${resourceName}-milo-api`,
	},
	{
		type: "aws_cloudwatch_log_group",
		name: "bots",
		getAwsId: async (resourceName) => `/ecs/${resourceName}`,
	},
	{
		type: "aws_secretsmanager_secret",
		name: "ghcr",
		getAwsId: async (resourceName, profile) => {
			const result =
				await $`aws secretsmanager describe-secret --secret-id ${resourceName}/ghcr-credentials --profile ${profile} --query 'ARN' --output text`
					.quiet()
					.nothrow();
			return result.exitCode === 0 ? result.stdout.toString().trim() : null;
		},
	},
	{
		type: "aws_ecs_cluster",
		name: "this",
		getAwsId: async (resourceName) => resourceName,
	},
];

async function importExistingResources(
	environment: string,
	profile: string,
	tfVars: string[],
): Promise<void> {
	const resourceName = getResourceName(environment);
	const s = spinner(
		`Checking for existing resources to import (${resourceName})`,
	).start();

	let importedCount = 0;

	for (const resource of IMPORTABLE_RESOURCES) {
		const awsId = await resource.getAwsId(resourceName, profile);

		if (!awsId) {
			continue;
		}

		// Check if resource exists in AWS
		let exists = false;

		switch (resource.type) {
			case "aws_iam_role": {
				const result =
					await $`aws iam get-role --role-name ${awsId} --profile ${profile}`
						.quiet()
						.nothrow();
				exists = result.exitCode === 0;
				break;
			}
			case "aws_iam_user": {
				const result =
					await $`aws iam get-user --user-name ${awsId} --profile ${profile}`
						.quiet()
						.nothrow();
				exists = result.exitCode === 0;
				break;
			}
			case "aws_cloudwatch_log_group": {
				const result =
					await $`aws logs describe-log-groups --log-group-name-prefix ${awsId} --profile ${profile} --query 'logGroups[0].logGroupName' --output text`
						.quiet()
						.nothrow();
				exists =
					result.exitCode === 0 && result.stdout.toString().trim() === awsId;
				break;
			}
			case "aws_secretsmanager_secret": {
				exists = awsId !== null && !awsId.includes("None");
				break;
			}
			case "aws_ecs_cluster": {
				const result =
					await $`aws ecs describe-clusters --clusters ${awsId} --profile ${profile} --query 'clusters[0].status' --output text`
						.quiet()
						.nothrow();
				exists =
					result.exitCode === 0 &&
					result.stdout.toString().trim() === "ACTIVE";
				break;
			}
		}

		if (exists) {
			s.text = `Importing ${resource.type}.${resource.name}...`;

			const importResult =
				await $`terraform -chdir=${TERRAFORM_DIR} import ${tfVars} ${resource.type}.${resource.name} ${awsId}`
					.quiet()
					.nothrow();

			if (importResult.exitCode === 0) {
				importedCount++;
			} else if (
				!importResult.stderr.toString().includes("Resource already managed")
			) {
				// Only warn if it's not already managed
				log.warn(`Could not import ${resource.type}.${resource.name}`);
			}
		}
	}

	if (importedCount > 0) {
		s.succeed(`Imported ${importedCount} existing resources`);
	} else {
		s.succeed("No existing resources to import");
	}
}

// ─── Terraform ───────────────────────────────────────────────────────────────

async function applyTerraformForEnvironment(
	environment: string,
	options: SetupOptions,
): Promise<void> {
	const resourceName = getResourceName(environment);

	ui.section(`Deploying: ${environment} (${resourceName})`);

	// Check if terraform directory exists
	if (!existsSync(TERRAFORM_DIR)) {
		log.error(`Terraform directory not found: ${TERRAFORM_DIR}`);
		process.exit(1);
	}

	// Terraform variables
	const tfVars = [
		`-var=aws_profile=${options.profile}`,
		`-var=aws_region=${options.region}`,
	];

	// Initialize (always run to ensure backend is configured correctly)
	const s = spinner("Initializing Terraform").start();

	const initResult =
		await $`terraform -chdir=${TERRAFORM_DIR} init -reconfigure`
			.quiet()
			.nothrow();

	if (initResult.exitCode !== 0) {
		s.fail("Terraform initialization failed");
		console.error(initResult.stderr.toString());
		process.exit(1);
	}

	s.succeed("Terraform initialized");

	// Ensure workspace exists and is selected
	await ensureWorkspace(environment);

	// Import existing resources if requested
	if (options.importExisting) {
		await importExistingResources(environment, options.profile, tfVars);
	}

	// Plan
	ui.blank();
	ui.info("Running Terraform Plan...");
	ui.blank();

	const planFile = `tfplan-${environment}`;
	await $`terraform -chdir=${TERRAFORM_DIR} plan ${tfVars} -out=${planFile}`;

	// Apply
	ui.blank();

	if (options.autoApprove) {
		await $`terraform -chdir=${TERRAFORM_DIR} apply ${planFile}`;
	} else {
		const shouldApply = await confirm({
			message: `Apply changes for ${environment}?`,
			default: true,
		});

		ui.blank();

		if (shouldApply) {
			await $`terraform -chdir=${TERRAFORM_DIR} apply ${planFile}`;
		} else {
			log.warn(`Terraform apply cancelled for ${environment}`);

			return;
		}
	}

	ui.blank();

	log.success(`Infrastructure provisioned for ${environment}`);

	// Show Milo configuration
	ui.section(`Milo Environment Configuration (${environment})`);
	ui.dim("Add to your Milo .env file:");
	ui.blank();

	const output =
		await $`terraform -chdir=${TERRAFORM_DIR} output -raw milo_env_config`.text();

	for (const line of output.trim().split("\n")) {
		if (line.startsWith("#")) {
			ui.dim(line);
		} else if (line.includes("=")) {
			const [key, value] = line.split("=");
			ui.keyValue(key ?? "", value ?? "");
		}
	}
}

// ─── CLI Setup ───────────────────────────────────────────────────────────────

const program = new Command()
	.name("setup-aws")
	.description("Meeboter AWS Bot Infrastructure Setup")
	.version("1.0.0")
	.option("-p, --profile <name>", "AWS CLI profile", "default")
	.option("-r, --region <region>", "AWS region", "us-east-2")
	.option(
		"-e, --environment <env>",
		"Environment to deploy (production, development)",
	)
	.option("-i, --interactive", "Interactive mode with prompts", false)
	.option("-y, --auto-approve", "Auto-approve Terraform changes", false)
	.option("--import", "Import existing AWS resources into state", false)
	.action(async (opts) => {
		try {
			let options: SetupOptions = {
				profile: opts.profile,
				region: opts.region,
				interactive: opts.interactive,
				autoApprove: opts.autoApprove,
				environments: opts.environment ? [opts.environment] : ["production"],
				importExisting: opts.import,
			};

			// Interactive mode
			if (opts.interactive) {
				options = await promptForOptions(options);
			}

			ui.title("Meeboter AWS Bot Infrastructure");
			ui.keyValue("Region", options.region);
			ui.keyValue("Profile", options.profile);
			ui.keyValue("Environments", options.environments.join(", "));
			ui.keyValue("Import Existing", options.importExisting ? "yes" : "no");
			ui.blank();

			await checkPrerequisites(options.profile);
			await ensureStateBucket(options.profile, options.region);

			// Apply terraform for each environment
			for (const env of options.environments) {
				await applyTerraformForEnvironment(env, options);
			}

			ui.blank();
			log.success("Setup complete!");
		} catch (error) {
			if (error instanceof Error) {
				log.error(error.message);
			}

			process.exit(1);
		}
	});

program.parse();
