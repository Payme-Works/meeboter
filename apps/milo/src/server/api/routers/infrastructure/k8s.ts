import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import { botsTable } from "@/server/database/schema";
import { services } from "../../services";

/**
 * Bot statuses that require graceful shutdown (bot is actively in/joining meeting)
 */
const ACTIVE_BOT_STATUSES = [
	"IN_CALL",
	"IN_WAITING_ROOM",
	"JOINING_CALL",
] as const;

/**
 * K8s job status (UPPERCASE per PLATFORM_NOMENCLATURE.md)
 */
const k8sJobStatusSchema = z.enum(["PENDING", "ACTIVE", "SUCCEEDED", "FAILED"]);

/**
 * K8s stats response - counts per status
 */
const k8sStatsSchema = z.object({
	PENDING: z.number(),
	ACTIVE: z.number(),
	SUCCEEDED: z.number(),
	FAILED: z.number(),
});

/**
 * K8s job item for table display
 */
const k8sJobSchema = z.object({
	id: z.number(),
	jobName: z.string(),
	status: k8sJobStatusSchema,
	botId: z.number(),
	botName: z.string().nullable(),
	namespace: z.string(),
	createdAt: z.date(),
});

/**
 * K8s platform sub-router
 * Merged from infrastructure and bots k8s routers
 *
 * Structure:
 * - infrastructure.k8s.getStats() → job statistics
 * - infrastructure.k8s.getJobs() → job list
 * - infrastructure.k8s.getJob() → single job details with pods and events
 * - infrastructure.k8s.getMetrics() → cluster metrics
 * - infrastructure.k8s.getEvents() → job events
 * - infrastructure.k8s.getLogs() → pod logs
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const k8sRouter = createTRPCRouter({
	/**
	 * Get K8s job statistics
	 */
	getStats: protectedProcedure
		.input(z.void())
		.output(k8sStatsSchema)
		.query(async () => {
			const metrics = services.k8s
				? await services.k8s.getClusterMetrics()
				: {
						PENDING: 0,
						ACTIVE: 0,
						SUCCEEDED: 0,
						FAILED: 0,
						total: 0,
						namespace: "N/A",
					};

			return {
				PENDING: metrics.PENDING,
				ACTIVE: metrics.ACTIVE,
				SUCCEEDED: metrics.SUCCEEDED,
				FAILED: metrics.FAILED,
			};
		}),

	/**
	 * Get list of K8s jobs with optional filtering
	 */
	getJobs: protectedProcedure
		.input(
			z.object({
				status: z.array(k8sJobStatusSchema).optional(),
				sort: z.string().default("age.desc"),
			}),
		)
		.output(z.array(k8sJobSchema))
		.query(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			const jobs = await services.k8s.listJobs({
				status: input.status,
				sort: input.sort,
			});

			// Get unique bot IDs to look up names
			const botIds = Array.from(
				new Set(jobs.map((j) => j.botId).filter((id) => id > 0)),
			);

			// Look up bot names from database
			const botNames =
				botIds.length > 0
					? await db
							.select({ id: botsTable.id, displayName: botsTable.displayName })
							.from(botsTable)
							.where(inArray(botsTable.id, botIds))
					: [];

			const botNameMap = new Map(botNames.map((b) => [b.id, b.displayName]));

			// Merge bot names into jobs
			return jobs.map((job) => ({
				...job,
				botName: botNameMap.get(job.botId) ?? null,
			}));
		}),

	/**
	 * Gets detailed information about a K8s Job including pods and events.
	 * @param input - Object containing the job name (platformIdentifier)
	 * @param input.jobName - The K8s Job name for the bot
	 * @returns Job details including pods and events
	 */
	getJob: protectedProcedure
		.input(
			z.object({
				jobName: z.string(),
			}),
		)
		.output(
			z
				.object({
					job: z.record(z.string(), z.unknown()),
					pods: z.array(z.record(z.string(), z.unknown())),
					events: z.array(z.record(z.string(), z.unknown())),
				})
				.nullable(),
		)
		.query(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			const result = await services.k8s.getJob(input.jobName);

			if (!result) {
				return null;
			}

			return result;
		}),

	/**
	 * Gets cluster-wide metrics for capacity monitoring.
	 * @returns Cluster metrics including active jobs, pending jobs, and total pods
	 */
	getMetrics: protectedProcedure
		.input(z.void())
		.output(
			z.object({
				namespace: z.string(),
				PENDING: z.number(),
				ACTIVE: z.number(),
				SUCCEEDED: z.number(),
				FAILED: z.number(),
				total: z.number(),
			}),
		)
		.query(async () => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			return await services.k8s.getClusterMetrics();
		}),

	/**
	 * Gets events for a K8s Job.
	 * @param input - Object containing the job name
	 * @param input.jobName - The K8s Job name
	 * @returns Array of K8s events
	 */
	getEvents: protectedProcedure
		.input(
			z.object({
				jobName: z.string(),
			}),
		)
		.output(z.array(z.record(z.string(), z.unknown())))
		.query(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			return services.k8s.getJobEvents(input.jobName);
		}),

	/**
	 * Gets logs from the bot container in a K8s Job.
	 * @param input - Object containing the job name
	 * @param input.jobName - The K8s Job name
	 * @returns Log output as a string
	 */
	getLogs: protectedProcedure
		.input(
			z.object({
				jobName: z.string(),
			}),
		)
		.output(
			z.object({
				logs: z.string(),
			}),
		)
		.query(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			const logs = await services.k8s.getPodLogs(input.jobName);

			return { logs };
		}),

	/**
	 * Gets real-time CPU and memory usage for a pod.
	 * Requires metrics-server to be installed on the K8s cluster.
	 * @param input - Object containing the job name
	 * @param input.jobName - The K8s Job name
	 * @returns Pod metrics including CPU and memory usage, or null if unavailable
	 */
	getPodMetrics: protectedProcedure
		.input(
			z.object({
				jobName: z.string(),
			}),
		)
		.output(
			z
				.object({
					podName: z.string(),
					containers: z.array(
						z.object({
							name: z.string(),
							usage: z.object({
								cpu: z.string(),
								memory: z.string(),
							}),
						}),
					),
					timestamp: z.string(),
				})
				.nullable(),
		)
		.query(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			return await services.k8s.getPodMetrics(input.jobName);
		}),

	/**
	 * Gracefully stops a K8s Job.
	 *
	 * If a bot is associated with the job and is in an active state (IN_CALL,
	 * IN_WAITING_ROOM, JOINING_CALL), sets the bot status to LEAVING to trigger
	 * graceful shutdown via heartbeat. The bot will exit cleanly and the job
	 * will complete naturally.
	 *
	 * If no bot is found or the bot is not in an active state, deletes the
	 * K8s job directly.
	 *
	 * @param input - Object containing the job name
	 * @param input.jobName - The K8s Job name to stop
	 */
	deleteJob: protectedProcedure
		.input(
			z.object({
				jobName: z.string(),
			}),
		)
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			// Look up bot by platformIdentifier (job name)
			const bot = await db
				.select({ id: botsTable.id, status: botsTable.status })
				.from(botsTable)
				.where(
					and(
						eq(botsTable.platformIdentifier, input.jobName),
						eq(botsTable.deploymentPlatform, "k8s"),
					),
				)
				.limit(1)
				.then((rows) => rows[0]);

			// If bot found with active status, trigger graceful shutdown
			if (
				bot &&
				ACTIVE_BOT_STATUSES.includes(
					bot.status as (typeof ACTIVE_BOT_STATUSES)[number],
				)
			) {
				await db
					.update(botsTable)
					.set({ status: "LEAVING" })
					.where(eq(botsTable.id, bot.id));

				// Fire and forget - bot will exit gracefully via heartbeat
				return { success: true };
			}

			// No bot or not active - delete job directly
			await services.k8s.stopBot(input.jobName);

			return { success: true };
		}),

	/**
	 * Gracefully stops multiple K8s Jobs.
	 *
	 * For each job, if a bot is associated and is in an active state,
	 * sets the bot status to LEAVING to trigger graceful shutdown.
	 * Jobs without bots or with inactive bots are deleted directly.
	 *
	 * @param input - Object containing array of job names
	 * @param input.jobNames - Array of K8s Job names to stop
	 */
	deleteJobs: protectedProcedure
		.input(
			z.object({
				jobNames: z.array(z.string()),
			}),
		)
		.output(
			z.object({
				succeeded: z.number(),
				failed: z.number(),
			}),
		)
		.mutation(async ({ input }) => {
			if (!services.k8s) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"K8s operations are only available when using Kubernetes platform",
				});
			}

			// Look up all bots by platformIdentifier in a single query
			const bots = await db
				.select({
					id: botsTable.id,
					status: botsTable.status,
					platformIdentifier: botsTable.platformIdentifier,
				})
				.from(botsTable)
				.where(
					and(
						inArray(botsTable.platformIdentifier, input.jobNames),
						eq(botsTable.deploymentPlatform, "k8s"),
					),
				);

			// Create a map for quick lookup
			const botByJobName = new Map(
				bots.map((bot) => [bot.platformIdentifier, bot]),
			);

			let succeeded = 0;
			let failed = 0;

			await Promise.all(
				input.jobNames.map(async (jobName) => {
					try {
						const bot = botByJobName.get(jobName);

						// If bot found with active status, trigger graceful shutdown
						if (
							bot &&
							ACTIVE_BOT_STATUSES.includes(
								bot.status as (typeof ACTIVE_BOT_STATUSES)[number],
							)
						) {
							await db
								.update(botsTable)
								.set({ status: "LEAVING" })
								.where(eq(botsTable.id, bot.id));
						} else {
							// No bot or not active - delete job directly
							await services.k8s?.stopBot(jobName);
						}

						succeeded++;
					} catch {
						failed++;
					}
				}),
			);

			return { succeeded, failed };
		}),
});
