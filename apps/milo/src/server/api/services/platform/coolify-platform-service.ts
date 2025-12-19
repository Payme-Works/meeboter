import type { BotConfig } from "@/server/database/schema";
import type { BotPoolService } from "../bot-pool-service";
import type { CoolifyService } from "../coolify-service";
import type {
	PlatformBotStatus,
	PlatformDeployWithQueueResult,
	PlatformService,
} from "./platform-service";

/**
 * Coolify platform service implementation
 *
 * Wraps the existing BotPoolService and CoolifyService to provide
 * a pool-based deployment system where pre-provisioned containers
 * are reused across bot deployments.
 */
export class CoolifyPlatformService implements PlatformService {
	readonly platformName = "coolify" as const;

	constructor(
		private readonly poolService: BotPoolService,
		private readonly coolifyService: CoolifyService,
	) {}

	async deployBot(
		botConfig: BotConfig,
		queueTimeoutMs: number = 5 * 60 * 1000,
	): Promise<PlatformDeployWithQueueResult> {
		const botId = botConfig.id;

		// Try to acquire or create a slot
		const slot = await this.poolService.acquireOrCreateSlot(botId);

		if (slot) {
			// Got a slot, fire-and-forget configuration and start
			// This avoids HTTP timeout when waiting for image pull lock
			// The slot is already in "deploying" state from acquireOrCreateSlot
			this.poolService.configureAndStartSlot(slot, botConfig).catch((error) => {
				console.error(
					`[CoolifyPlatform] Failed to configure slot ${slot.slotName} for bot ${botId}:`,
					error,
				);
				// configureAndStartSlot handles error state internally
			});

			console.log(
				`[CoolifyPlatform] Bot ${botId} assigned to slot ${slot.slotName}, configuring in background`,
			);

			return {
				success: true,
				identifier: slot.coolifyServiceUuid,
				slotName: slot.slotName,
			};
		}

		// No slot available, add to queue
		console.log(
			`[CoolifyPlatform] Bot ${botId} added to queue (pool exhausted)`,
		);

		const queuePosition = await this.poolService.addToQueue(
			botId,
			queueTimeoutMs,
			100, // default priority
		);

		const estimatedWaitMs = this.poolService.getEstimatedWaitMs(queuePosition);

		return {
			success: true,
			queued: true,
			queuePosition,
			estimatedWaitMs,
		};
	}

	async stopBot(identifier: string): Promise<void> {
		await this.coolifyService.stopApplication(identifier);
	}

	async getBotStatus(identifier: string): Promise<PlatformBotStatus> {
		try {
			const status = await this.coolifyService.getApplicationStatus(identifier);

			return this.normalizeStatus(status);
		} catch {
			return "unknown";
		}
	}

	async releaseBot(botId: number): Promise<void> {
		await this.poolService.releaseSlot(botId);
	}

	async processQueue(): Promise<void> {
		await this.poolService.processQueueOnSlotRelease();
	}

	/**
	 * Normalizes Coolify status strings to platform-agnostic status
	 */
	private normalizeStatus(coolifyStatus: string): PlatformBotStatus {
		const status = coolifyStatus.toLowerCase();

		if (status === "running" || status === "healthy") {
			return "running";
		}

		if (status === "stopped" || status === "exited") {
			return "stopped";
		}

		if (status === "error" || status === "degraded") {
			return "error";
		}

		if (status === "starting" || status === "restarting") {
			return "deploying";
		}

		return "unknown";
	}
}
