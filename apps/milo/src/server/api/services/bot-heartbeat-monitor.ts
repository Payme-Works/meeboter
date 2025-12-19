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
const HEARTBEAT_TIMEOUT_MS = 10 * 60 * 1000;

/** Timeout for DEPLOYING bots that never sent a heartbeat (30 minutes) */
const DEPLOYMENT_TIMEOUT_MS = 30 * 60 * 1000;

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
 * - Status is active (JOINING_CALL, IN_WAITING_ROOM, IN_CALL) AND
 *   (lastHeartbeat > 5 min old OR lastHeartbeat is null)
 * - OR status is DEPLOYING AND lastHeartbeat > 5 min old (container started but crashed)
 * - OR status is DEPLOYING AND lastHeartbeat is null AND createdAt > 30 min ago (container never started)
 */
async function checkStaleHeartbeats(): Promise<MonitorResult> {
	const result: MonitorResult = {
		checked: 0,
		markedFatal: 0,
		slotsReleased: 0,
	};

	try {
		const heartbeatCutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
		const deploymentCutoff = new Date(Date.now() - DEPLOYMENT_TIMEOUT_MS);

		// Find bots that should be marked as FATAL:
		// 1. Active status (JOINING_CALL, IN_WAITING_ROOM, IN_CALL) with stale/missing heartbeat
		// 2. DEPLOYING status with stale heartbeat (container started but crashed)
		// 3. DEPLOYING status with no heartbeat and old createdAt (container never started)
		const staleBots = await db
			.select({
				id: botsTable.id,
				status: botsTable.status,
				lastHeartbeat: botsTable.lastHeartbeat,
				createdAt: botsTable.createdAt,
				coolifyServiceUuid: botsTable.coolifyServiceUuid,
			})
			.from(botsTable)
			.where(
				or(
					// Case 1: Active status with stale or missing heartbeat
					and(
						inArray(botsTable.status, ACTIVE_STATUSES),
						or(
							lt(botsTable.lastHeartbeat, heartbeatCutoff),
							isNull(botsTable.lastHeartbeat),
						),
					),
					// Case 2: DEPLOYING with stale heartbeat (container started but crashed)
					and(
						eq(botsTable.status, "DEPLOYING"),
						lt(botsTable.lastHeartbeat, heartbeatCutoff),
					),
					// Case 3: DEPLOYING with no heartbeat and deployment timed out
					and(
						eq(botsTable.status, "DEPLOYING"),
						isNull(botsTable.lastHeartbeat),
						lt(botsTable.createdAt, deploymentCutoff),
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

				// Determine the appropriate error message based on the failure mode
				const errorMessage = getDeploymentErrorMessage(bot);

				console.log(
					`[HeartbeatMonitor] Marking bot ${bot.id} as FATAL (status: ${bot.status}, lastHeartbeat: ${lastHeartbeatStr}, reason: ${errorMessage})`,
				);

				// Mark bot as FATAL
				await db
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

/**
 * Generates an appropriate error message based on the bot's failure mode
 */
function getDeploymentErrorMessage(bot: {
	status: Status;
	lastHeartbeat: Date | null;
}): string {
	if (bot.status === "DEPLOYING") {
		if (bot.lastHeartbeat === null) {
			return "Deployment timed out - container never started (no heartbeat received in 30+ minutes)";
		}

		return "Bot crashed during deployment (no heartbeat for 5+ minutes after container started)";
	}

	return "Bot crashed or stopped responding (no heartbeat for 5+ minutes)";
}
