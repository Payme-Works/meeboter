import type { BotConfig } from "@/server/database/schema";

/**
 * Result of deploying a bot through a platform
 */
export interface PlatformDeployResult {
	/** Platform-specific identifier (Coolify UUID or ECS task ARN) */
	identifier: string;

	/** Slot name for display purposes (only available for Coolify) */
	slotName?: string;
}

/**
 * Result of attempting to deploy through a platform that supports queuing
 */
export interface PlatformDeployWithQueueResult {
	/** Whether deployment was successful or bot was queued */
	success: boolean;

	/** Platform-specific identifier if deployed */
	identifier?: string;

	/** Slot name if deployed (Coolify only) */
	slotName?: string;

	/** Whether the bot was added to a queue */
	queued?: boolean;

	/** Position in queue if queued */
	queuePosition?: number;

	/** Estimated wait time in milliseconds if queued */
	estimatedWaitMs?: number;

	/** Error message if failed */
	error?: string;
}

/**
 * Normalized bot status across platforms
 */
export type PlatformBotStatus =
	| "deploying"
	| "running"
	| "stopped"
	| "error"
	| "unknown";

/**
 * Platform service interface for bot deployment
 *
 * This interface abstracts the deployment platform (Coolify or AWS ECS)
 * allowing the application layer to work with either without changes.
 */
export interface PlatformService {
	/** Platform name for logging and identification */
	readonly platformName: "coolify" | "aws";

	/**
	 * Deploys a bot using the platform's deployment mechanism
	 *
	 * For Coolify: Acquires a pool slot, configures, and starts the container
	 * For AWS: Runs a new ECS task with the bot configuration
	 *
	 * @param botConfig - Full bot configuration from database
	 * @param queueTimeoutMs - How long to wait in queue if resources exhausted (Coolify only)
	 * @returns Deploy result with identifier and queue info if applicable
	 */
	deployBot(
		botConfig: BotConfig,
		queueTimeoutMs?: number,
	): Promise<PlatformDeployWithQueueResult>;

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
	 * @returns Normalized status string
	 */
	getBotStatus(identifier: string): Promise<PlatformBotStatus>;

	/**
	 * Releases resources after bot completion
	 *
	 * For Coolify: Returns the slot to the pool for reuse
	 * For AWS: Ensures task is stopped (no-op for ephemeral tasks)
	 *
	 * @param botId - The bot ID (used to find the slot in Coolify)
	 */
	releaseBot(botId: number): Promise<void>;

	/**
	 * Processes any queued bots when resources become available
	 *
	 * For Coolify: Checks queue and deploys next bot if slot available
	 * For AWS: No-op (AWS doesn't have a queue concept)
	 */
	processQueue(): Promise<void>;
}
