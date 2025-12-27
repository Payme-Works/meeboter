import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import { botsTable } from "@/server/database/schema";
import { services } from "../../services";

/**
 * AWS task status (UPPERCASE per PLATFORM_NOMENCLATURE.md)
 */
const awsTaskStatusSchema = z.enum([
	"PROVISIONING",
	"RUNNING",
	"STOPPED",
	"FAILED",
]);

/**
 * AWS stats response - counts per status
 */
const awsStatsSchema = z.object({
	PROVISIONING: z.number(),
	RUNNING: z.number(),
	STOPPED: z.number(),
	FAILED: z.number(),
});

/**
 * AWS task item for table display
 */
const awsTaskSchema = z.object({
	id: z.number(),
	taskArn: z.string(),
	status: awsTaskStatusSchema,
	botId: z.number(),
	botName: z.string().nullable(),
	cluster: z.string(),
	createdAt: z.date(),
});

/**
 * AWS platform sub-router
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const awsRouter = createTRPCRouter({
	/**
	 * Get AWS ECS task statistics
	 */
	getStats: protectedProcedure
		.input(z.void())
		.output(awsStatsSchema)
		.query(async () => {
			const metrics = services.aws
				? await services.aws.getClusterMetrics()
				: {
						cluster: "N/A",
						region: "N/A",
						PROVISIONING: 0,
						RUNNING: 0,
						STOPPED: 0,
						FAILED: 0,
						total: 0,
					};

			return {
				PROVISIONING: metrics.PROVISIONING,
				RUNNING: metrics.RUNNING,
				STOPPED: metrics.STOPPED,
				FAILED: metrics.FAILED,
			};
		}),

	/**
	 * Get list of AWS ECS tasks with optional filtering
	 */
	getTasks: protectedProcedure
		.input(
			z.object({
				status: z.array(awsTaskStatusSchema).optional(),
				sort: z.string().default("age.desc"),
			}),
		)
		.output(z.array(awsTaskSchema))
		.query(async ({ input }) => {
			if (!services.aws) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message: "AWS operations are only available when using AWS platform",
				});
			}

			const tasks = await services.aws.listTasks({
				status: input.status,
				sort: input.sort,
			});

			// Get task ARNs to look up bot information
			const taskArns = tasks.map((t) => t.taskArn);

			// Look up bots from database by platformIdentifier (task ARN)
			const bots =
				taskArns.length > 0
					? await db
							.select({
								id: botsTable.id,
								displayName: botsTable.displayName,
								platformIdentifier: botsTable.platformIdentifier,
							})
							.from(botsTable)
							.where(
								and(
									inArray(botsTable.platformIdentifier, taskArns),
									eq(botsTable.deploymentPlatform, "aws"),
								),
							)
					: [];

			// Create map for quick lookup: taskArn -> bot info
			const botByTaskArn = new Map(
				bots.map((bot) => [
					bot.platformIdentifier,
					{ id: bot.id, displayName: bot.displayName },
				]),
			);

			// Merge task data with bot information
			return tasks.map((task, index) => {
				const bot = botByTaskArn.get(task.taskArn);

				return {
					id: bot?.id ?? index + 1,
					taskArn: task.taskArn,
					status: task.status,
					botId: bot?.id ?? 0,
					botName: bot?.displayName ?? null,
					cluster: task.cluster,
					createdAt: task.createdAt,
				};
			});
		}),
});
