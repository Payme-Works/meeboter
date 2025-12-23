import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
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
		.query(async () => {
			// AWS doesn't have a central task listing - would need ECS API integration
			return [];
		}),
});
