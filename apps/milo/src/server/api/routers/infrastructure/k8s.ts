import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import { botsTable } from "@/server/database/schema";
import { services } from "../../services";

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
	 * Deletes a K8s Job.
	 * @param input - Object containing the job name
	 * @param input.jobName - The K8s Job name to delete
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

			await services.k8s.stopBot(input.jobName);

			return { success: true };
		}),

	/**
	 * Deletes multiple K8s Jobs.
	 * @param input - Object containing array of job names
	 * @param input.jobNames - Array of K8s Job names to delete
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

			let succeeded = 0;
			let failed = 0;

			await Promise.all(
				input.jobNames.map(async (jobName) => {
					try {
						await services.k8s?.stopBot(jobName);
						succeeded++;
					} catch {
						failed++;
					}
				}),
			);

			return { succeeded, failed };
		}),
});
