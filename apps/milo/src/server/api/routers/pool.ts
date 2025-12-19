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
 * Result schema for delete operation
 */
const deleteResultSchema = z.object({
	deletedIds: z.array(z.number()),
	failedIds: z.array(
		z.object({
			id: z.number(),
			error: z.string(),
		}),
	),
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

	/**
	 * Delete pool slots by IDs
	 *
	 * Deletes both the Coolify application and the database record.
	 * For busy/deploying slots, stops the container first.
	 */
	delete: protectedProcedure
		.input(z.object({ ids: z.array(z.number()).min(1) }))
		.output(deleteResultSchema)
		.mutation(async ({ ctx, input }) => {
			if (!services.coolify) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"Slot deletion is only available when using Coolify platform",
				});
			}

			const deletedIds: number[] = [];
			const failedIds: { id: number; error: string }[] = [];

			// Fetch all slots to delete
			const slotsToDelete = await ctx.db
				.select({
					id: botPoolSlotsTable.id,
					slotName: botPoolSlotsTable.slotName,
					coolifyServiceUuid: botPoolSlotsTable.coolifyServiceUuid,
					status: botPoolSlotsTable.status,
				})
				.from(botPoolSlotsTable)
				.where(inArray(botPoolSlotsTable.id, input.ids));

			// Process each slot
			for (const slot of slotsToDelete) {
				try {
					console.log(
						`[Pool] Deleting slot ${slot.slotName} (id=${slot.id}, uuid=${slot.coolifyServiceUuid})`,
					);

					// Stop the container first if it's running
					if (slot.status === "busy" || slot.status === "deploying") {
						console.log(`[Pool] Stopping container for slot ${slot.slotName}`);
						await services.coolify.stopApplication(slot.coolifyServiceUuid);
					}

					// Delete from Coolify (idempotent: 404 = success)
					await services.coolify.deleteApplication(slot.coolifyServiceUuid);

					// Delete from database
					await ctx.db
						.delete(botPoolSlotsTable)
						.where(eq(botPoolSlotsTable.id, slot.id));

					console.log(`[Pool] Successfully deleted slot ${slot.slotName}`);
					deletedIds.push(slot.id);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : "Unknown error";

					console.error(
						`[Pool] Failed to delete slot ${slot.slotName}:`,
						error,
					);

					failedIds.push({ id: slot.id, error: errorMessage });
				}
			}

			// Check for IDs that weren't found
			const foundIds = new Set(slotsToDelete.map((s) => s.id));

			for (const id of input.ids) {
				if (!foundIds.has(id) && !deletedIds.includes(id)) {
					failedIds.push({ id, error: "Slot not found" });
				}
			}

			return { deletedIds, failedIds };
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
