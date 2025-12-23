/**
 * BotHealthWorker - Monitors ACTIVE bot health via heartbeats
 *
 * ## Bot Status Flow
 *
 * Normal lifecycle:
 *   DEPLOYING → JOINING_CALL → IN_WAITING_ROOM → IN_CALL → LEAVING → DONE
 *
 * Error scenarios handled by this worker:
 *   IN_CALL → [heartbeat stops >5min] → FATAL (marked + resources released)
 *   JOINING_CALL → [heartbeat stops >5min] → FATAL
 *   IN_WAITING_ROOM → [heartbeat stops >5min] → FATAL
 *   LEAVING → [heartbeat stops >5min] → FATAL
 *
 * ## Monitored Statuses (ACTIVE only)
 *
 * ACTIVE statuses where the bot container should be running and sending heartbeats:
 *   - JOINING_CALL: Bot is connecting to the meeting
 *   - IN_WAITING_ROOM: Bot is waiting to be admitted
 *   - IN_CALL: Bot is in the meeting (recording/participating)
 *   - LEAVING: Bot is gracefully exiting
 *
 * NOT monitored by this worker:
 *   - DEPLOYING: Handled by BotRecoveryWorker (has retry logic, slot recovery)
 *   - DONE/FATAL: Terminal states, no monitoring needed
 *   - CREATED: Not yet deployed
 *
 * ## Detection Criteria
 *
 * Active bots are considered crashed when:
 *   - Status is in ACTIVE_STATUSES (container should be running)
 *   - AND (lastHeartbeat > 5 minutes ago OR lastHeartbeat is NULL)
 *
 * ## Recovery Process
 *
 * For each stale bot:
 *   1. Mark bot status as FATAL
 *   2. Release platform resources (stop container via PlatformService)
 *
 * ## Relationship with Other Workers
 *
 * - BotRecoveryWorker: Handles DEPLOYING timeouts + platform resource cleanup
 * - PoolSlotSyncWorker: Handles Coolify ↔ Database consistency
 * - BotHealthWorker: Handles ACTIVE bot heartbeat monitoring only
 */

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import {
	botPoolSlotsTable,
	botsTable,
	type Status,
} from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

/** Timeout for heartbeat before marking bot as FATAL (5 minutes) */
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Active statuses where the bot container should be running and sending heartbeats.
 * If heartbeat goes stale (> 5 min), the bot is marked as FATAL.
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
		};

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
}
