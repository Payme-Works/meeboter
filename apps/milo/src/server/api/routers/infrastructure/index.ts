import { gte, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import { botsTable } from "@/server/database/schema";
import { services } from "../../services";
import { awsRouter } from "./aws";
import { coolifyRouter } from "./coolify";
import { k8sRouter } from "./k8s";

// ─── Dashboard Schemas ───────────────────────────────────────────────────────

/**
 * Activity stats schema for dashboard card
 */
const activityStatsSchema = z.object({
	deploying: z.number(),
	joiningCall: z.number(),
	inWaitingRoom: z.number(),
	inCall: z.number(),
	callEnded: z.number(),
	todayTotal: z.number(),
	todayCompleted: z.number(),
	todayFailed: z.number(),
});

/**
 * Platform info discriminated union for dashboard card
 */
const platformInfoSchema = z.discriminatedUnion("platform", [
	z.object({
		platform: z.literal("k8s"),
		namespace: z.string(),
		PENDING: z.number(),
		ACTIVE: z.number(),
		SUCCEEDED: z.number(),
		FAILED: z.number(),
	}),
	z.object({
		platform: z.literal("aws"),
		cluster: z.string(),
		region: z.string(),
		PROVISIONING: z.number(),
		RUNNING: z.number(),
		STOPPED: z.number(),
		FAILED: z.number(),
	}),
	z.object({
		platform: z.literal("coolify"),
		queueDepth: z.number(),
		IDLE: z.number(),
		DEPLOYING: z.number(),
		HEALTHY: z.number(),
		ERROR: z.number(),
	}),
	z.object({
		platform: z.literal("local"),
		message: z.string(),
	}),
]);

// ─── Main Infrastructure Router ──────────────────────────────────────────────

/**
 * Infrastructure router with platform-specific sub-routers
 *
 * Structure:
 * - infrastructure.coolify.getStats() → { IDLE, DEPLOYING, HEALTHY, ERROR }
 * - infrastructure.coolify.getSlots() → slot list
 * - infrastructure.k8s.getStats() → { PENDING, ACTIVE, SUCCEEDED, FAILED }
 * - infrastructure.k8s.getJobs() → job list
 * - infrastructure.aws.getStats() → { PROVISIONING, RUNNING, STOPPED, FAILED }
 * - infrastructure.aws.getTasks() → task list
 * - infrastructure.getActivityStats() → dashboard bot activity stats
 * - infrastructure.getPlatform() → platform-specific info for dashboard
 *
 * @see rules/ROUTER_STRUCTURE.md
 * @see rules/API_PATTERNS.md
 * @see rules/PLATFORM_NOMENCLATURE.md
 */
export const infrastructureRouter = createTRPCRouter({
	coolify: coolifyRouter,
	k8s: k8sRouter,
	aws: awsRouter,

	/**
	 * Get bot activity stats for dashboard card
	 * Returns counts of bots in each status + daily metrics
	 */
	getActivityStats: protectedProcedure
		.input(z.void())
		.output(activityStatsSchema)
		.query(async () => {
			// Get current bot status counts
			const statusCounts = await db
				.select({
					status: botsTable.status,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.groupBy(botsTable.status);

			// Get today's date at midnight
			const today = new Date();
			today.setHours(0, 0, 0, 0);

			// Get today's bot statistics
			const [todayStats] = await db
				.select({
					total: sql<number>`count(*)`,
					completed: sql<number>`count(*) filter (where status = 'DONE')`,
					failed: sql<number>`count(*) filter (where status = 'FATAL')`,
				})
				.from(botsTable)
				.where(gte(botsTable.createdAt, today));

			// Build counts object
			const counts = {
				deploying: 0,
				joiningCall: 0,
				inWaitingRoom: 0,
				inCall: 0,
				callEnded: 0,
			};

			for (const row of statusCounts) {
				const count = Number(row.count);

				switch (row.status) {
					case "DEPLOYING":
						counts.deploying = count;

						break;
					case "JOINING_CALL":
						counts.joiningCall = count;

						break;
					case "IN_WAITING_ROOM":
						counts.inWaitingRoom = count;

						break;
					case "IN_CALL":
						counts.inCall = count;

						break;
					case "CALL_ENDED":
						counts.callEnded = count;

						break;
				}
			}

			return {
				...counts,
				todayTotal: Number(todayStats?.total ?? 0),
				todayCompleted: Number(todayStats?.completed ?? 0),
				todayFailed: Number(todayStats?.failed ?? 0),
			};
		}),

	/**
	 * Get platform-specific info for dashboard card
	 * Returns platform info based on DEPLOYMENT_PLATFORM
	 */
	getPlatform: protectedProcedure
		.input(z.void())
		.output(platformInfoSchema)
		.query(async () => {
			const platform = env.DEPLOYMENT_PLATFORM;

			switch (platform) {
				case "k8s": {
					const metrics = services.k8s
						? await services.k8s.getClusterMetrics()
						: {
								namespace: "N/A",
								PENDING: 0,
								ACTIVE: 0,
								SUCCEEDED: 0,
								FAILED: 0,
								total: 0,
							};

					return {
						platform: "k8s" as const,
						namespace: metrics.namespace,
						PENDING: metrics.PENDING,
						ACTIVE: metrics.ACTIVE,
						SUCCEEDED: metrics.SUCCEEDED,
						FAILED: metrics.FAILED,
					};
				}

				case "aws": {
					const metrics = services.aws
						? await services.aws.getClusterMetrics()
						: {
								cluster: env.ECS_CLUSTER ?? "N/A",
								region: env.AWS_REGION ?? "N/A",
								PROVISIONING: 0,
								RUNNING: 0,
								STOPPED: 0,
								FAILED: 0,
								total: 0,
							};

					return {
						platform: "aws" as const,
						cluster: metrics.cluster,
						region: metrics.region,
						PROVISIONING: metrics.PROVISIONING,
						RUNNING: metrics.RUNNING,
						STOPPED: metrics.STOPPED,
						FAILED: metrics.FAILED,
					};
				}

				case "coolify": {
					const poolStats = services.pool
						? await services.pool.getPoolStats()
						: {
								total: 0,
								IDLE: 0,
								DEPLOYING: 0,
								HEALTHY: 0,
								ERROR: 0,
								maxSize: 100,
							};

					const queueStats = services.pool
						? await services.pool.getQueueStats()
						: { length: 0, oldestQueuedAt: null, avgWaitMs: 0 };

					return {
						platform: "coolify" as const,
						queueDepth: queueStats.length,
						IDLE: poolStats.IDLE,
						DEPLOYING: poolStats.DEPLOYING,
						HEALTHY: poolStats.HEALTHY,
						ERROR: poolStats.ERROR,
					};
				}

				default:
					return {
						platform: "local" as const,
						message: "Running in local development mode",
					};
			}
		}),
});
