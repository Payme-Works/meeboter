import type { BotConfig } from "@/server/database/schema";
import type { BotPoolService } from "../bot-pool-service";
import type { CoolifyService } from "../coolify-service";
import { CoolifyStatusMapper } from "./mappers/coolify-status-mapper";
import {
	PlatformDeployError,
	type PlatformDeployResult,
	type PlatformService,
} from "./platform-service";

/**
 * Coolify slot status values (matches pool schema UPPERCASE convention)
 */
export type CoolifyBotStatus = "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";

/**
 * Coolify platform service implementation
 *
 * Wraps the existing BotPoolService and CoolifyService to provide
 * a pool-based deployment system where pre-provisioned containers
 * are reused across bot deployments.
 */
export class CoolifyPlatformService
	implements PlatformService<CoolifyBotStatus>
{
	readonly platformName = "coolify" as const;

	constructor(
		private readonly poolService: BotPoolService,
		private readonly coolifyService: CoolifyService,
	) {}

	async deployBot(botConfig: BotConfig): Promise<PlatformDeployResult> {
		const botId = botConfig.id;

		// Try to acquire or create a slot
		const slot = await this.poolService.acquireOrCreateSlot(botId);

		if (!slot) {
			// No slot available - throw so hybrid service can try next platform or queue globally
			throw new PlatformDeployError(
				"Coolify pool exhausted: no available slots",
				"coolify",
			);
		}

		// Got a slot, fire-and-forget configuration and start
		// This avoids HTTP timeout when waiting for image pull lock
		// The slot is already in "DEPLOYING" state from acquireOrCreateSlot
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
			identifier: slot.applicationUuid,
			slotName: slot.slotName,
		};
	}

	async stopBot(identifier: string): Promise<void> {
		await this.coolifyService.stopApplication(identifier);
	}

	async getBotStatus(identifier: string): Promise<CoolifyBotStatus> {
		try {
			const status = await this.coolifyService.getApplicationStatus(identifier);

			return CoolifyStatusMapper.toDomain(status);
		} catch (error) {
			console.error(
				`[CoolifyPlatform] Failed to get status for application ${identifier}:`,
				error,
			);

			return "ERROR";
		}
	}

	async releaseBot(botId: number): Promise<void> {
		await this.poolService.releaseSlot(botId);
	}

	async processQueue(): Promise<void> {
		await this.poolService.processQueueOnSlotRelease();
	}
}
