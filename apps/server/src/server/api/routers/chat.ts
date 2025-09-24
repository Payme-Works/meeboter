import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	botChatMessagesTable,
	botsTable,
	insertMessageTemplateSchema,
	messageTemplatesTable,
	selectBotChatMessageSchema,
	selectMessageTemplateSchema,
} from "@/server/database/schema";

// Message queue for bot message processing
const messageQueues = new Map<
	number,
	Array<{
		messageText: string;
		templateId?: number;
		userId: string;
	}>
>();

/**
 * TRPC router implementation for chat functionality.
 * Provides endpoints for managing message templates and sending messages to bots.
 */
export const chatRouter = createTRPCRouter({
	/**
	 * Retrieves all message templates belonging to the authenticated user.
	 * @returns Promise<MessageTemplate[]> Array of message template objects
	 */
	getMessageTemplates: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/chat/templates",
				description: "Retrieve a list of all message templates",
			},
		})
		.input(z.void())
		.output(z.array(selectMessageTemplateSchema))
		.query(async ({ ctx }) => {
			try {
				console.log(
					"Attempting to query message_templates table for user:",
					ctx.session.user.id,
				);

				const result = await ctx.db
					.select()
					.from(messageTemplatesTable)
					.where(eq(messageTemplatesTable.userId, ctx.session.user.id))
					.orderBy(messageTemplatesTable.createdAt);

				console.log("Successfully retrieved message templates:", result.length);

				return result;
			} catch (error) {
				console.error("Database query failed for message_templates:", {
					error: error instanceof Error ? error.message : error,
					stack: error instanceof Error ? error.stack : undefined,
					userId: ctx.session.user.id,
					tableName: "message_templates",
				});

				throw new Error(
					`Database query failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}),

	/**
	 * Creates a new message template with an array of message variations.
	 * @param input - Template data including name and message variations
	 * @returns Promise<MessageTemplate> The created message template
	 */
	createMessageTemplate: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/chat/templates",
				description: "Create a new message template with multiple variations",
			},
		})
		.input(insertMessageTemplateSchema)
		.output(selectMessageTemplateSchema)
		.mutation(async ({ input, ctx }) => {
			const result = await ctx.db
				.insert(messageTemplatesTable)
				.values({
					...input,
					userId: ctx.session.user.id,
				})
				.returning();

			if (!result[0]) {
				throw new Error("Template creation failed");
			}

			return result[0];
		}),

	/**
	 * Updates an existing message template.
	 * @param input - Object containing template ID and update data
	 * @returns Promise<MessageTemplate> The updated message template
	 */
	updateMessageTemplate: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/chat/templates/{id}",
				description: "Update an existing message template",
			},
		})
		.input(
			z.object({
				id: z.string(),
				data: insertMessageTemplateSchema.partial(),
			}),
		)
		.output(selectMessageTemplateSchema)
		.mutation(async ({ input, ctx }) => {
			// Verify template belongs to user
			const template = await ctx.db
				.select()
				.from(messageTemplatesTable)
				.where(eq(messageTemplatesTable.id, parseInt(input.id, 10)));

			if (!template[0] || template[0].userId !== ctx.session.user.id) {
				throw new Error("Template not found");
			}

			const result = await ctx.db
				.update(messageTemplatesTable)
				.set({
					...input.data,
					updatedAt: new Date(),
				})
				.where(eq(messageTemplatesTable.id, parseInt(input.id, 10)))
				.returning();

			if (!result[0]) {
				throw new Error("Template update failed");
			}

			return result[0];
		}),

	/**
	 * Deletes a message template by its ID.
	 * @param input - Object containing the template ID
	 * @returns Promise<{message: string}> Success message
	 */
	deleteMessageTemplate: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/chat/templates/{id}",
				description: "Delete a message template by its ID",
			},
		})
		.input(
			z.object({
				id: z.string(),
			}),
		)
		.output(
			z.object({
				message: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Verify template belongs to user
			const template = await ctx.db
				.select()
				.from(messageTemplatesTable)
				.where(eq(messageTemplatesTable.id, parseInt(input.id, 10)));

			if (!template[0] || template[0].userId !== ctx.session.user.id) {
				throw new Error("Template not found");
			}

			const result = await ctx.db
				.delete(messageTemplatesTable)
				.where(eq(messageTemplatesTable.id, parseInt(input.id, 10)))
				.returning();

			if (!result[0]) {
				throw new Error("Template not found");
			}

			return { message: "Template deleted successfully" };
		}),

	/**
	 * Sends a template message to multiple selected bots.
	 * Each bot randomly selects one message from the template's message array.
	 * @param input - Object containing template ID and bot IDs
	 * @returns Promise<{success: boolean, messagesSent: number}> Success status and count
	 */
	sendTemplateToMultipleBots: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/chat/send-template",
				description:
					"Send a template message to multiple bots with randomization",
			},
		})
		.input(
			z.object({
				templateId: z.number(),
				botIds: z.array(z.number()).min(1),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				messagesSent: z.number(),
				errors: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Get template and verify ownership
			const template = await ctx.db
				.select()
				.from(messageTemplatesTable)
				.where(eq(messageTemplatesTable.id, input.templateId));

			if (!template[0] || template[0].userId !== ctx.session.user.id) {
				throw new Error("Template not found");
			}

			// Get bots and verify ownership
			const bots = await ctx.db
				.select()
				.from(botsTable)
				.where(and(eq(botsTable.userId, ctx.session.user.id)));

			const userBotIds = bots.map((bot) => bot.id);

			const validBotIds = input.botIds.filter((botId) =>
				userBotIds.includes(botId),
			);

			if (validBotIds.length === 0) {
				throw new Error("No valid bots found");
			}

			const messages = template[0].messages;
			const messagesSent = [];
			const errors = [];

			// Send randomized messages to each bot
			for (const botId of validBotIds) {
				try {
					// Randomly select a message from the template
					const randomMessage =
						messages[Math.floor(Math.random() * messages.length)];

					// Queue message for the bot
					if (!messageQueues.has(botId)) {
						messageQueues.set(botId, []);
					}

					messageQueues.get(botId)?.push({
						messageText: randomMessage,
						templateId: input.templateId,
						userId: ctx.session.user.id,
					});

					// Record in database
					await ctx.db.insert(botChatMessagesTable).values({
						botId,
						userId: ctx.session.user.id,
						messageText: randomMessage,
						templateId: input.templateId,
						status: "queued",
					});

					messagesSent.push(botId);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);

					errors.push(`Bot ${botId}: ${errorMessage}`);
				}
			}

			return {
				success: messagesSent.length > 0,
				messagesSent: messagesSent.length,
				errors: errors.length > 0 ? errors : undefined,
			};
		}),

	/**
	 * Sends the same message to multiple selected bots.
	 * @param input - Object containing message text and bot IDs
	 * @returns Promise<{success: boolean, messagesSent: number}> Success status and count
	 */
	sendMessageToMultipleBots: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/chat/send-message",
				description: "Send the same message to multiple bots",
			},
		})
		.input(
			z.object({
				messageText: z.string().min(1).max(1000),
				botIds: z.array(z.number()).min(1),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				messagesSent: z.number(),
				errors: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Get bots and verify ownership
			const bots = await ctx.db
				.select()
				.from(botsTable)
				.where(and(eq(botsTable.userId, ctx.session.user.id)));

			const userBotIds = bots.map((bot) => bot.id);

			const validBotIds = input.botIds.filter((botId) =>
				userBotIds.includes(botId),
			);

			if (validBotIds.length === 0) {
				throw new Error("No valid bots found");
			}

			const messagesSent = [];
			const errors = [];

			// Send the same message to each bot
			for (const botId of validBotIds) {
				try {
					// Queue message for the bot
					if (!messageQueues.has(botId)) {
						messageQueues.set(botId, []);
					}

					messageQueues.get(botId)?.push({
						messageText: input.messageText,
						userId: ctx.session.user.id,
					});

					// Record in database
					await ctx.db.insert(botChatMessagesTable).values({
						botId,
						userId: ctx.session.user.id,
						messageText: input.messageText,
						status: "queued",
					});

					messagesSent.push(botId);
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);

					errors.push(`Bot ${botId}: ${errorMessage}`);
				}
			}

			return {
				success: messagesSent.length > 0,
				messagesSent: messagesSent.length,
				errors: errors.length > 0 ? errors : undefined,
			};
		}),

	/**
	 * Retrieves chat message history for a specific bot.
	 * @param input - Object containing the bot ID
	 * @returns Promise<BotChatMessage[]> Array of chat messages for the bot
	 */
	getChatHistoryForBot: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/chat/history/{botId}",
				description: "Retrieve chat message history for a specific bot",
			},
		})
		.input(
			z.object({
				botId: z.string(),
			}),
		)
		.output(z.array(selectBotChatMessageSchema))
		.query(async ({ input, ctx }) => {
			// Verify bot belongs to user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, parseInt(input.botId, 10)));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return await ctx.db
				.select()
				.from(botChatMessagesTable)
				.where(eq(botChatMessagesTable.botId, parseInt(input.botId, 10)))
				.orderBy(botChatMessagesTable.sentAt);
		}),

	/**
	 * Gets the next queued message for a specific bot (used by bot implementations).
	 * @param input - Object containing the bot ID
	 * @returns Promise<QueuedMessage | null> Next queued message or null if none
	 */
	getNextQueuedMessage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/chat/queue/{botId}",
				description: "Get the next queued message for a bot",
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
			const queue = messageQueues.get(parseInt(input.botId, 10));

			if (!queue || queue.length === 0) {
				return null;
			}

			return queue.shift() || null;
		}),
});
