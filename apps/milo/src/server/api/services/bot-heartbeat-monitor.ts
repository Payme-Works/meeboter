import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { db } from "@/server/database/db";
import { botsTable, type Status } from "@/server/database/schema";
import type { Services } from "./index";

/**
 * Lazily imports services to avoid circular dependency
 */
async function getServices(): Promise<Services> {
	const { services } = await import("./index");

	return services;
}

/** How often to run the heartbeat monitor (5 minutes) */
const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

/** Timeout for heartbeat before marking bot as FATAL (5 minutes) */
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Active statuses where the bot container should be running and sending heartbeats
 * DEPLOYING is excluded because container might not have started yet (5-25 min)
 */
const ACTIVE_STATUSES: Status[] = [
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
];

interface MonitorResult {
	checked: number;
	markedFatal: number;
	slotsReleased: number;
}

/**
 * Starts the background bot heartbeat monitor job
 *
 * Runs every 5 minutes to detect crashed bots by checking heartbeat timestamps.
 * Bots with active status but no heartbeat for 5+ minutes are marked as FATAL.
 * Should be called once at server startup.
 */
export function startBotHeartbeatMonitor(): void {
	console.log(
		"[HeartbeatMonitor] Starting bot heartbeat monitor (interval: 5min, timeout: 5min)",
	);

	// Run immediately on startup
	checkStaleHeartbeats();

	// Then run every interval
	setInterval(() => {
		checkStaleHeartbeats();
	}, MONITOR_INTERVAL_MS);
}

/**
 * Checks for bots with stale heartbeats and marks them as FATAL
 *
 * A bot is considered crashed if:
 * - Status is active (JOINING_CALL, IN_WAITING_ROOM, IN_CALL)
 * - Last heartbeat is older than HEARTBEAT_TIMEOUT_MS (5 minutes)
 *   OR lastHeartbeat is null (never sent a heartbeat)
 */
async function checkStaleHeartbeats(): Promise<MonitorResult> {
	const result: MonitorResult = {
		checked: 0,
		markedFatal: 0,
		slotsReleased: 0,
	};

	try {
		const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

		// Find bots with active status and stale/missing heartbeat
		const staleBots = await db
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
			`[HeartbeatMonitor] Found ${staleBots.length} bots with stale heartbeats`,
		);

		const services = await getServices();

		for (const bot of staleBots) {
			try {
				const lastHeartbeatStr = bot.lastHeartbeat
					? bot.lastHeartbeat.toISOString()
					: "never";

				console.log(
					`[HeartbeatMonitor] Marking bot ${bot.id} as FATAL (status: ${bot.status}, lastHeartbeat: ${lastHeartbeatStr})`,
				);

				// Mark bot as FATAL
				await db
					.update(botsTable)
					.set({
						status: "FATAL",
						deploymentError: `Bot crashed or stopped responding (no heartbeat for 5+ minutes)`,
					})
					.where(eq(botsTable.id, bot.id));

				result.markedFatal++;

				// Release platform resources if assigned
				if (bot.coolifyServiceUuid) {
					try {
						await services.platform.releaseBot(bot.id);
						result.slotsReleased++;

						console.log(
							`[HeartbeatMonitor] Released platform resources for bot ${bot.id}`,
						);
					} catch (releaseError) {
						console.error(
							`[HeartbeatMonitor] Failed to release resources for bot ${bot.id}:`,
							releaseError,
						);
					}
				}
			} catch (botError) {
				console.error(
					`[HeartbeatMonitor] Failed to process bot ${bot.id}:`,
					botError,
				);
			}
		}

		console.log(
			`[HeartbeatMonitor] Results: checked=${result.checked} markedFatal=${result.markedFatal} slotsReleased=${result.slotsReleased}`,
		);
	} catch (error) {
		console.error("[HeartbeatMonitor] Job failed:", error);
	}

	return result;
}
