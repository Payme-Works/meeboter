import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { logArchivalService } from "@/server/api/services/log-archival-service";
import { logBufferService } from "@/server/api/services/log-buffer-service";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { botsTable, logEntrySchema } from "@/server/database/schema";

/**
 * Logs sub-router for bot log streaming operations
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const logsSubRouter = createTRPCRouter({
	/**
	 * Streams log entries from bot to backend.
	 * Stores in buffer for real-time access and queues for S3 archival.
	 * @param input - Object containing bot ID and log entries
	 * @returns Promise<{received: number}> Count of entries received
	 */
	stream: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{botId}/logs/stream",
				description: "Stream log entries from bot to backend",
			},
		})
		.input(
			z.object({
				botId: z.string().transform((val) => Number(val)),
				entries: z.array(logEntrySchema),
			}),
		)
		.output(
			z.object({
				received: z.number(),
			}),
		)
		.mutation(async ({ input }): Promise<{ received: number }> => {
			if (input.entries.length === 0) {
				return { received: 0 };
			}

			// Add to in-memory buffer for real-time access
			logBufferService.append(input.botId, input.entries);

			// Queue for S3 archival
			logArchivalService.queueForArchival(input.botId, input.entries);

			return { received: input.entries.length };
		}),

	/**
	 * Gets live logs from in-memory buffer.
	 * Used by frontend for polling-based real-time updates.
	 * @param input - Object containing bot ID and optional cursor
	 * @returns Recent log entries from buffer
	 */
	getLive: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/{botId}/logs/live",
				description: "Get live logs from buffer",
			},
		})
		.input(
			z.object({
				botId: z.string().transform((val) => Number(val)),
				afterId: z.string().optional(),
				limit: z.number().min(1).max(500).default(100),
			}),
		)
		.output(
			z.object({
				entries: z.array(logEntrySchema),
				hasMore: z.boolean(),
				bufferSize: z.number(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Verify user owns this bot
			const bot = await ctx.db
				.select({ userId: botsTable.userId })
				.from(botsTable)
				.where(eq(botsTable.id, input.botId))
				.limit(1);

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Bot not found",
				});
			}

			const buffer = logBufferService.getBuffer(input.botId);

			// If afterId is provided, find entries after that ID
			let entries = buffer;

			if (input.afterId) {
				const afterIndex = buffer.findIndex((e) => e.id === input.afterId);

				if (afterIndex !== -1) {
					entries = buffer.slice(afterIndex + 1);
				}
			}

			// Apply limit
			const limited = entries.slice(0, input.limit);
			const hasMore = entries.length > input.limit;

			return {
				entries: limited,
				hasMore,
				bufferSize: logBufferService.getBufferSize(input.botId),
			};
		}),

	/**
	 * Gets historical logs from S3.
	 * Used for viewing logs after bot has finished or for older logs.
	 * @param input - Object containing bot ID and pagination cursor
	 * @returns Historical log entries from S3
	 */
	getHistorical: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/{botId}/logs/historical",
				description: "Get historical logs from S3",
			},
		})
		.input(
			z.object({
				botId: z.string().transform((val) => Number(val)),
				cursor: z.string().optional(),
				limit: z.number().min(1).max(500).default(100),
			}),
		)
		.output(
			z.object({
				entries: z.array(logEntrySchema),
				nextCursor: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Verify user owns this bot
			const bot = await ctx.db
				.select({ userId: botsTable.userId })
				.from(botsTable)
				.where(eq(botsTable.id, input.botId))
				.limit(1);

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Bot not found",
				});
			}

			const result = await logArchivalService.getHistoricalLogs(input.botId, {
				cursor: input.cursor,
				limit: input.limit,
			});

			return {
				entries: result.entries,
				nextCursor: result.nextCursor,
			};
		}),

	/**
	 * Forces flush of pending logs to S3 for a bot.
	 * Called when bot exits to ensure all logs are archived.
	 * @param input - Object containing bot ID
	 * @returns Success status
	 */
	flush: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{botId}/logs/flush",
				description: "Flush pending logs to S3",
			},
		})
		.input(
			z.object({
				botId: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
			}),
		)
		.mutation(async ({ input }): Promise<{ success: boolean }> => {
			await logArchivalService.flushBot(input.botId);

			return { success: true };
		}),
});
