import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

// Message queue for bot chat message processing
const botChatMessageQueues = new Map<
	number,
	Array<{
		messageText: string;
		templateId?: number;
		userId: string;
	}>
>();

/**
 * Chat sub-router for bot chat operations
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const chatSubRouter = createTRPCRouter({
	/**
	 * Gets the next queued message for a specific bot and removes it from the queue.
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
		.query(async ({ input }) => {
			const queue = botChatMessageQueues.get(parseInt(input.botId, 10));

			if (!queue || queue.length === 0) {
				return null;
			}

			return queue.shift() || null;
		}),
});
