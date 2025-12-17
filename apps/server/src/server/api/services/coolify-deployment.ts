import { env } from "@/env";
import type * as schema from "@/server/database/schema";

/**
 * Coolify API response when creating an application
 */
interface CoolifyCreateResponse {
	uuid: string;
	domains?: string[];
}

/**
 * Bot image configuration
 */
interface BotImage {
	name: string;
	tag: string;
}

/**
 * Custom error for Coolify deployment failures
 */
export class CoolifyDeploymentError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CoolifyDeploymentError";
	}
}

/**
 * Selects the appropriate bot Docker image based on meeting platform
 */
export function selectBotImage(meetingInfo: schema.MeetingInfo): BotImage {
	const baseImage = `ghcr.io/${env.GHCR_ORG}/meeboter`;
	const tag = env.BOT_IMAGE_TAG;

	switch (meetingInfo.platform?.toLowerCase()) {
		case "google":
			return { name: `${baseImage}-meet-bot`, tag };
		case "teams":
			return { name: `${baseImage}-teams-bot`, tag };
		case "zoom":
			return { name: `${baseImage}-zoom-bot`, tag };
		default:
			throw new CoolifyDeploymentError(
				`Unsupported platform: ${meetingInfo.platform}`,
			);
	}
}

/**
 * Creates a bot application in Coolify via the API
 *
 * @param botId - The bot ID to use for naming
 * @param image - The Docker image to deploy
 * @param botConfig - The bot configuration to pass as environment variable
 * @returns The Coolify service UUID
 */
export async function createCoolifyApplication(
	botId: number,
	image: BotImage,
	botConfig: schema.BotConfig,
): Promise<string> {
	const applicationName = `meeboter-bot-${botId}-${Date.now()}`;

	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/dockerimage`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				project_uuid: env.COOLIFY_PROJECT_UUID,
				server_uuid: env.COOLIFY_SERVER_UUID,
				environment_name: env.COOLIFY_ENVIRONMENT_NAME,
				destination_uuid: env.COOLIFY_DESTINATION_UUID,
				docker_registry_image_name: image.name,
				docker_registry_image_tag: image.tag,
				name: applicationName,
				description: `Bot ${botId} for ${botConfig.meetingInfo.platform} meeting`,
				// Bots are worker processes that don't serve HTTP traffic,
				// but Coolify requires this field. Use placeholder port.
				ports_exposes: "3000",
				instant_deploy: true,
			}),
		},
	);

	if (!response.ok) {
		const responseText = await response.text();
		let errorMessage = response.statusText;

		try {
			const errorData = JSON.parse(responseText) as Record<string, unknown>;

			// Log full error details for debugging
			console.error("Coolify API error response:", {
				status: response.status,
				statusText: response.statusText,
				body: errorData,
			});

			console.error("Request body was:", {
				project_uuid: env.COOLIFY_PROJECT_UUID,
				server_uuid: env.COOLIFY_SERVER_UUID,
				environment_name: env.COOLIFY_ENVIRONMENT_NAME,
				destination_uuid: env.COOLIFY_DESTINATION_UUID,
				docker_registry_image_name: image.name,
				docker_registry_image_tag: image.tag,
				name: applicationName,
			});

			errorMessage =
				(errorData.message as string) ||
				JSON.stringify(errorData) ||
				response.statusText;
		} catch {
			console.error("Coolify API raw response:", responseText);
			errorMessage = responseText || response.statusText;
		}

		throw new CoolifyDeploymentError(
			`Failed to create Coolify application: ${errorMessage}`,
		);
	}

	const data = (await response.json()) as CoolifyCreateResponse;

	// Set environment variables for the bot
	await setCoolifyEnvironmentVariables(data.uuid, botId, botConfig);

	return data.uuid;
}

/**
 * Sets environment variables for a Coolify application
 */
async function setCoolifyEnvironmentVariables(
	applicationUuid: string,
	botId: number,
	botConfig: schema.BotConfig,
): Promise<void> {
	// Base64 encode to avoid JSON escaping issues through Coolify → Docker → Container
	const botDataBase64 = Buffer.from(JSON.stringify(botConfig)).toString(
		"base64",
	);

	const envVars = [
		{ key: "BOT_DATA", value: botDataBase64 },
		{ key: "BOT_AUTH_TOKEN", value: env.BOT_AUTH_TOKEN || "" },
		{
			key: "BACKEND_URL",
			value: `${env.NEXT_PUBLIC_APP_ORIGIN_URL}/api/trpc`,
		},
		{ key: "MINIO_ENDPOINT", value: env.MINIO_ENDPOINT },
		{ key: "MINIO_ACCESS_KEY", value: env.MINIO_ACCESS_KEY },
		{ key: "MINIO_SECRET_KEY", value: env.MINIO_SECRET_KEY },
		{ key: "MINIO_BUCKET_NAME", value: env.MINIO_BUCKET_NAME },
		{ key: "MINIO_REGION", value: env.MINIO_REGION },
		{ key: "NODE_ENV", value: "production" },
	];

	// Use bulk update for efficiency
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}/envs/bulk`,
		{
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				data: envVars,
			}),
		},
	);

	if (!response.ok) {
		console.error(
			`Failed to set environment variables for bot ${botId}:`,
			await response.text(),
		);
	}
}

/**
 * Starts a Coolify application
 */
export async function startCoolifyApplication(
	applicationUuid: string,
): Promise<void> {
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}/start`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
			},
		},
	);

	if (!response.ok) {
		throw new CoolifyDeploymentError(
			`Failed to start Coolify application: ${response.statusText}`,
		);
	}
}

/**
 * Deletes a Coolify application (cleanup after bot finishes)
 *
 * @param applicationUuid - The Coolify application UUID to delete
 */
export async function deleteCoolifyApplication(
	applicationUuid: string,
): Promise<void> {
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}?delete_configurations=true&delete_volumes=true&docker_cleanup=true`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
			},
		},
	);

	if (!response.ok) {
		throw new CoolifyDeploymentError(
			`Failed to delete Coolify application: ${response.statusText}`,
		);
	}

	console.log(`Cleaned up Coolify application: ${applicationUuid}`);
}

/**
 * Stops a Coolify application
 */
export async function stopCoolifyApplication(
	applicationUuid: string,
): Promise<void> {
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}/stop`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
			},
		},
	);

	if (!response.ok) {
		throw new CoolifyDeploymentError(
			`Failed to stop Coolify application: ${response.statusText}`,
		);
	}
}

/**
 * Gets the status of a Coolify application
 */
export async function getCoolifyApplicationStatus(
	applicationUuid: string,
): Promise<string> {
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
			},
		},
	);

	if (!response.ok) {
		throw new CoolifyDeploymentError(
			`Failed to get Coolify application status: ${response.statusText}`,
		);
	}

	const data = (await response.json()) as { status: string };

	return data.status;
}

/**
 * Deployment status result
 */
interface DeploymentStatusResult {
	success: boolean;
	status: string;
	error?: string;
}

/**
 * Waits for a Coolify application deployment to complete
 *
 * @param applicationUuid - The application UUID to monitor
 * @param timeoutMs - Maximum time to wait (default: 5 minutes)
 * @param pollIntervalMs - Time between status checks (default: 10 seconds)
 * @returns Deployment result with success status
 */
export async function waitForDeployment(
	applicationUuid: string,
	timeoutMs: number = 5 * 60 * 1000,
	pollIntervalMs: number = 10 * 1000,
): Promise<DeploymentStatusResult> {
	const startTime = Date.now();

	// Healthy/running statuses
	const successStatuses = ["running", "healthy"];
	// Failed statuses that indicate deployment failed
	const failedStatuses = ["exited", "error", "stopped", "degraded"];

	while (Date.now() - startTime < timeoutMs) {
		try {
			const status = await getCoolifyApplicationStatus(applicationUuid);
			console.log(`[Coolify] Application ${applicationUuid} status: ${status}`);

			if (successStatuses.includes(status.toLowerCase())) {
				return { success: true, status };
			}

			if (failedStatuses.includes(status.toLowerCase())) {
				return {
					success: false,
					status,
					error: `Deployment failed with status: ${status}`,
				};
			}

			// Still deploying/starting, wait and poll again
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		} catch (error) {
			console.error(`[Coolify] Error polling deployment status:`, error);
			// Continue polling on transient errors
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
		}
	}

	return {
		success: false,
		status: "timeout",
		error: `Deployment timed out after ${timeoutMs / 1000} seconds`,
	};
}

/**
 * Restarts a Coolify application (triggers redeployment)
 */
export async function restartCoolifyApplication(
	applicationUuid: string,
): Promise<void> {
	const response = await fetch(
		`${env.COOLIFY_API_URL}/applications/${applicationUuid}/restart`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${env.COOLIFY_API_TOKEN}`,
			},
		},
	);

	if (!response.ok) {
		throw new CoolifyDeploymentError(
			`Failed to restart Coolify application: ${response.statusText}`,
		);
	}

	console.log(`Restarted Coolify application: ${applicationUuid}`);
}

/**
 * Deploys a bot with retry logic
 *
 * Creates the application, waits for deployment, and retries on failure.
 * Cleans up the application if all retries fail.
 *
 * @param botId - The bot ID
 * @param image - Docker image to deploy
 * @param botConfig - Bot configuration
 * @param maxRetries - Maximum number of deployment attempts (default: 3)
 * @returns The Coolify service UUID on success
 * @throws CoolifyDeploymentError if all retries fail
 */
export async function deployWithRetry(
	botId: number,
	image: BotImage,
	botConfig: schema.BotConfig,
	maxRetries: number = 3,
): Promise<string> {
	let applicationUuid: string | null = null;
	let lastError: string | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		console.log(
			`[Coolify] Deployment attempt ${attempt}/${maxRetries} for bot ${botId}`,
		);

		try {
			// Create application on first attempt, restart on retries
			if (!applicationUuid) {
				applicationUuid = await createCoolifyApplication(
					botId,
					image,
					botConfig,
				);

				console.log(
					`[Coolify] Created application ${applicationUuid} for bot ${botId}`,
				);
			} else {
				// Restart existing application for retry
				console.log(
					`[Coolify] Restarting application ${applicationUuid} (retry ${attempt})`,
				);

				await restartCoolifyApplication(applicationUuid);
			}

			// Wait for deployment to complete
			const result = await waitForDeployment(applicationUuid);

			if (result.success) {
				console.log(
					`[Coolify] Bot ${botId} deployed successfully on attempt ${attempt}`,
				);

				return applicationUuid;
			}

			lastError =
				result.error ?? `Deployment failed with status: ${result.status}`;

			console.warn(
				`[Coolify] Deployment attempt ${attempt} failed: ${lastError}`,
			);

			// Add exponential backoff between retries
			if (attempt < maxRetries) {
				const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
				console.log(`[Coolify] Waiting ${backoffMs}ms before retry...`);
				await new Promise((resolve) => setTimeout(resolve, backoffMs));
			}
		} catch (error) {
			lastError = error instanceof Error ? error.message : "Unknown error";
			console.error(`[Coolify] Deployment attempt ${attempt} error:`, error);

			if (attempt < maxRetries) {
				const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
				await new Promise((resolve) => setTimeout(resolve, backoffMs));
			}
		}
	}

	// All retries failed - cleanup the application
	if (applicationUuid) {
		console.log(
			`[Coolify] All ${maxRetries} deployment attempts failed. Cleaning up application ${applicationUuid}`,
		);

		try {
			await deleteCoolifyApplication(applicationUuid);
		} catch (cleanupError) {
			console.error(`[Coolify] Failed to cleanup application:`, cleanupError);
		}
	}

	throw new CoolifyDeploymentError(
		`Bot deployment failed after ${maxRetries} attempts: ${lastError}`,
	);
}
