import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { botChatMessagesTable } from "@/server/database/schema";

/**
 * Chat sub-router for bot chat operations
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const chatSubRouter = createTRPCRouter({
	/**
	 * Gets the next queued message for a specific bot and marks it as sent.
	 * Reads from the database to ensure messages persist across server restarts.
	 * @param input - Object containing the bot ID
	 * @returns Promise<QueuedMessage | null> Next queued message or null if none
	 */
	dequeueMessage: publicProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/{botId}/chat/dequeue",
				description: "Get and remove the next queued message for a bot",
			},
		})
		.input(
			z.object({
				botId: z.string(),
			}),
		)
		.output(
			z
				.object({
					messageText: z.string(),
					templateId: z.number().optional(),
					userId: z.string(),
				})
				.nullable(),
		)
		.query(async ({ input, ctx }) => {
			const botId = parseInt(input.botId, 10);

			// Use transaction to prevent race conditions (concurrent bot instances could
			// otherwise read the same message before either marks it as sent)
			return await ctx.db.transaction(async (tx) => {
				// Find the oldest queued message for this bot
				const queuedMessages = await tx
					.select({
						id: botChatMessagesTable.id,
						messageText: botChatMessagesTable.messageText,
						templateId: botChatMessagesTable.templateId,
						userId: botChatMessagesTable.userId,
					})
					.from(botChatMessagesTable)
					.where(
						and(
							eq(botChatMessagesTable.botId, botId),
							eq(botChatMessagesTable.status, "queued"),
						),
					)
					.orderBy(asc(botChatMessagesTable.sentAt))
					.limit(1);

				const candidate = queuedMessages[0];

				if (!candidate) {
					return null;
				}

				// Atomically update only if status is still "queued" (prevents duplicates)
				const updated = await tx
					.update(botChatMessagesTable)
					.set({ status: "sent" })
					.where(
						and(
							eq(botChatMessagesTable.id, candidate.id),
							eq(botChatMessagesTable.status, "queued"),
						),
					)
					.returning({
						messageText: botChatMessagesTable.messageText,
						templateId: botChatMessagesTable.templateId,
						userId: botChatMessagesTable.userId,
					});

				const message = updated[0];

				if (!message) {
					return null;
				}

				return {
					messageText: message.messageText,
					templateId: message.templateId ?? undefined,
					userId: message.userId,
				};
			});
		}),
});
