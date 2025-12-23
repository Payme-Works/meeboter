import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
	botConfigSchema,
	botPoolSlotsTable,
	botsTable,
} from "@/server/database/schema";

/**
 * Pool sub-router for Coolify pool slot operations
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const poolRouter = createTRPCRouter({
	/**
	 * Retrieves bot configuration for a pool slot (called by bot containers on startup).
	 * Uses POOL_SLOT_UUID env var to identify which slot is requesting its config.
	 * @param input - Object containing the pool slot UUID
	 * @param input.poolSlotUuid - The Coolify service UUID for the pool slot
	 * @returns Promise<BotConfig> The bot configuration for the assigned bot
	 * @throws Error if pool slot not found, no bot assigned, or bot not found
	 */
	getSlot: publicProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/infrastructure/coolify/pool/{poolSlotUuid}",
				description:
					"Get bot configuration for a pool slot (called by bot containers)",
			},
		})
		.input(
			z.object({
				poolSlotUuid: z.string(),
			}),
		)
		.output(botConfigSchema)
		.query(async ({ input, ctx }): Promise<typeof botConfigSchema._output> => {
			// Terminal states (bots in these states should NOT be restarted)
			const terminalStatuses = ["DONE", "FATAL"] as const;

			// Primary lookup: check the slot's assignedBotId (authoritative source)
			const slotResult = await ctx.db
				.select({
					assignedBotId: botPoolSlotsTable.assignedBotId,
				})
				.from(botPoolSlotsTable)
				.where(eq(botPoolSlotsTable.applicationUuid, input.poolSlotUuid))
				.limit(1);

			if (slotResult[0]?.assignedBotId) {
				// Slot has an assigned bot, use that
				const botResult = await ctx.db
					.select()
					.from(botsTable)
					.where(eq(botsTable.id, slotResult[0].assignedBotId))
					.limit(1);

				if (!botResult[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Bot not found: ${slotResult[0].assignedBotId}`,
					});
				}

				const bot = botResult[0];

				// Prevent restarting bots that have already finished
				if (
					terminalStatuses.includes(
						bot.status as (typeof terminalStatuses)[number],
					)
				) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: `Bot ${bot.id} has already finished (status: ${bot.status}). Container should exit.`,
					});
				}

				return {
					id: bot.id,
					userId: bot.userId,
					meeting: bot.meeting,
					startTime: bot.startTime,
					endTime: bot.endTime,
					displayName: bot.displayName,
					imageUrl: bot.imageUrl ?? undefined,
					recordingEnabled: bot.recordingEnabled,
					automaticLeave: bot.automaticLeave,
					callbackUrl: bot.callbackUrl ?? undefined,
				};
			}

			// No bot assigned to this slot
			if (!slotResult[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Pool slot not found: ${input.poolSlotUuid}`,
				});
			}

			throw new TRPCError({
				code: "NOT_FOUND",
				message: `No bot assigned to pool slot: ${input.poolSlotUuid}`,
			});
		}),
});
