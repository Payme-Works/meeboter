import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	botsTable,
	EVENT_DESCRIPTIONS,
	events,
	insertEventSchema,
	selectEventSchema,
} from "@/server/database/schema";

export const eventsRouter = createTRPCRouter({
	/**
	 * Retrieves all events for bots owned by the authenticated user
	 * Returns events with their types and descriptions for monitoring bot activity
	 * @returns {Promise<object[]>} Array of event objects with event types and metadata
	 */
	getAllEvents: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/events",
				description:
					"Retrieve a list of all events. Each event includes an eventType which can be one of several types, each with specific meanings:\n" +
					Object.entries(EVENT_DESCRIPTIONS)
						.map(([type, desc]) => `- ${type}: ${desc}`)
						.join("\n"),
			},
		})
		.input(z.void())
		.output(z.array(selectEventSchema))
		.query(async ({ ctx }) => {
			// Get all events for bots owned by the user
			const userBots = await ctx.db
				.select({ id: botsTable.id })
				.from(botsTable)
				.where(eq(botsTable.userId, ctx.session.user.id));

			const botIds = userBots.map((bot) => bot.id);

			if (botIds.length === 0) {
				return [];
			}

			// Ensure bot ID is defined before using it in the query
			const botId = botIds[0];

			if (botId === undefined) {
				throw new Error("Bot not found");
			}

			return await ctx.db.select().from(events).where(eq(events.botId, botId));
		}),

	/**
	 * Retrieves all events associated with a specific bot owned by the authenticated user
	 * Includes event type descriptions for understanding bot activity patterns
	 * @param {object} input - Input parameters
	 * @param {string} input.botId - ID of the bot to get events for
	 * @returns {Promise<object[]>} Array of event objects for the specified bot
	 */
	getEventsForBot: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/events/bot/{botId}",
				description:
					"Get all events associated with a specific bot. Each event includes an eventType which can be one of several types, each with specific meanings:\n" +
					Object.entries(EVENT_DESCRIPTIONS)
						.map(([type, desc]) => `- ${type}: ${desc}`)
						.join("\n"),
			},
		})
		.input(z.object({ botId: z.string().transform((val) => Number(val)) }))
		.output(z.array(selectEventSchema))
		.query(async ({ ctx, input }) => {
			// Check if the bot belongs to the user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.botId));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return await ctx.db
				.select()
				.from(events)
				.where(eq(events.botId, input.botId));
		}),

	/**
	 * Retrieves a specific event by its ID for the authenticated user
	 * Verifies ownership through bot association before returning event details
	 * @param {object} input - Input parameters
	 * @param {string} input.id - ID of the event to retrieve
	 * @returns {Promise<object>} Event object with full details
	 */
	getEvent: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/events/{id}",
				description: "Get a specific event by its ID",
			},
		})
		.input(z.object({ id: z.string().transform((val) => Number(val)) }))
		.output(selectEventSchema)
		.query(async ({ ctx, input }) => {
			// Get the event and join with bots to check ownership
			const result = await ctx.db
				.select({
					event: events,
					bot: botsTable,
				})
				.from(events)
				.leftJoin(botsTable, eq(events.botId, botsTable.id))
				.where(eq(events.id, input.id));

			if (!result[0]?.bot || result[0].bot.userId !== ctx.session.user.id) {
				throw new Error("Event not found");
			}

			return result[0].event;
		}),

	/**
	 * Creates a new event for a bot owned by the authenticated user
	 * Validates bot ownership before creating the event record
	 * @param {object} input - Input parameters with event data
	 * @param {number} input.botId - ID of the bot this event belongs to
	 * @param {string} input.eventType - Type of event being created
	 * @returns {Promise<object>} Created event object
	 */
	createEvent: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/events",
				description: "Create a new event",
			},
		})
		.input(insertEventSchema)
		.output(selectEventSchema)
		.mutation(async ({ ctx, input }) => {
			// Check if the bot belongs to the user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.botId));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			const result = await ctx.db.insert(events).values(input).returning();

			if (!result[0]) {
				throw new Error("Failed to create event");
			}

			return result[0];
		}),

	/**
	 * Updates an existing event's information for the authenticated user
	 * Verifies ownership through bot association before allowing updates
	 * @param {object} input - Input parameters
	 * @param {string} input.id - ID of the event to update
	 * @param {object} input.data - Partial event data to update
	 * @returns {Promise<object>} Updated event object
	 */
	updateEvent: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/events/{id}",
				description: "Update an existing event's information",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				data: insertEventSchema.partial(),
			}),
		)
		.output(selectEventSchema)
		.mutation(async ({ ctx, input }) => {
			// Check if the event's bot belongs to the user
			const event = await ctx.db
				.select({
					event: events,
					bot: botsTable,
				})
				.from(events)
				.leftJoin(botsTable, eq(events.botId, botsTable.id))
				.where(eq(events.id, input.id));

			if (!event[0]?.bot || event[0].bot.userId !== ctx.session.user.id) {
				throw new Error("Event not found");
			}

			const result = await ctx.db
				.update(events)
				.set(input.data)
				.where(eq(events.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error("Event not found");
			}

			return result[0];
		}),

	/**
	 * Deletes an event by its ID for the authenticated user
	 * Verifies ownership through bot association before allowing deletion
	 * @param {object} input - Input parameters
	 * @param {string} input.id - ID of the event to delete
	 * @returns {Promise<object>} Success message confirming deletion
	 */
	deleteEvent: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/events/{id}",
				description: "Delete an event by its ID",
			},
		})
		.input(z.object({ id: z.string().transform((val) => Number(val)) }))
		.output(z.object({ message: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// Check if the event's bot belongs to the user
			const event = await ctx.db
				.select({
					event: events,
					bot: botsTable,
				})
				.from(events)
				.leftJoin(botsTable, eq(events.botId, botsTable.id))
				.where(eq(events.id, input.id));

			if (!event[0]?.bot || event[0].bot.userId !== ctx.session.user.id) {
				throw new Error("Event not found");
			}

			const result = await ctx.db
				.delete(events)
				.where(eq(events.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error("Event not found");
			}

			return { message: "Event deleted successfully" };
		}),
});
