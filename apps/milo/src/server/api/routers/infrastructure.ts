import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { botsTable } from "@/server/database/schema";
import { services } from "../services";
import { getPlatformType } from "../services/platform";

/**
 * Platform-agnostic bot activity stats
 */
const botActivityStatsSchema = z.object({
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
 * Platform-specific details (union type)
 */
const platformDetailsSchema = z.discriminatedUnion("platform", [
	z.object({
		platform: z.literal("k8s"),
		activeJobs: z.number(),
		pendingJobs: z.number(),
		completedJobs: z.number(),
		namespace: z.string(),
	}),
	z.object({
		platform: z.literal("aws"),
		runningTasks: z.number(),
		cluster: z.string(),
		region: z.string(),
	}),
	z.object({
		platform: z.literal("coolify"),
		slotsUsed: z.number(),
		slotsTotal: z.number(),
		idle: z.number(),
		busy: z.number(),
		queueDepth: z.number(),
	}),
	z.object({
		platform: z.literal("local"),
		message: z.string(),
	}),
]);

/**
 * Infrastructure router for platform-agnostic bot activity statistics
 *
 * This router provides unified bot activity stats across all platforms
 * (Kubernetes, AWS ECS, Coolify) with platform-specific details available
 * in a collapsible section.
 */
export const infrastructureRouter = createTRPCRouter({
	/**
	 * Get platform-agnostic bot activity statistics
	 *
	 * Returns counts of bots by status and daily summary statistics.
	 * Works across all deployment platforms.
	 */
	getActivityStats: protectedProcedure
		.input(z.void())
		.output(botActivityStatsSchema)
		.query(async ({ ctx }) => {
			// Get start of today in UTC
			const today = new Date();
			today.setUTCHours(0, 0, 0, 0);

			// Query bot status counts
			const statusCounts = await ctx.db
				.select({
					status: botsTable.status,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.groupBy(botsTable.status);

			// Query today's statistics
			const [todayStats] = await ctx.db
				.select({
					total: count(),
					completed: sql<number>`count(*) filter (where ${botsTable.status} = 'DONE')`,
					failed: sql<number>`count(*) filter (where ${botsTable.status} = 'FATAL')`,
				})
				.from(botsTable)
				.where(gte(botsTable.createdAt, today));

			// Build the response
			const stats = {
				deploying: 0,
				joiningCall: 0,
				inWaitingRoom: 0,
				inCall: 0,
				callEnded: 0,
				todayTotal: Number(todayStats?.total ?? 0),
				todayCompleted: Number(todayStats?.completed ?? 0),
				todayFailed: Number(todayStats?.failed ?? 0),
			};

			for (const row of statusCounts) {
				const rowCount = Number(row.count);

				switch (row.status) {
					case "DEPLOYING":
						stats.deploying = rowCount;
						break;
					case "JOINING_CALL":
						stats.joiningCall = rowCount;
						break;
					case "IN_WAITING_ROOM":
						stats.inWaitingRoom = rowCount;
						break;
					case "IN_CALL":
						stats.inCall = rowCount;
						break;
					case "LEAVING":
					case "DONE":
						stats.callEnded = rowCount;
						break;
				}
			}

			return stats;
		}),

	/**
	 * Get platform-specific infrastructure details
	 *
	 * Returns metrics and configuration specific to the current deployment platform.
	 */
	getPlatformDetails: protectedProcedure
		.input(z.void())
		.output(platformDetailsSchema)
		.query(async ({ ctx }) => {
			const platform = getPlatformType();

			if (platform === "k8s") {
				const metrics = services.k8s
					? await services.k8s.getClusterMetrics()
					: { activeJobs: 0, pendingJobs: 0, totalPods: 0, namespace: "N/A" };

				return {
					platform: "k8s" as const,
					activeJobs: metrics.activeJobs,
					pendingJobs: metrics.pendingJobs,
					completedJobs: metrics.totalPods - metrics.activeJobs,
					namespace: metrics.namespace,
				};
			}

			if (platform === "aws") {
				// AWS doesn't have a central metrics API like K8s
				// We track running tasks via database status
				const result = await ctx.db
					.select({ count: count() })
					.from(botsTable)
					.where(
						and(
							eq(botsTable.status, "IN_CALL"),
							// AWS tasks have identifiers starting with 'arn:'
							sql`${botsTable.platformIdentifier} LIKE 'arn:%'`,
						),
					);

				return {
					platform: "aws" as const,
					runningTasks: Number(result[0]?.count ?? 0),
					cluster: process.env.ECS_CLUSTER ?? "unknown",
					region: process.env.AWS_REGION ?? "unknown",
				};
			}

			if (platform === "coolify") {
				const poolStats = services.pool
					? await services.pool.getPoolStats()
					: { total: 0, idle: 0, deploying: 0, busy: 0, error: 0, maxSize: 0 };

				const queueStats = services.pool
					? await services.pool.getQueueStats()
					: { length: 0, oldestQueuedAt: null, avgWaitMs: 0 };

				return {
					platform: "coolify" as const,
					slotsUsed: poolStats.total,
					slotsTotal: poolStats.maxSize,
					idle: poolStats.idle,
					busy: poolStats.busy,
					queueDepth: queueStats.length,
				};
			}

			// Local platform (development)
			return {
				platform: "local" as const,
				message: "Running in local development mode",
			};
		}),
});
