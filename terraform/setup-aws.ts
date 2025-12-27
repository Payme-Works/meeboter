#!/usr/bin/env bun

/**
 * Meeboter AWS Bot Infrastructure Setup
 * Provisions/updates AWS infrastructure for bot deployments
 *
 * Usage:
 *   bun terraform/setup-aws.ts
 *   bun terraform/setup-aws.ts --profile myprofile --region us-west-2
 *   bun terraform/setup-aws.ts --interactive
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";
import { confirm, input, select } from "@inquirer/prompts";
import { $ } from "bun";
import { Command } from "commander";
import ora, { type Ora } from "ora";

// ─── Constants ───────────────────────────────────────────────────────────────

const TERRAFORM_DIR = join(import.meta.dir, "bots");
const STATE_BUCKET_NAME = "tf-state-meeboter";

const AWS_REGIONS = [
	{ name: "US East (Ohio) - us-east-2", value: "us-east-2" },
	{ name: "US East (N. Virginia) - us-east-1", value: "us-east-1" },
	{ name: "US West (Oregon) - us-west-2", value: "us-west-2" },
	{ name: "EU (Ireland) - eu-west-1", value: "eu-west-1" },
	{ name: "EU (Frankfurt) - eu-central-1", value: "eu-central-1" },
	{ name: "Asia Pacific (Tokyo) - ap-northeast-1", value: "ap-northeast-1" },
	{ name: "South America (São Paulo) - sa-east-1", value: "sa-east-1" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetupOptions {
	profile: string;
	region: string;
	interactive: boolean;
	autoApprove: boolean;
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

	const autoApprove = await confirm({
		message: "Auto-approve Terraform changes?",
		default: false,
	});

	return {
		profile: finalProfile,
		region,
		interactive: true,
		autoApprove,
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

// ─── Terraform ───────────────────────────────────────────────────────────────

async function applyTerraform(options: SetupOptions): Promise<void> {
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

	// Plan
	ui.blank();
	ui.section("Terraform Plan");
	ui.blank();

	await $`terraform -chdir=${TERRAFORM_DIR} plan ${tfVars} -out=tfplan`;

	// Apply
	ui.blank();

	if (options.autoApprove) {
		await $`terraform -chdir=${TERRAFORM_DIR} apply tfplan`;
	} else {
		const shouldApply = await confirm({
			message: "Apply these changes?",
			default: true,
		});

		ui.blank();

		if (shouldApply) {
			await $`terraform -chdir=${TERRAFORM_DIR} apply tfplan`;
		} else {
			log.warn("Terraform apply cancelled");

			return;
		}
	}

	ui.blank();

	log.success("Infrastructure provisioned");

	// Show Milo configuration
	ui.section("Milo Environment Configuration");
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
	.option("-i, --interactive", "Interactive mode with prompts", false)
	.option("-y, --auto-approve", "Auto-approve Terraform changes", false)
	.action(async (opts) => {
		try {
			let options: SetupOptions = {
				profile: opts.profile,
				region: opts.region,
				interactive: opts.interactive,
				autoApprove: opts.autoApprove,
			};

			// Interactive mode
			if (opts.interactive) {
				options = await promptForOptions(options);
			}

			ui.title("Meeboter AWS Bot Infrastructure");
			ui.keyValue("Region", options.region);
			ui.keyValue("Profile", options.profile);
			ui.blank();

			await checkPrerequisites(options.profile);
			await ensureStateBucket(options.profile, options.region);
			await applyTerraform(options);

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
