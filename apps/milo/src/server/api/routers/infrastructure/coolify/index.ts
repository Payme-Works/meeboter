import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { poolSlotStatus } from "@/server/database/schema";
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
		.query(async () => {
			const slots = services.pool ? await services.pool.getAllSlots() : [];

			return slots.map((slot) => ({
				id: slot.id,
				slotName: slot.slotName,
				status: slot.status as z.infer<typeof coolifySlotStatusSchema>,
				assignedBotId: slot.assignedBotId,
				applicationUuid: slot.applicationUuid,
				createdAt: slot.createdAt,
			}));
		}),
});
