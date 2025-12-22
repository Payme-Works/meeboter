import { TRPCError } from "@trpc/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	buildPaginatedResponse,
	type PaginatedResponse,
	paginatedResponseSchema,
	paginationInput,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	botPoolQueueTable,
	botPoolSlotsTable,
	botsTable,
	poolSlotStatus,
} from "@/server/database/schema";
import {
	type PoolSlotSyncResult,
	PoolSlotSyncWorker,
} from "@/server/workers/pool-slot-sync-worker";
import { services } from "../services";

/**
 * Output schema for pool slot view
 */
const poolSlotViewSchema = z.object({
	id: z.number(),
	slotName: z.string(),
	status: poolSlotStatus,
	assignedBotId: z.number().nullable(),
	applicationUuid: z.string(),
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
	 * Get individual slot statuses for visualization.
	 * Returns an array of statuses ordered by slot name for consistent display.
	 */
	getSlotStatuses: protectedProcedure
		.input(z.void())
		.output(
			z.object({
				statuses: z.array(poolSlotStatus),
				maxSize: z.number(),
			}),
		)
		.query(async ({ ctx }) => {
			if (!services.pool) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message:
						"Pool statistics are only available when using Coolify platform",
				});
			}

			const slots = await ctx.db
				.select({ status: botPoolSlotsTable.status })
				.from(botPoolSlotsTable)
				.orderBy(botPoolSlotsTable.slotName);

			return {
				statuses: slots.map((s) => s.status),
				maxSize: 100, // Pool max size
			};
		}),

	/**
	 * Get bot status counts for dashboard visualization.
	 * Returns counts of bots by their current status.
	 */
	getBotStatusCounts: protectedProcedure
		.input(z.void())
		.output(
			z.object({
				deploying: z.number(),
				joiningCall: z.number(),
				inWaitingRoom: z.number(),
				inCall: z.number(),
				leaving: z.number(),
				total: z.number(),
			}),
		)
		.query(async ({ ctx }) => {
			const result = await ctx.db
				.select({
					status: botsTable.status,
					count: sql<number>`count(*)`,
				})
				.from(botsTable)
				.groupBy(botsTable.status);

			const counts = {
				deploying: 0,
				joiningCall: 0,
				inWaitingRoom: 0,
				inCall: 0,
				leaving: 0,
				total: 0,
			};

			for (const row of result) {
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
					case "LEAVING":
						counts.leaving = count;

						break;
				}
			}

			// Only count bots actively in meeting lifecycle (not deploying/leaving)
			counts.total = counts.joiningCall + counts.inWaitingRoom + counts.inCall;

			return counts;
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
	 * List all pool slots with optional status filtering and pagination
	 */
	list: protectedProcedure
		.input(
			paginationInput.extend({
				status: z.array(poolSlotStatus).optional(),
			}),
		)
		.output(paginatedResponseSchema(poolSlotViewSchema))
		.query(
			async ({
				ctx,
				input,
			}): Promise<PaginatedResponse<typeof poolSlotViewSchema._output>> => {
				const { page, pageSize, status: statusFilter } = input;
				const offset = (page - 1) * pageSize;

				// Build the where condition
				const whereCondition =
					statusFilter && statusFilter.length > 0
						? inArray(botPoolSlotsTable.status, statusFilter)
						: undefined;

				const [data, countResult] = await Promise.all([
					ctx.db
						.select({
							id: botPoolSlotsTable.id,
							slotName: botPoolSlotsTable.slotName,
							status: botPoolSlotsTable.status,
							assignedBotId: botPoolSlotsTable.assignedBotId,
							applicationUuid: botPoolSlotsTable.applicationUuid,
							lastUsedAt: botPoolSlotsTable.lastUsedAt,
							errorMessage: botPoolSlotsTable.errorMessage,
							recoveryAttempts: botPoolSlotsTable.recoveryAttempts,
							createdAt: botPoolSlotsTable.createdAt,
						})
						.from(botPoolSlotsTable)
						.where(whereCondition)
						.orderBy(botPoolSlotsTable.slotName)
						.limit(pageSize)
						.offset(offset),
					ctx.db
						.select({ count: sql<number>`count(*)` })
						.from(botPoolSlotsTable)
						.where(whereCondition),
				]);

				const total = Number(countResult[0]?.count ?? 0);

				return buildPaginatedResponse(data, total, page, pageSize, (item) =>
					String(item.id),
				);
			},
		),

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
					applicationUuid: botPoolSlotsTable.applicationUuid,
					status: botPoolSlotsTable.status,
					assignedBotId: botPoolSlotsTable.assignedBotId,
				})
				.from(botPoolSlotsTable)
				.where(inArray(botPoolSlotsTable.id, input.ids));

			// Process each slot
			for (const slot of slotsToDelete) {
				try {
					console.log(
						`[Pool] Deleting slot ${slot.slotName} (id=${slot.id}, uuid=${slot.applicationUuid})`,
					);

					// Stop the container first if it's running
					if (slot.status === "busy" || slot.status === "deploying") {
						console.log(`[Pool] Stopping container for slot ${slot.slotName}`);
						await services.coolify.stopApplication(slot.applicationUuid);
					}

					// Mark assigned bot as DONE if there is one
					if (slot.assignedBotId) {
						console.log(
							`[Pool] Marking bot ${slot.assignedBotId} as DONE (slot deleted)`,
						);

						await ctx.db
							.update(botsTable)
							.set({ status: "DONE" })
							.where(eq(botsTable.id, slot.assignedBotId));
					}

					// Delete from Coolify (idempotent: 404 = success)
					await services.coolify.deleteApplication(slot.applicationUuid);

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
							displayName: z.string(),
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
							displayName: botsTable.displayName,
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
 * Output schema for sync result
 */
const syncResultSchema = z.object({
	coolifyOrphansDeleted: z.number(),
	databaseOrphansDeleted: z.number(),
	totalCoolifyApps: z.number(),
	totalDatabaseSlots: z.number(),
});

/**
 * Main pool router with nested sub-routers
 *
 * Structure:
 * - pool.statistics.getPool
 * - pool.statistics.getQueue
 * - pool.slots.list
 * - pool.slots.delete
 * - pool.queue.list
 * - pool.sync
 */
export const poolRouter = createTRPCRouter({
	statistics: statisticsRouter,
	slots: slotsRouter,
	queue: queueRouter,

	/**
	 * Manually trigger pool slot synchronization.
	 *
	 * Compares Coolify applications with database pool slots and removes orphans:
	 * - Coolify apps not in database are deleted from Coolify
	 * - Database slots not in Coolify are deleted from database
	 */
	sync: protectedProcedure
		.input(z.void())
		.output(syncResultSchema)
		.mutation(async ({ ctx }): Promise<PoolSlotSyncResult> => {
			if (!services.coolify) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message: "Pool sync is only available when using Coolify platform",
				});
			}

			// Create a worker instance for manual execution (no interval)
			const syncWorker = new PoolSlotSyncWorker(ctx.db, services, {
				intervalMs: 0,
				runOnStart: false,
			});

			return await syncWorker.executeNow();
		}),
});
