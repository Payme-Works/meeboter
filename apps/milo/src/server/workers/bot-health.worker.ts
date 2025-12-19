import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { botsTable, type Status } from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

/** Timeout for heartbeat before marking bot as FATAL (10 minutes) */
const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Active statuses where the bot container should be running and sending heartbeats.
 * If heartbeat goes stale (> 10 min), the bot is marked as FATAL.
 *
 * NOTE: DEPLOYING status is NOT included here. Deployment failures are handled
 * by SlotRecoveryWorker which owns the slot lifecycle.
 */
const ACTIVE_STATUSES: Status[] = [
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"LEAVING",
];

export interface BotHealthResult extends WorkerResult {
	checked: number;
	markedFatal: number;
	resourcesReleased: number;
}

/**
 * Worker that monitors bot health via heartbeats.
 *
 * Handles:
 * - Active bots (JOINING_CALL, IN_WAITING_ROOM, IN_CALL, LEAVING) with stale/missing heartbeats
 * - Marks crashed bots as FATAL
 * - Releases platform resources for crashed bots
 *
 * NOTE: Does NOT monitor DEPLOYING bots. Deployment failures are handled by
 * SlotRecoveryWorker which owns the full slot lifecycle including deployment.
 */
export class BotHealthWorker extends BaseWorker<BotHealthResult> {
	readonly name = "BotHealth";

	protected async execute(): Promise<BotHealthResult> {
		const result: BotHealthResult = {
			checked: 0,
			markedFatal: 0,
			resourcesReleased: 0,
		};

		const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

		// Find bots in active status with stale or missing heartbeat
		const staleBots = await this.db
			.select({
				id: botsTable.id,
				status: botsTable.status,
				lastHeartbeat: botsTable.lastHeartbeat,
				coolifyServiceUuid: botsTable.coolifyServiceUuid,
			})
			.from(botsTable)
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

				const errorMessage =
					"Bot crashed or stopped responding (no heartbeat for 10+ minutes)";

				console.log(
					`[${this.name}] Marking bot ${bot.id} as FATAL (status: ${bot.status}, lastHeartbeat: ${lastHeartbeatStr})`,
				);

				// Mark bot as FATAL
				await this.db
					.update(botsTable)
					.set({
						status: "FATAL",
						deploymentError: errorMessage,
					})
					.where(eq(botsTable.id, bot.id));

				result.markedFatal++;

				// Release platform resources if assigned
				if (bot.coolifyServiceUuid) {
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
