import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import type { Db } from "@/server/database/db";
import { events, insertEventSchema } from "@/server/database/schema";

// Event batching configuration
const EVENT_BATCH_SIZE = 50;
const EVENT_BATCH_INTERVAL = 100; // ms

type QueuedEvent = z.infer<typeof insertEventSchema>;

const eventQueue = new Map<number, QueuedEvent[]>(); // botId -> events[]
const batchTimers = new Map<number, NodeJS.Timeout>();

// Batch processor function
async function processBatchedEvents(db: Db, botId: number) {
	const eventList = eventQueue.get(botId);

	if (!eventList || eventList.length === 0) return;

	const eventsToInsert = [...eventList];
	eventQueue.set(botId, []); // Clear queue

	const startTime = Date.now();

	try {
		await db.insert(events).values(eventsToInsert);

		const duration = Date.now() - startTime;

		// Always log batch processing for monitoring performance improvements
		console.log(
			`[DB] Batch insert of ${eventsToInsert.length} events took ${duration}ms for bot ${botId}`,
		);

		if (duration > 1000) {
			console.warn(
				`[DB] SLOW batch insert of ${eventsToInsert.length} events took ${duration}ms for bot ${botId} (SLOW)`,
			);
		}
	} catch (error) {
		const duration = Date.now() - startTime;

		console.error(
			`[DB] Failed to batch insert ${eventsToInsert.length} events after ${duration}ms for bot ${botId}:`,
			error,
		);
		// Implement retry logic here if needed
	}
}

/**
 * Events sub-router for bot event operations
 *
 * @see rules/ROUTER_STRUCTURE.md
 */
export const eventsSubRouter = createTRPCRouter({
	/**
	 * Records events that occur during a bot session.
	 * Uses batch processing for optimal database performance.
	 * @param input - Object containing bot ID and event data
	 * @param input.id - The ID of the bot reporting the event
	 * @param input.event - The event data to record
	 * @returns Promise<void> Void promise
	 */
	report: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/events",
				description: "Batch events for efficient database insertion",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				event: insertEventSchema.omit({ botId: true }),
			}),
		)
		.output(z.void())
		.mutation(async ({ input, ctx }): Promise<void> => {
			// Initialize queue for this bot if needed
			if (!eventQueue.has(input.id)) {
				eventQueue.set(input.id, []);
			}

			// Add event to queue
			eventQueue.get(input.id)?.push({
				...input.event,
				botId: input.id,
			});

			// Clear existing timer if any
			if (batchTimers.has(input.id)) {
				const timer = batchTimers.get(input.id);

				if (timer) clearTimeout(timer);
			}

			// Process immediately if batch size reached
			if ((eventQueue.get(input.id)?.length ?? 0) >= EVENT_BATCH_SIZE) {
				await processBatchedEvents(ctx.db, input.id);
			} else {
				// Otherwise, set timer for batch interval
				const timer = setTimeout(async () => {
					await processBatchedEvents(ctx.db, input.id);
					batchTimers.delete(input.id);
				}, EVENT_BATCH_INTERVAL);

				batchTimers.set(input.id, timer);
			}
		}),
});
