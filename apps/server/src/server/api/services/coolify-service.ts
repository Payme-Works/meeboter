import type * as schema from "@/server/database/schema";

/**
 * Configuration for CoolifyService
 */
export interface CoolifyConfig {
	apiUrl: string;
	apiToken: string;
	projectUuid: string;
	serverUuid: string;
	environmentName: string;
	destinationUuid: string;
}

/**
 * Configuration for bot environment variables
 */
export interface BotEnvConfig {
	botAuthToken: string;
	backendUrl: string;
	minioEndpoint: string;
	minioAccessKey: string;
	minioSecretKey: string;
	minioBucketName: string;
	minioRegion: string;
}

/**
 * Configuration for bot image selection
 */
export interface ImageConfig {
	ghcrOrg: string;
	botImageTag: string;
}

/**
 * Bot image configuration
 */
export interface BotImage {
	name: string;
	tag: string;
}

/**
 * Deployment status result
 */
export interface DeploymentStatusResult {
	success: boolean;
	status: string;
	error?: string;
}

/**
 * Environment variable for Coolify
 */
interface EnvVar {
	key: string;
	value: string;
}

/**
 * Coolify API response when creating an application
 */
interface CoolifyCreateResponse {
	uuid: string;
	domains?: string[];
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
 * Service for interacting with Coolify API
 *
 * Handles all Coolify operations: creating, starting, stopping,
 * and managing Docker applications.
 */
export class CoolifyService {
	constructor(
		private readonly config: CoolifyConfig,
		private readonly botEnvConfig: BotEnvConfig,
		private readonly imageConfig: ImageConfig,
	) {}

	/**
	 * Selects the appropriate bot Docker image based on meeting platform
	 */
	selectBotImage(meetingInfo: schema.MeetingInfo): BotImage {
		const baseImage = `ghcr.io/${this.imageConfig.ghcrOrg}/meeboter`;
		const tag = this.imageConfig.botImageTag;

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
	 */
	async createApplication(
		botId: number,
		image: BotImage,
		botConfig: schema.BotConfig,
		customName?: string,
	): Promise<string> {
		const applicationName = customName ?? `meeboter-bot-${botId}-${Date.now()}`;

		const response = await fetch(
			`${this.config.apiUrl}/applications/dockerimage`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					project_uuid: this.config.projectUuid,
					server_uuid: this.config.serverUuid,
					environment_name: this.config.environmentName,
					destination_uuid: this.config.destinationUuid,
					docker_registry_image_name: image.name,
					docker_registry_image_tag: image.tag,
					name: applicationName,
					description: `Bot ${botId} for ${botConfig.meetingInfo.platform} meeting`,
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

				console.error("[CoolifyService] API error response:", {
					status: response.status,
					statusText: response.statusText,
					body: errorData,
				});

				console.error("[CoolifyService] Request body was:", {
					project_uuid: this.config.projectUuid,
					server_uuid: this.config.serverUuid,
					environment_name: this.config.environmentName,
					destination_uuid: this.config.destinationUuid,
					docker_registry_image_name: image.name,
					docker_registry_image_tag: image.tag,
					name: applicationName,
				});

				errorMessage =
					(errorData.message as string) ||
					JSON.stringify(errorData) ||
					response.statusText;
			} catch {
				console.error("[CoolifyService] API raw response:", responseText);
				errorMessage = responseText || response.statusText;
			}

			throw new CoolifyDeploymentError(
				`Failed to create Coolify application: ${errorMessage}`,
			);
		}

		const data = (await response.json()) as CoolifyCreateResponse;

		await this.setEnvironmentVariables(data.uuid, botId, botConfig);

		return data.uuid;
	}

	/**
	 * Sets environment variables for a Coolify application
	 */
	async setEnvironmentVariables(
		applicationUuid: string,
		botId: number,
		botConfig: schema.BotConfig,
	): Promise<void> {
		const botDataBase64 = Buffer.from(JSON.stringify(botConfig)).toString(
			"base64",
		);

		const envVars: EnvVar[] = [
			{ key: "BOT_DATA", value: botDataBase64 },
			{ key: "BOT_AUTH_TOKEN", value: this.botEnvConfig.botAuthToken },
			{ key: "BACKEND_URL", value: this.botEnvConfig.backendUrl },
			{ key: "MINIO_ENDPOINT", value: this.botEnvConfig.minioEndpoint },
			{ key: "MINIO_ACCESS_KEY", value: this.botEnvConfig.minioAccessKey },
			{ key: "MINIO_SECRET_KEY", value: this.botEnvConfig.minioSecretKey },
			{ key: "MINIO_BUCKET_NAME", value: this.botEnvConfig.minioBucketName },
			{ key: "MINIO_REGION", value: this.botEnvConfig.minioRegion },
			{ key: "NODE_ENV", value: "production" },
		];

		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}/envs/bulk`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ data: envVars }),
			},
		);

		if (!response.ok) {
			console.error(
				`[CoolifyService] Failed to set environment variables for bot ${botId}:`,
				await response.text(),
			);
		}
	}

	/**
	 * Updates only the BOT_DATA environment variable
	 */
	async updateBotData(
		applicationUuid: string,
		botConfig: schema.BotConfig,
	): Promise<void> {
		const botDataBase64 = Buffer.from(JSON.stringify(botConfig)).toString(
			"base64",
		);

		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}/envs/bulk`,
			{
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					data: [{ key: "BOT_DATA", value: botDataBase64 }],
				}),
			},
		);

		if (!response.ok) {
			console.error(
				`[CoolifyService] Failed to update BOT_DATA for ${applicationUuid}:`,
				await response.text(),
			);
		}
	}

	/**
	 * Starts a Coolify application
	 */
	async startApplication(applicationUuid: string): Promise<void> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}/start`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
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
	 * Stops a Coolify application
	 */
	async stopApplication(applicationUuid: string): Promise<void> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}/stop`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
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
	 * Restarts a Coolify application
	 */
	async restartApplication(applicationUuid: string): Promise<void> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}/restart`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
				},
			},
		);

		if (!response.ok) {
			throw new CoolifyDeploymentError(
				`Failed to restart Coolify application: ${response.statusText}`,
			);
		}

		console.log(`[CoolifyService] Restarted application: ${applicationUuid}`);
	}

	/**
	 * Deletes a Coolify application
	 */
	async deleteApplication(applicationUuid: string): Promise<void> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}?delete_configurations=true&delete_volumes=true&docker_cleanup=true`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
				},
			},
		);

		if (!response.ok) {
			throw new CoolifyDeploymentError(
				`Failed to delete Coolify application: ${response.statusText}`,
			);
		}

		console.log(`[CoolifyService] Deleted application: ${applicationUuid}`);
	}

	/**
	 * Checks if a Coolify application exists
	 */
	async applicationExists(applicationUuid: string): Promise<boolean> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
				},
			},
		);

		return response.ok;
	}

	/**
	 * Gets the status of a Coolify application
	 */
	async getApplicationStatus(applicationUuid: string): Promise<string> {
		const response = await fetch(
			`${this.config.apiUrl}/applications/${applicationUuid}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
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
	 * Updates the description of a Coolify application
	 */
	async updateDescription(
		applicationUuid: string,
		description: string,
	): Promise<void> {
		try {
			const response = await fetch(
				`${this.config.apiUrl}/applications/${applicationUuid}`,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${this.config.apiToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ description }),
				},
			);

			if (!response.ok) {
				console.error(
					`[CoolifyService] Failed to update description for ${applicationUuid}:`,
					await response.text(),
				);
			}
		} catch (error) {
			console.error("[CoolifyService] Error updating description:", error);
		}
	}

	/**
	 * Waits for a Coolify application deployment to complete
	 *
	 * Uses a grace period to handle the delay between calling startApplication
	 * and the container actually beginning to start. During the grace period,
	 * "exited"/"stopped" statuses are not treated as failures since they may
	 * represent the old state before Coolify processes the start command.
	 */
	async waitForDeployment(
		applicationUuid: string,
		timeoutMs: number = 30 * 60 * 1000,
		pollIntervalMs: number = 15 * 1000,
	): Promise<DeploymentStatusResult> {
		const startTime = Date.now();

		// Grace period before treating exited/stopped as failures (20 minutes)
		// Deployments (image pull, extract, container creation) take 5-25min
		// During this time status may show "exited"/"stopped" which is normal
		const gracePeriodMs = 20 * 60 * 1000;

		// Success: container is running and ready
		const successStatuses = ["running", "healthy"];
		// In-progress: container is still starting up, keep polling
		// (starting, restarting, unhealthy will fall through and continue polling)
		// Always failures: something is critically wrong
		const alwaysFailedStatuses = ["error", "degraded"];
		// Delayed failures: only treat as failure after grace period
		// (container may show "exited"/"stopped" briefly during startup)
		const delayedFailedStatuses = ["exited", "stopped"];

		while (Date.now() - startTime < timeoutMs) {
			try {
				const status = await this.getApplicationStatus(applicationUuid);
				const elapsedMs = Date.now() - startTime;
				const isGracePeriod = elapsedMs < gracePeriodMs;

				console.log(
					`[CoolifyService] Application ${applicationUuid} status: ${status} (elapsed: ${Math.round(elapsedMs / 1000)}s, grace: ${isGracePeriod})`,
				);

				if (successStatuses.includes(status.toLowerCase())) {
					return { success: true, status };
				}

				// Always treat these as failures
				if (alwaysFailedStatuses.includes(status.toLowerCase())) {
					return {
						success: false,
						status,
						error: `Deployment failed with status: ${status}`,
					};
				}

				// Only treat exited/stopped as failures after grace period
				if (
					!isGracePeriod &&
					delayedFailedStatuses.includes(status.toLowerCase())
				) {
					return {
						success: false,
						status,
						error: `Deployment failed with status: ${status}`,
					};
				}

				await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
			} catch (error) {
				console.error(
					"[CoolifyService] Error polling deployment status:",
					error,
				);

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
	 * Deploys a bot with retry logic
	 */
	async deployWithRetry(
		botId: number,
		image: BotImage,
		botConfig: schema.BotConfig,
		maxRetries: number = 3,
	): Promise<string> {
		let applicationUuid: string | null = null;
		let lastError: string | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			console.log(
				`[CoolifyService] Deployment attempt ${attempt}/${maxRetries} for bot ${botId}`,
			);

			try {
				if (!applicationUuid) {
					applicationUuid = await this.createApplication(
						botId,
						image,
						botConfig,
					);

					console.log(
						`[CoolifyService] Created application ${applicationUuid} for bot ${botId}`,
					);
				} else {
					console.log(
						`[CoolifyService] Restarting application ${applicationUuid} (retry ${attempt})`,
					);

					await this.restartApplication(applicationUuid);
				}

				const result = await this.waitForDeployment(applicationUuid);

				if (result.success) {
					console.log(
						`[CoolifyService] Bot ${botId} deployed successfully on attempt ${attempt}`,
					);

					return applicationUuid;
				}

				lastError =
					result.error ?? `Deployment failed with status: ${result.status}`;

				console.warn(
					`[CoolifyService] Deployment attempt ${attempt} failed: ${lastError}`,
				);

				if (attempt < maxRetries) {
					const backoffMs = Math.min(1000 * 2 ** attempt, 30000);

					console.log(
						`[CoolifyService] Waiting ${backoffMs}ms before retry...`,
					);

					await new Promise((resolve) => setTimeout(resolve, backoffMs));
				}
			} catch (error) {
				lastError = error instanceof Error ? error.message : "Unknown error";

				console.error(
					`[CoolifyService] Deployment attempt ${attempt} error:`,
					error,
				);

				if (attempt < maxRetries) {
					const backoffMs = Math.min(1000 * 2 ** attempt, 30000);
					await new Promise((resolve) => setTimeout(resolve, backoffMs));
				}
			}
		}

		if (applicationUuid) {
			console.log(
				`[CoolifyService] All ${maxRetries} deployment attempts failed. Cleaning up application ${applicationUuid}`,
			);

			try {
				await this.deleteApplication(applicationUuid);
			} catch (cleanupError) {
				console.error(
					"[CoolifyService] Failed to cleanup application:",
					cleanupError,
				);
			}
		}

		throw new CoolifyDeploymentError(
			`Bot deployment failed after ${maxRetries} attempts: ${lastError}`,
		);
	}
}
