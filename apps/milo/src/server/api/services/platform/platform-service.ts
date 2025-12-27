import type { BotConfig } from "@/server/database/schema";

/**
 * Result of a successful platform deployment
 * Failures throw PlatformDeployError instead of returning success: false
 */
export interface PlatformDeployResult {
	/** Platform-specific identifier (job name, task ARN, slot UUID) */
	identifier: string;

	/** Slot name if deployed (Coolify only) */
	slotName?: string;
}

/**
 * Error thrown when platform deployment fails
 */
export class PlatformDeployError extends Error {
	constructor(
		message: string,
		public readonly platform: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = "PlatformDeployError";
	}
}

/**
 * Platform service interface for bot deployment
 *
 * This interface abstracts the deployment platform (Coolify, AWS ECS, or Kubernetes)
 * allowing the application layer to work with any platform without changes.
 *
 * The TStatus type parameter allows each platform to define its own status enum,
 * ensuring type-safe status handling specific to each platform.
 *
 * Platform-specific status types are defined in their respective service files:
 * - CoolifyBotStatus: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR"
 * - K8sBotStatus: "PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED"
 * - AWSBotStatus: "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED"
 * - LocalBotStatus: "IDLE" | "RUNNING" | "STOPPED" | "ERROR"
 *
 * @template TStatus - Platform-specific bot status type
 */
export interface PlatformService<TStatus extends string = string> {
	/** Platform name for logging and identification */
	readonly platformName: "coolify" | "aws" | "k8s" | "local";

	/**
	 * Deploys a bot using the platform's deployment mechanism
	 *
	 * For Coolify: Acquires a pool slot, configures, and starts the container
	 * For AWS: Runs a new ECS task with the bot configuration
	 * For K8s: Creates a Job with the bot configuration
	 *
	 * @param botConfig - Full bot configuration from database
	 * @returns Deploy result with identifier
	 * @throws PlatformDeployError if deployment fails
	 */
	deployBot(botConfig: BotConfig): Promise<PlatformDeployResult>;

	/**
	 * Stops a running bot
	 *
	 * For Coolify: Stops the container but keeps the slot
	 * For AWS: Stops the ECS task
	 *
	 * @param identifier - Platform-specific identifier (Coolify UUID or ECS task ARN)
	 */
	stopBot(identifier: string): Promise<void>;

	/**
	 * Gets the current status of a bot
	 *
	 * @param identifier - Platform-specific identifier
	 * @returns Platform-specific status value
	 */
	getBotStatus(identifier: string): Promise<TStatus>;

	/**
	 * Releases resources after bot completion (optional)
	 *
	 * For Coolify: Returns the slot to the pool for reuse
	 * For AWS/K8s: No-op (ephemeral resources cleaned up automatically)
	 *
	 * @param botId - The bot ID (used to find the slot in Coolify)
	 */
	releaseBot?(botId: number): Promise<void>;
}
