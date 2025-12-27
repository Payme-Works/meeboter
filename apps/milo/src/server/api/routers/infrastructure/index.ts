import { gte, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import { botsTable } from "@/server/database/schema";
import { services } from "../../services";
import type { DeploymentPlatform } from "../../services/platform";
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
 * Bot status for activity bars visualization
 */
const botActivityStatusSchema = z.enum(["DEPLOYING", "JOINING", "IN_CALL"]);

/**
 * Active bots sequence for dashboard visualization
 */
const activeBotSequenceSchema = z.array(botActivityStatusSchema);

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

// ─── Hybrid Infrastructure Schemas ──────────────────────────────────────────

/**
 * Platform capacity schema for hybrid infrastructure
 */
const platformCapacitySchema = z.object({
	platform: z.enum(["k8s", "aws", "coolify"]),
	used: z.number(),
	limit: z.number(),
	queueTimeout: z.number(),
	isEnabled: z.boolean(),
});

/**
 * Queued bot schema for global queue display
 */
const queuedBotSchema = z.object({
	id: z.number(),
	botId: z.number(),
	botName: z.string().nullable(),
	meetingPlatform: z.string(),
	queuedAt: z.date(),
	timeoutAt: z.date(),
	position: z.number(),
});

/**
 * Queue statistics schema
 */
const queueStatsSchema = z.object({
	total: z.number(),
	oldest: z.date().nullable(),
	avgWaitMs: z.number(),
});

// ─── Cost Estimation Constants ────────────────────────────────────────────────

/**
 * Pricing constants based on AWS Fargate ARM64 (us-east-2) with 90% Spot blend.
 * @see ARCHITECTURE.md for detailed cost analysis
 */
const PRICING = {
	// AWS Fargate ARM64 blended rate (90% Spot / 10% On-Demand)
	AWS_VCPU_PER_HOUR: 0.01426,
	AWS_GB_PER_HOUR: 0.00143,

	// K8s uses same cloud-equivalent rates for comparison
	K8S_VCPU_PER_HOUR: 0.01426,
	K8S_GB_PER_HOUR: 0.00143,

	// Coolify flat rate (based on ~$90/mo for ~45,000 bot-hours)
	COOLIFY_PER_HOUR: 0.002,

	// Default resource allocation per bot (when actual resources unknown)
	DEFAULT_VCPU: 0.5,
	DEFAULT_GB: 1,
} as const;

/**
 * Platform cost stats schema
 */
const platformCostSchema = z.object({
	platform: z.enum(["k8s", "aws", "coolify"]),
	activeBots: z.number(),
	currentHourlyCost: z.number(),
	last24hCost: z.number(),
	last7dCost: z.number(),
	last30dCost: z.number(),
	projectedMonthlyCost: z.number(),
});

/**
 * Total cost stats schema
 */
const costStatsSchema = z.object({
	// Summary totals
	totalActiveBots: z.number(),
	totalCurrentHourlyCost: z.number(),
	totalLast24hCost: z.number(),
	totalLast7dCost: z.number(),
	totalLast30dCost: z.number(),
	totalProjectedMonthlyCost: z.number(),

	// Per-platform breakdown
	platforms: z.array(platformCostSchema),
});

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
	 * Get active bots status sequence for dashboard visualization
	 * Returns array of statuses in creation order (oldest first)
	 */
	getActiveBotSequence: protectedProcedure
		.input(z.void())
		.output(activeBotSequenceSchema)
		.query(async () => {
			const activeBots = await db
				.select({
					status: botsTable.status,
				})
				.from(botsTable)
				.where(
					sql`${botsTable.status} IN ('DEPLOYING', 'JOINING_CALL', 'IN_WAITING_ROOM', 'IN_CALL')`,
				)
				.orderBy(botsTable.createdAt);

			return activeBots.map((bot) => {
				switch (bot.status) {
					case "DEPLOYING":
						return "DEPLOYING" as const;
					case "JOINING_CALL":
					case "IN_WAITING_ROOM":
						return "JOINING" as const;
					case "IN_CALL":
						return "IN_CALL" as const;
					default:
						return "DEPLOYING" as const;
				}
			});
		}),

	/**
	 * Get platform-specific info for dashboard card (single platform)
	 * @deprecated Use getPlatforms for multi-platform support
	 */
	getPlatform: protectedProcedure
		.input(z.void())
		.output(platformInfoSchema)
		.query(async () => {
			const enabledPlatforms = services.hybrid.getEnabledPlatforms();
			const platform = enabledPlatforms[0];

			if (!platform) {
				return {
					platform: "local" as const,
					message: "Running in local development mode",
				};
			}

			return await getPlatformInfo(platform);
		}),

	/**
	 * Get all active platforms with their info for dashboard card
	 * Returns array of platform info for multi-platform display
	 */
	getPlatforms: protectedProcedure
		.input(z.void())
		.output(z.array(platformInfoSchema))
		.query(async () => {
			const enabledPlatforms = services.hybrid.getEnabledPlatforms();

			if (enabledPlatforms.length === 0) {
				return [
					{
						platform: "local" as const,
						message: "Running in local development mode",
					},
				];
			}

			const platformInfos = await Promise.all(
				enabledPlatforms.map((platform) => getPlatformInfo(platform)),
			);

			return platformInfos;
		}),

	/**
	 * Get capacity stats for all enabled platforms
	 * Used for hybrid infrastructure monitoring
	 */
	getActivePlatforms: protectedProcedure
		.input(z.void())
		.output(z.array(platformCapacitySchema))
		.query(async () => {
			return await services.hybrid.getCapacityStats();
		}),

	/**
	 * Get global queue statistics
	 * Shows queue depth and wait times
	 */
	getQueueStats: protectedProcedure
		.input(z.void())
		.output(queueStatsSchema)
		.query(async () => {
			return await services.hybrid.getQueueStats();
		}),

	/**
	 * Get all bots currently in the global deployment queue
	 */
	getQueuedBots: protectedProcedure
		.input(z.void())
		.output(z.array(queuedBotSchema))
		.query(async () => {
			return await services.hybrid.getQueuedBots();
		}),

	/**
	 * Get cost statistics for infrastructure monitoring
	 * Includes current, historical (24h/7d/30d), and projected monthly costs
	 */
	getCostStats: protectedProcedure
		.input(z.void())
		.output(costStatsSchema)
		.query(async () => {
			const enabledPlatforms = services.hybrid.getEnabledPlatforms();

			// Define time boundaries
			const now = new Date();
			const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

			// Active bot statuses (currently incurring costs)
			const activeStatuses = [
				"DEPLOYING",
				"JOINING_CALL",
				"IN_WAITING_ROOM",
				"IN_CALL",
				"LEAVING",
			];

			// Query active bots by platform
			const activeBotsByPlatform = await db
				.select({
					platform: botsTable.deploymentPlatform,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.where(
					sql`${botsTable.status} IN (${sql.join(
						activeStatuses.map((s) => sql`${s}`),
						sql`, `,
					)})`,
				)
				.groupBy(botsTable.deploymentPlatform);

			// Query historical bot hours by platform and time range
			// For simplicity, estimate 30 minutes average per bot session
			const AVG_SESSION_HOURS = 0.5;

			const historicalBots24h = await db
				.select({
					platform: botsTable.deploymentPlatform,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.where(gte(botsTable.createdAt, last24h))
				.groupBy(botsTable.deploymentPlatform);

			const historicalBots7d = await db
				.select({
					platform: botsTable.deploymentPlatform,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.where(gte(botsTable.createdAt, last7d))
				.groupBy(botsTable.deploymentPlatform);

			const historicalBots30d = await db
				.select({
					platform: botsTable.deploymentPlatform,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.where(gte(botsTable.createdAt, last30d))
				.groupBy(botsTable.deploymentPlatform);

			// Calculate hourly cost per bot per platform
			const getHourlyCost = (platform: string | null): number => {
				switch (platform) {
					case "aws":
						return (
							PRICING.DEFAULT_VCPU * PRICING.AWS_VCPU_PER_HOUR +
							PRICING.DEFAULT_GB * PRICING.AWS_GB_PER_HOUR
						);
					case "k8s":
						return (
							PRICING.DEFAULT_VCPU * PRICING.K8S_VCPU_PER_HOUR +
							PRICING.DEFAULT_GB * PRICING.K8S_GB_PER_HOUR
						);
					case "coolify":
						return PRICING.COOLIFY_PER_HOUR;
					default:
						return 0;
				}
			};

			// Build per-platform stats
			const platformStats: z.infer<typeof platformCostSchema>[] = [];

			for (const platform of enabledPlatforms) {
				const activeCount =
					Number(
						activeBotsByPlatform.find((p) => p.platform === platform)?.count,
					) || 0;

				const count24h =
					Number(
						historicalBots24h.find((p) => p.platform === platform)?.count,
					) || 0;

				const count7d =
					Number(
						historicalBots7d.find((p) => p.platform === platform)?.count,
					) || 0;

				const count30d =
					Number(
						historicalBots30d.find((p) => p.platform === platform)?.count,
					) || 0;

				const hourlyCostPerBot = getHourlyCost(platform);

				// Current hourly cost = active bots * hourly rate
				const currentHourlyCost = activeCount * hourlyCostPerBot;

				// Historical costs = bot count * avg session hours * hourly rate
				const last24hCost = count24h * AVG_SESSION_HOURS * hourlyCostPerBot;
				const last7dCost = count7d * AVG_SESSION_HOURS * hourlyCostPerBot;
				const last30dCost = count30d * AVG_SESSION_HOURS * hourlyCostPerBot;

				// Projected monthly = extrapolate from last 7 days
				// (30/7) * last7dCost ≈ 4.29x
				const projectedMonthlyCost = (30 / 7) * last7dCost;

				platformStats.push({
					platform,
					activeBots: activeCount,
					currentHourlyCost,
					last24hCost,
					last7dCost,
					last30dCost,
					projectedMonthlyCost,
				});
			}

			// Calculate totals
			const totals = platformStats.reduce(
				(acc, p) => ({
					totalActiveBots: acc.totalActiveBots + p.activeBots,
					totalCurrentHourlyCost:
						acc.totalCurrentHourlyCost + p.currentHourlyCost,
					totalLast24hCost: acc.totalLast24hCost + p.last24hCost,
					totalLast7dCost: acc.totalLast7dCost + p.last7dCost,
					totalLast30dCost: acc.totalLast30dCost + p.last30dCost,
					totalProjectedMonthlyCost:
						acc.totalProjectedMonthlyCost + p.projectedMonthlyCost,
				}),
				{
					totalActiveBots: 0,
					totalCurrentHourlyCost: 0,
					totalLast24hCost: 0,
					totalLast7dCost: 0,
					totalLast30dCost: 0,
					totalProjectedMonthlyCost: 0,
				},
			);

			return {
				...totals,
				platforms: platformStats,
			};
		}),
});

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Get platform-specific info for a single platform
 */
async function getPlatformInfo(
	platform: DeploymentPlatform,
): Promise<z.infer<typeof platformInfoSchema>> {
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
						cluster: env.AWS_ECS_CLUSTER ?? "N/A",
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

			return {
				platform: "coolify" as const,
				queueDepth: 0, // Queue is now global, not Coolify-specific
				IDLE: poolStats.IDLE,
				DEPLOYING: poolStats.DEPLOYING,
				HEALTHY: poolStats.HEALTHY,
				ERROR: poolStats.ERROR,
			};
		}
	}
}
