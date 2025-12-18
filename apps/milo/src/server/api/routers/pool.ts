import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	botPoolQueueTable,
	botPoolSlotsTable,
	botsTable,
	poolSlotStatus,
} from "@/server/database/schema";
import { services } from "../services";

/**
 * Output schema for pool slot view
 */
const poolSlotViewSchema = z.object({
	id: z.number(),
	slotName: z.string(),
	status: poolSlotStatus,
	assignedBotId: z.number().nullable(),
	coolifyServiceUuid: z.string(),
	lastUsedAt: z.date().nullable(),
	errorMessage: z.string().nullable(),
	recoveryAttempts: z.number(),
	createdAt: z.date(),
});

/**
 * Output schema for queue entry view
 */
const queueEntryViewSchema = z.object({
	id: z.number(),
	botId: z.number(),
	priority: z.number(),
	queuedAt: z.date(),
	timeoutAt: z.date(),
});

/**
 * Statistics sub-router for pool and queue metrics
 */
const statisticsRouter = createTRPCRouter({
	/**
	 * Get pool statistics (slot counts by status)
	 */
	getPool: protectedProcedure
		.input(z.void())
		.output(
			z.object({
				total: z.number(),
				idle: z.number(),
				deploying: z.number(),
				busy: z.number(),
				error: z.number(),
				maxSize: z.number(),
			}),
		)
		.query(async () => {
			if (!services.pool) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"Pool statistics are only available when using Coolify platform",
				});
			}

			return await services.pool.getPoolStats();
		}),

	/**
	 * Get queue statistics (length, wait times)
	 */
	getQueue: protectedProcedure
		.input(z.void())
		.output(
			z.object({
				length: z.number(),
				oldestQueuedAt: z.date().nullable(),
				avgWaitMs: z.number(),
			}),
		)
		.query(async () => {
			if (!services.pool) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"Queue statistics are only available when using Coolify platform",
				});
			}

			return await services.pool.getQueueStats();
		}),
});

/**
 * Slots sub-router for slot listing and details
 */
const slotsRouter = createTRPCRouter({
	/**
	 * List all pool slots with optional status filtering
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					status: z.array(poolSlotStatus).optional(),
				})
				.optional(),
		)
		.output(z.array(poolSlotViewSchema))
		.query(async ({ ctx, input }) => {
			const statusFilter = input?.status;

			let query = ctx.db
				.select({
					id: botPoolSlotsTable.id,
					slotName: botPoolSlotsTable.slotName,
					status: botPoolSlotsTable.status,
					assignedBotId: botPoolSlotsTable.assignedBotId,
					coolifyServiceUuid: botPoolSlotsTable.coolifyServiceUuid,
					lastUsedAt: botPoolSlotsTable.lastUsedAt,
					errorMessage: botPoolSlotsTable.errorMessage,
					recoveryAttempts: botPoolSlotsTable.recoveryAttempts,
					createdAt: botPoolSlotsTable.createdAt,
				})
				.from(botPoolSlotsTable)
				.$dynamic();

			if (statusFilter && statusFilter.length > 0) {
				query = query.where(inArray(botPoolSlotsTable.status, statusFilter));
			}

			const slots = await query.orderBy(botPoolSlotsTable.slotName);

			return slots;
		}),
});

/**
 * Queue sub-router for queue listing
 */
const queueRouter = createTRPCRouter({
	/**
	 * List all queue entries with bot information
	 */
	list: protectedProcedure
		.input(z.void())
		.output(
			z.array(
				queueEntryViewSchema.extend({
					bot: z
						.object({
							botDisplayName: z.string(),
							meetingTitle: z.string(),
							status: z.string(),
						})
						.nullable(),
				}),
			),
		)
		.query(async ({ ctx }) => {
			const queueEntries = await ctx.db
				.select({
					id: botPoolQueueTable.id,
					botId: botPoolQueueTable.botId,
					priority: botPoolQueueTable.priority,
					queuedAt: botPoolQueueTable.queuedAt,
					timeoutAt: botPoolQueueTable.timeoutAt,
				})
				.from(botPoolQueueTable)
				.orderBy(botPoolQueueTable.priority, botPoolQueueTable.queuedAt);

			// Fetch bot details for each queue entry
			const entriesWithBots = await Promise.all(
				queueEntries.map(async (entry) => {
					const botResult = await ctx.db
						.select({
							botDisplayName: botsTable.botDisplayName,
							meetingTitle: botsTable.meetingTitle,
							status: botsTable.status,
						})
						.from(botsTable)
						.where(eq(botsTable.id, entry.botId))
						.limit(1);

					return {
						...entry,
						bot: botResult[0] ?? null,
					};
				}),
			);

			return entriesWithBots;
		}),
});

/**
 * Main pool router with nested sub-routers
 *
 * Structure:
 * - pool.statistics.getPool
 * - pool.statistics.getQueue
 * - pool.slots.list
 * - pool.queue.list
 */
export const poolRouter = createTRPCRouter({
	statistics: statisticsRouter,
	slots: slotsRouter,
	queue: queueRouter,
});
