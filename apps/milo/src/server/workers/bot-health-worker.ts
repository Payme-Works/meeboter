/**
 * BotHealthWorker - Monitors bot health via heartbeats and deployment timeouts
 *
 * ## Bot Status Flow
 *
 * Normal lifecycle:
 *   DEPLOYING → JOINING_CALL → IN_WAITING_ROOM → IN_CALL → LEAVING → DONE
 *
 * Error scenarios handled by this worker:
 *   DEPLOYING → [stuck >15min without heartbeat] → FATAL (platform-agnostic)
 *   IN_CALL → [heartbeat stops >10min] → FATAL (marked + resources released)
 *   JOINING_CALL → [heartbeat stops >10min] → FATAL
 *
 * ## Monitored Statuses
 *
 * 1. DEPLOYING status (platform-agnostic cleanup):
 *    - Bots stuck in DEPLOYING for >15 minutes without heartbeat
 *    - Handles K8s, AWS, and Coolify platforms uniformly
 *    - Complementary to SlotRecoveryWorker (which handles Coolify-specific slots)
 *
 * 2. ACTIVE statuses (container should be running):
 *    - JOINING_CALL: Bot is connecting to the meeting
 *    - IN_WAITING_ROOM: Bot is waiting to be admitted
 *    - IN_CALL: Bot is in the meeting (recording/participating)
 *    - LEAVING: Bot is gracefully exiting
 *
 * NOT monitored:
 *   - DONE/FATAL: Terminal states, no monitoring needed
 *
 * ## Detection Criteria
 *
 * DEPLOYING bots are considered stuck when:
 *   - Status is DEPLOYING
 *   - AND createdAt > 15 minutes ago
 *   - AND (lastHeartbeat is NULL OR lastHeartbeat > 10 minutes ago)
 *
 * Active bots are considered crashed when:
 *   - Status is in ACTIVE_STATUSES (container should be running)
 *   - AND (lastHeartbeat > 10 minutes ago OR lastHeartbeat is NULL)
 *
 * ## Recovery Process
 *
 * For each stuck/stale bot:
 *   1. Mark bot status as FATAL with error message
 *   2. Release platform resources (stop container via PlatformService)
 *
 * ## Relationship with Other Workers
 *
 * - SlotRecoveryWorker: Handles Coolify-specific slot state recovery
 * - PoolSlotSyncWorker: Handles Coolify ↔ Database consistency
 * - BotHealthWorker: Handles bot health monitoring (platform-agnostic)
 */

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import {
	botPoolSlotsTable,
	botsTable,
	type Status,
} from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

/** Timeout for heartbeat before marking bot as FATAL (10 minutes) */
const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;

/** Timeout for DEPLOYING status before marking bot as FATAL (15 minutes) */
const DEPLOYING_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Active statuses where the bot container should be running and sending heartbeats.
 * If heartbeat goes stale (> 10 min), the bot is marked as FATAL.
 */
const ACTIVE_STATUSES: Status[] = [
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"LEAVING",
];

interface BotHealthResult extends WorkerResult {
	checked: number;
	markedFatal: number;
	resourcesReleased: number;
	stuckDeploying: number;
}

/**
 * Worker that monitors bot health via heartbeats.
 */
export class BotHealthWorker extends BaseWorker<BotHealthResult> {
	readonly name = "BotHealthWorker";

	protected async execute(): Promise<BotHealthResult> {
		const result: BotHealthResult = {
			checked: 0,
			markedFatal: 0,
			resourcesReleased: 0,
			stuckDeploying: 0,
		};

		// Handle stuck DEPLOYING bots (platform-agnostic, handles K8s/AWS/Coolify)
		await this.handleStuckDeployingBots(result);

		const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

		// Find bots in active status with stale or missing heartbeat
		// Join with pool slots to get the applicationUuid
		const staleBots = await this.db
			.select({
				id: botsTable.id,
				status: botsTable.status,
				lastHeartbeat: botsTable.lastHeartbeat,
				applicationUuid: botPoolSlotsTable.applicationUuid,
			})
			.from(botsTable)
			.leftJoin(
				botPoolSlotsTable,
				eq(botPoolSlotsTable.assignedBotId, botsTable.id),
			)
			.where(
				and(
					inArray(botsTable.status, ACTIVE_STATUSES),
					or(
						lt(botsTable.lastHeartbeat, heartbeatCutoff),
						isNull(botsTable.lastHeartbeat),
					),
				),
			);

		result.checked = staleBots.length;

		if (staleBots.length === 0) {
			return result;
		}

		console.log(
			`[${this.name}] Found ${staleBots.length} bots with stale heartbeats`,
		);

		for (const bot of staleBots) {
			try {
				const lastHeartbeatStr = bot.lastHeartbeat
					? bot.lastHeartbeat.toISOString()
					: "never";

				console.log(
					`[${this.name}] Marking bot ${bot.id} as FATAL (status: ${bot.status}, lastHeartbeat: ${lastHeartbeatStr})`,
				);

				// Mark bot as FATAL
				await this.db
					.update(botsTable)
					.set({
						status: "FATAL",
					})
					.where(eq(botsTable.id, bot.id));

				result.markedFatal++;

				// Release platform resources if assigned
				if (bot.applicationUuid) {
					try {
						await this.services.platform.releaseBot(bot.id);
						result.resourcesReleased++;

						console.log(
							`[${this.name}] Released platform resources for bot ${bot.id}`,
						);
					} catch (releaseError) {
						console.error(
							`[${this.name}] Failed to release resources for bot ${bot.id}:`,
							releaseError,
						);
					}
				}
			} catch (botError) {
				console.error(
					`[${this.name}] Failed to process bot ${bot.id}:`,
					botError,
				);
			}
		}

		return result;
	}

	/**
	 * Handles bots stuck in DEPLOYING status for too long.
	 *
	 * This is platform-agnostic and covers K8s, AWS, and Coolify platforms.
	 * Bots stuck in DEPLOYING for more than 15 minutes are marked as FATAL.
	 */
	private async handleStuckDeployingBots(
		result: BotHealthResult,
	): Promise<void> {
		const deployingCutoff = new Date(Date.now() - DEPLOYING_TIMEOUT_MS);

		// Find bots stuck in DEPLOYING for more than 15 minutes
		const stuckBots = await this.db
			.select({
				id: botsTable.id,
				createdAt: botsTable.createdAt,
				lastHeartbeat: botsTable.lastHeartbeat,
				platformIdentifier: botsTable.platformIdentifier,
			})
			.from(botsTable)
			.where(
				and(
					eq(botsTable.status, "DEPLOYING"),
					lt(botsTable.createdAt, deployingCutoff),
				),
			);

		if (stuckBots.length === 0) {
			return;
		}

		console.log(
			`[${this.name}] Found ${stuckBots.length} bots stuck in DEPLOYING for >15 minutes`,
		);

		for (const bot of stuckBots) {
			try {
				// Check if bot has recent heartbeat (might be alive but status not updated)
				if (bot.lastHeartbeat) {
					const heartbeatAge = Date.now() - bot.lastHeartbeat.getTime();

					if (heartbeatAge < HEARTBEAT_TIMEOUT_MS) {
						console.log(
							`[${this.name}] Skipping bot ${bot.id}, has recent heartbeat (${Math.round(heartbeatAge / 1000)}s ago)`,
						);

						continue;
					}
				}

				console.log(
					`[${this.name}] Marking stuck DEPLOYING bot ${bot.id} as FATAL (created: ${bot.createdAt?.toISOString()})`,
				);

				await this.db
					.update(botsTable)
					.set({
						status: "FATAL",
					})
					.where(eq(botsTable.id, bot.id));

				result.stuckDeploying++;
				result.markedFatal++;

				// Release platform resources if available
				try {
					await this.services.platform.releaseBot(bot.id);
					result.resourcesReleased++;

					console.log(
						`[${this.name}] Released platform resources for stuck bot ${bot.id}`,
					);
				} catch {
					// Ignore release errors, bot might not have platform resources
					console.log(
						`[${this.name}] No platform resources to release for bot ${bot.id}`,
					);
				}
			} catch (botError) {
				console.error(
					`[${this.name}] Failed to process stuck DEPLOYING bot ${bot.id}:`,
					botError,
				);
			}
		}
	}
}
