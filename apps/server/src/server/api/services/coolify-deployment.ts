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
 * Coolify API error response
 */
interface CoolifyErrorResponse {
	message: string;
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
	const envVars = [
		{ key: "BOT_DATA", value: JSON.stringify(botConfig) },
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
