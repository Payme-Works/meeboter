import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@/server/database/db";
import {
	botPoolSlotsTable,
	botsTable,
	poolSlotStatus,
} from "@/server/database/schema";
import { services } from "../../../services";
import { poolRouter } from "./pool";

/**
 * Coolify slot status (UPPERCASE per PLATFORM_NOMENCLATURE.md)
 */
const coolifySlotStatusSchema = poolSlotStatus;

/**
 * Coolify stats response - counts per status
 */
const coolifyStatsSchema = z.object({
	IDLE: z.number(),
	DEPLOYING: z.number(),
	HEALTHY: z.number(),
	ERROR: z.number(),
});

/**
 * Coolify slot item for table display
 */
const coolifySlotSchema = z.object({
	id: z.number(),
	slotName: z.string(),
	status: coolifySlotStatusSchema,
	assignedBotId: z.number().nullable(),
	botName: z.string().nullable(),
	applicationUuid: z.string(),
	createdAt: z.date(),
});

/**
 * Coolify platform sub-router with pool sub-router
 *
 * Structure:
 * - infrastructure.coolify.getStats() → slot statistics
 * - infrastructure.coolify.getSlots() → slot list
 * - infrastructure.coolify.pool.getSlot() → get bot config for pool slot
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const coolifyRouter = createTRPCRouter({
	pool: poolRouter,

	/**
	 * Get Coolify slot statistics
	 */
	getStats: protectedProcedure
		.input(z.void())
		.output(coolifyStatsSchema)
		.query(async () => {
			const poolStats = services.pool
				? await services.pool.getPoolStats()
				: { total: 0, IDLE: 0, DEPLOYING: 0, HEALTHY: 0, ERROR: 0, maxSize: 0 };

			return {
				IDLE: poolStats.IDLE,
				DEPLOYING: poolStats.DEPLOYING,
				HEALTHY: poolStats.HEALTHY,
				ERROR: poolStats.ERROR,
			};
		}),

	/**
	 * Get list of Coolify slots with optional filtering
	 */
	getSlots: protectedProcedure
		.input(
			z.object({
				status: z.array(coolifySlotStatusSchema).optional(),
				sort: z.string().default("age.desc"),
			}),
		)
		.output(z.array(coolifySlotSchema))
		.query(async ({ input }) => {
			// Build query with left join to get bot display name
			let query = db
				.select({
					id: botPoolSlotsTable.id,
					slotName: botPoolSlotsTable.slotName,
					status: botPoolSlotsTable.status,
					assignedBotId: botPoolSlotsTable.assignedBotId,
					botName: botsTable.displayName,
					applicationUuid: botPoolSlotsTable.applicationUuid,
					createdAt: botPoolSlotsTable.createdAt,
				})
				.from(botPoolSlotsTable)
				.leftJoin(botsTable, eq(botPoolSlotsTable.assignedBotId, botsTable.id))
				.$dynamic();

			// Apply status filter if provided
			if (input.status && input.status.length > 0) {
				query = query.where(inArray(botPoolSlotsTable.status, input.status));
			}

			// Apply sorting (default: newest first)
			query = query.orderBy(desc(botPoolSlotsTable.createdAt));

			const slots = await query;

			return slots.map((slot) => ({
				id: slot.id,
				slotName: slot.slotName,
				status: slot.status as z.infer<typeof coolifySlotStatusSchema>,
				assignedBotId: slot.assignedBotId,
				botName: slot.botName,
				applicationUuid: slot.applicationUuid,
				createdAt: slot.createdAt,
			}));
		}),
});
