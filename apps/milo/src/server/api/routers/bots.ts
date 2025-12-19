import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	buildPaginatedResponse,
	type PaginatedResponse,
	paginatedResponseSchema,
	paginationInput,
} from "@/lib/pagination";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import type { Db } from "@/server/database/db";
import {
	botConfigSchema,
	botPoolSlotsTable,
	botsTable,
	events,
	insertBotSchema,
	insertEventSchema,
	type ScreenshotData,
	screenshotDataSchema,
	selectBotSchema,
	speakerTimeframeSchema,
	status,
} from "@/server/database/schema";
import { extractCount } from "@/server/utils/database";
import { generateSignedUrl } from "@/server/utils/s3";
import {
	getDailyBotUsage,
	getUserSubscriptionInfo,
	validateBotCreation,
} from "@/server/utils/subscription";
import { services } from "../services";

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

// ============================================================================
// Sub-routers
// ============================================================================

/**
 * Pool sub-router for pool slot operations
 */
const poolSubRouter = createTRPCRouter({
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
				path: "/bots/pool/{poolSlotUuid}",
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
			// Terminal states - bots in these states should NOT be restarted
			const terminalStatuses = ["DONE", "FATAL"] as const;

			// Primary lookup: check the slot's assignedBotId (authoritative source)
			const slotResult = await ctx.db
				.select({
					assignedBotId: botPoolSlotsTable.assignedBotId,
				})
				.from(botPoolSlotsTable)
				.where(eq(botPoolSlotsTable.coolifyServiceUuid, input.poolSlotUuid))
				.limit(1);

			if (slotResult[0]?.assignedBotId) {
				// Slot has an assigned bot - use that
				const botResult = await ctx.db
					.select()
					.from(botsTable)
					.where(eq(botsTable.id, slotResult[0].assignedBotId))
					.limit(1);

				if (!botResult[0]) {
					throw new Error(`Bot not found: ${slotResult[0].assignedBotId}`);
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
					meetingInfo: bot.meetingInfo,
					meetingTitle: bot.meetingTitle,
					startTime: bot.startTime,
					endTime: bot.endTime,
					botDisplayName: bot.botDisplayName,
					botImage: bot.botImage ?? undefined,
					recordingEnabled: bot.recordingEnabled,
					heartbeatInterval: bot.heartbeatInterval,
					automaticLeave: bot.automaticLeave,
					callbackUrl: bot.callbackUrl ?? undefined,
					chatEnabled: bot.chatEnabled,
				};
			}

			// Fallback: look up bot by coolifyServiceUuid (for backwards compatibility)
			const botResult = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.coolifyServiceUuid, input.poolSlotUuid))
				.limit(1);

			if (!botResult[0]) {
				// No bot found by either method
				if (!slotResult[0]) {
					throw new Error(`Pool slot not found: ${input.poolSlotUuid}`);
				}

				throw new Error(`No bot assigned to pool slot: ${input.poolSlotUuid}`);
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

			// Return the bot config in the expected format
			return {
				id: bot.id,
				userId: bot.userId,
				meetingInfo: bot.meetingInfo,
				meetingTitle: bot.meetingTitle,
				startTime: bot.startTime,
				endTime: bot.endTime,
				botDisplayName: bot.botDisplayName,
				botImage: bot.botImage ?? undefined,
				recordingEnabled: bot.recordingEnabled,
				heartbeatInterval: bot.heartbeatInterval,
				automaticLeave: bot.automaticLeave,
				callbackUrl: bot.callbackUrl ?? undefined,
				chatEnabled: bot.chatEnabled,
			};
		}),
});

/**
 * Events sub-router for bot event operations
 */
const eventsSubRouter = createTRPCRouter({
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

// Message queue for bot chat message processing (moved from chat router)
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
 */
const chatSubRouter = createTRPCRouter({
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

// ============================================================================
// Main bots router
// ============================================================================

/**
 * TRPC router implementation for bot management operations.
 * Provides endpoints for creating, updating, deleting, and managing bots.
 */
export const botsRouter = createTRPCRouter({
	// Sub-routers
	pool: poolSubRouter,
	events: eventsSubRouter,
	chat: chatSubRouter,

	/**
	 * Retrieves paginated bots belonging to the authenticated user.
	 * @param input - Pagination parameters (page, pageSize)
	 * @returns Promise<PaginatedResponse<Bot>> Paginated bot objects ordered by creation date
	 */
	getBots: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots",
				description: "Retrieve a paginated list of bots",
			},
		})
		.input(paginationInput)
		.output(paginatedResponseSchema(selectBotSchema))
		.query(
			async ({
				ctx,
				input,
			}): Promise<PaginatedResponse<typeof selectBotSchema._output>> => {
				const { page, pageSize } = input;
				const offset = (page - 1) * pageSize;

				const [data, countResult] = await Promise.all([
					ctx.db
						.select()
						.from(botsTable)
						.where(eq(botsTable.userId, ctx.session.user.id))
						.orderBy(desc(botsTable.createdAt))
						.limit(pageSize)
						.offset(offset),
					ctx.db
						.select({ count: sql<number>`count(*)` })
						.from(botsTable)
						.where(eq(botsTable.userId, ctx.session.user.id)),
				]);

				const total = Number(countResult[0]?.count ?? 0);

				return buildPaginatedResponse(data, total, page, pageSize, (item) =>
					String(item.id),
				);
			},
		),

	/**
	 * Retrieves a specific bot by its ID.
	 * @param input - Object containing the bot ID
	 * @param input.id - The bot ID to retrieve
	 * @returns Promise<Bot> The bot object if found and belongs to the user
	 * @throws Error if bot is not found or doesn't belong to the user
	 */
	getBot: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/{id}",
				description: "Get a specific bot by its ID",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			selectBotSchema.extend({
				poolSlotName: z.string().nullable(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const result = await ctx.db
				.select({
					bot: botsTable,
					poolSlotName: botPoolSlotsTable.slotName,
				})
				.from(botsTable)
				.leftJoin(
					botPoolSlotsTable,
					eq(
						botsTable.coolifyServiceUuid,
						botPoolSlotsTable.coolifyServiceUuid,
					),
				)
				.where(eq(botsTable.id, input.id));

			if (!result[0] || result[0].bot.userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return {
				...result[0].bot,
				poolSlotName: result[0].poolSlotName,
			};
		}),

	/**
	 * Creates a new bot with the specified configuration.
	 * Validates subscription limits and deploys the bot immediately if scheduled for immediate start.
	 * @param input - Bot configuration data
	 * @param input.botDisplayName - Display name for the bot
	 * @param input.botImage - Optional bot image URL
	 * @param input.meetingTitle - Title of the meeting the bot will join
	 * @param input.meetingInfo - Meeting connection information
	 * @param input.startTime - Scheduled start time for the bot
	 * @param input.endTime - Scheduled end time for the bot
	 * @param input.recordingEnabled - Whether recording should be enabled
	 * @param input.heartbeatInterval - Heartbeat interval in milliseconds
	 * @param input.automaticLeave - Configuration for automatic leave behavior
	 * @param input.callbackUrl - Optional URL to call when bot completes
	 * @returns Promise<Bot> The created bot object
	 * @throws Error if bot creation is not allowed or fails
	 */
	createBot: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots",
				description: "Create a new bot with the specified configuration",
			},
		})
		.input(
			insertBotSchema.extend({
				startTime: z
					.string()
					.optional()
					.transform((val) => (val ? new Date(val) : undefined))
					.default(new Date()),
				endTime: z
					.string()
					.optional()
					.transform((val) => (val ? new Date(val) : undefined))
					.default(new Date()),
				timeZone: z.string().default("UTC"), // IANA timezone
				queueTimeoutMs: z
					.number()
					.min(0)
					.max(10 * 60 * 1000)
					.optional(), // Max 10 minutes
			}),
		)
		.output(
			selectBotSchema.extend({
				queued: z.boolean().optional(),
				queuePosition: z.number().optional(),
				estimatedWaitMs: z.number().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			console.log("Starting bot creation...");

			try {
				// Test database connection
				await ctx.db.execute(sql`SELECT 1`);

				console.log("Database connection successful");

				// Validate bot creation limits using user's timezone
				const validation = await validateBotCreation(
					ctx.db,
					ctx.session.user.id,
					input.timeZone,
				);

				if (!validation.allowed) {
					throw new Error(validation.reason || "Bot creation not allowed");
				}

				console.log(
					`Bot creation allowed. Current usage: ${validation.usage}/${validation.limit ?? "unlimited"}`,
				);

				// Extract database fields from input
				const dbInput = {
					botDisplayName: input.botDisplayName ?? "Meeboter",
					botImage: input.botImage,
					userId: ctx.session.user.id,
					meetingTitle: input.meetingTitle ?? "Meeting",
					meetingInfo: input.meetingInfo,
					startTime: input.startTime,
					endTime: input.endTime,
					recordingEnabled: input.recordingEnabled ?? false,
					heartbeatInterval: input.heartbeatInterval ?? 10000,
					automaticLeave: input.automaticLeave
						? {
								waitingRoomTimeout: Math.max(
									input.automaticLeave.waitingRoomTimeout ?? 600000,
									10 * 60 * 1000,
								), // Minimum 10 minutes
								noOneJoinedTimeout: Math.max(
									input.automaticLeave.noOneJoinedTimeout ?? 300000,
									60 * 1000,
								), // Minimum 60 seconds
								everyoneLeftTimeout: Math.max(
									input.automaticLeave.everyoneLeftTimeout ?? 300000,
									60 * 1000,
								), // Minimum 60 seconds
								inactivityTimeout: Math.max(
									input.automaticLeave.inactivityTimeout ?? 300000,
									5 * 60 * 1000,
								), // Minimum 5 minutes
							}
						: {
								waitingRoomTimeout: 10 * 60 * 1000, // 10 minutes (default)
								noOneJoinedTimeout: 60 * 1000, // 60 seconds (default)
								everyoneLeftTimeout: 60 * 1000, // 60 seconds (default)
								inactivityTimeout: 5 * 60 * 1000, // 5 minutes (default)
							},
					callbackUrl: input.callbackUrl, // Credit to @martinezpl for this line -- cannot merge at time of writing due to capstone requirements
					chatEnabled: input.chatEnabled ?? true,
				};

				const result = await ctx.db
					.insert(botsTable)
					.values(dbInput)
					.returning();

				if (!result[0]) {
					throw new Error("Bot creation failed, no result returned");
				}

				// Check if we should deploy immediately
				if (services.deployment.shouldDeployImmediately(input.startTime)) {
					console.log("Deploying bot immediately...");

					const deployResult = await services.deployment.deploy(
						result[0].id,
						input.queueTimeoutMs,
					);

					return {
						...deployResult.bot,
						queued: deployResult.queued,
						queuePosition: deployResult.queuePosition,
						estimatedWaitMs: deployResult.estimatedWaitMs,
					};
				}

				return result[0];
			} catch (error) {
				console.error("Error creating bot:", error);

				throw error;
			}
		}),

	/**
	 * Updates an existing bot's configuration.
	 * @param input - Object containing bot ID and update data
	 * @param input.id - The ID of the bot to update
	 * @param input.data - Partial bot data to update
	 * @returns Promise<Bot> The updated bot object
	 * @throws Error if bot is not found or doesn't belong to the user
	 */
	updateBot: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/bots/{id}",
				description: "Update an existing bot's configuration",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				data: insertBotSchema.partial().transform((data) => ({
					...data,
					startTime: data.startTime ? new Date(data.startTime) : undefined,
					endTime: data.endTime ? new Date(data.endTime) : undefined,
				})),
			}),
		)
		.output(selectBotSchema)
		.mutation(
			async ({ input, ctx }): Promise<typeof selectBotSchema._output> => {
				// Check if the bot belongs to the user
				const bot = await ctx.db
					.select()
					.from(botsTable)
					.where(eq(botsTable.id, input.id));

				if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
					throw new Error("Bot not found");
				}

				const result = await ctx.db
					.update(botsTable)
					.set(input.data)
					.where(eq(botsTable.id, input.id))
					.returning();

				if (!result[0]) {
					throw new Error("Bot not found");
				}

				return result[0];
			},
		),

	/**
	 * Updates the status of a bot and handles completion logic.
	 * When status is set to DONE, processes recording data and triggers callback URL if configured.
	 * Optimized to use fewer database queries and transactions for better performance.
	 * @param input - Object containing bot status update data
	 * @param input.id - The ID of the bot to update
	 * @param input.status - The new status to set
	 * @param input.recording - Optional recording URL (required when status is DONE and recording is enabled)
	 * @param input.speakerTimeframes - Optional speaker timeframe data
	 * @returns Promise<Bot> The updated bot object
	 * @throws Error if bot is not found or recording is required but missing
	 */
	updateStatus: publicProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/bots/{id}/status",
				description: "Update the status of a bot",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				status: status,
				recording: z.string().optional(),
				speakerTimeframes: z.array(speakerTimeframeSchema).optional(),
			}),
		)
		.output(selectBotSchema)
		.mutation(
			async ({ input, ctx }): Promise<typeof selectBotSchema._output> => {
				// Use a single transaction to handle all operations
				return await ctx.db.transaction(async (tx) => {
					console.log("Updating bot status:", {
						id: input.id,
						status: input.status,
					});

					// Get bot info in one query (recording enabled + callback URL + coolify UUID)
					const botRecord = await tx
						.select({
							recordingEnabled: botsTable.recordingEnabled,
							callbackUrl: botsTable.callbackUrl,
							coolifyServiceUuid: botsTable.coolifyServiceUuid,
						})
						.from(botsTable)
						.where(eq(botsTable.id, input.id))
						.limit(1);

					if (!botRecord[0]) {
						throw new Error("Bot not found");
					}

					// Validate recording requirement only if recording is enabled
					if (
						input.status === "DONE" &&
						botRecord[0].recordingEnabled &&
						!input.recording
					) {
						throw new Error(
							"Recording is required when status is DONE and recording is enabled",
						);
					}

					// Update bot status and optionally recording data in one query
					const updateData: {
						status: typeof input.status;
						recording?: string;
						speakerTimeframes?: typeof input.speakerTimeframes;
						coolifyServiceUuid?: null;
					} = {
						status: input.status,
					};

					// Include recording data if status is DONE
					if (input.status === "DONE") {
						updateData.recording = input.recording;
						updateData.speakerTimeframes = input.speakerTimeframes;
					}

					// Note: We intentionally do NOT clear coolifyServiceUuid when bot reaches terminal state.
					// Keeping it allows getPoolSlot to find finished bots and return a proper "container should exit"
					// error when the container makes a final call during shutdown. The slot's assignedBotId being
					// cleared is sufficient for pool management, and new bots get their own coolifyServiceUuid set
					// when assigned to a slot (overwriting any previous value).

					const result = await tx
						.update(botsTable)
						.set(updateData)
						.where(eq(botsTable.id, input.id))
						.returning();

					if (!result[0]) {
						throw new Error("Bot not found");
					}

					// Handle callback URL outside transaction to avoid blocking
					if (input.status === "DONE" && botRecord[0].callbackUrl) {
						// Don't await, fire and forget to avoid blocking the database transaction
						fetch(botRecord[0].callbackUrl, {
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								botId: input.id,
								status: input.status,
							}),
						}).catch((error) => {
							console.error("Error calling callback URL:", error);
						});
					}

					// Release pool slot when bot completes or fails (returns slot to pool for reuse)
					if (
						(input.status === "DONE" || input.status === "FATAL") &&
						botRecord[0].coolifyServiceUuid
					) {
						// Fire and forget, don't block the response
						services.deployment.release(input.id).catch((error) => {
							console.error(
								`Failed to release pool slot for bot ${input.id}:`,
								error,
							);
						});
					}

					return result[0];
				});
			},
		),

	/**
	 * Deletes a bot by its ID.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot to delete
	 * @returns Promise<{message: string}> Success message
	 * @throws Error if bot is not found or doesn't belong to the user
	 */
	deleteBot: protectedProcedure
		.meta({
			openapi: {
				method: "DELETE",
				path: "/bots/{id}",
				description: "Delete a bot by its ID",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				message: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }): Promise<{ message: string }> => {
			// Check if the bot belongs to the user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			const result = await ctx.db
				.delete(botsTable)
				.where(eq(botsTable.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error("Bot not found");
			}

			return { message: "Bot deleted successfully" };
		}),

	/**
	 * Deletes multiple bots by their IDs.
	 * @param input - Object containing an array of bot IDs
	 * @param input.ids - Array of bot IDs to delete
	 * @returns Promise<{deleted: number, failed: number}> Count of deleted and failed deletions
	 */
	deleteBots: protectedProcedure
		.input(
			z.object({
				ids: z.array(z.number()).min(1, "At least one bot ID is required"),
			}),
		)
		.output(
			z.object({
				deleted: z.number(),
				failed: z.number(),
			}),
		)
		.mutation(
			async ({ input, ctx }): Promise<{ deleted: number; failed: number }> => {
				// First verify all bots belong to the user
				const userBots = await ctx.db
					.select({ id: botsTable.id })
					.from(botsTable)
					.where(
						and(
							inArray(botsTable.id, input.ids),
							eq(botsTable.userId, ctx.session.user.id),
						),
					);

				const validBotIds = userBots.map((b) => b.id);
				const invalidCount = input.ids.length - validBotIds.length;

				if (validBotIds.length === 0) {
					return { deleted: 0, failed: input.ids.length };
				}

				// Delete all valid bots
				const result = await ctx.db
					.delete(botsTable)
					.where(inArray(botsTable.id, validBotIds))
					.returning({ id: botsTable.id });

				console.log(
					`[Bots] Bulk delete: ${result.length} deleted, ${invalidCount} failed (not found or unauthorized)`,
				);

				return {
					deleted: result.length,
					failed: invalidCount,
				};
			},
		),

	/**
	 * Cancels multiple bot deployments by their IDs.
	 * Only works for bots in pre-call states (DEPLOYING, JOINING_CALL).
	 * @param input - Object containing an array of bot IDs
	 * @param input.ids - Array of bot IDs to cancel
	 * @returns Promise<{cancelled: number, failed: number}> Count of cancelled and failed cancellations
	 */
	cancelDeployments: protectedProcedure
		.input(
			z.object({
				ids: z.array(z.number()).min(1, "At least one bot ID is required"),
			}),
		)
		.output(
			z.object({
				cancelled: z.number(),
				failed: z.number(),
			}),
		)
		.mutation(
			async ({
				input,
				ctx,
			}): Promise<{ cancelled: number; failed: number }> => {
				// Only pre-call statuses can be cancelled
				const cancellableStatuses = ["DEPLOYING", "JOINING_CALL"] as const;

				// Get all bots that belong to the user and are in a cancellable state
				const userBots = await ctx.db
					.select({
						id: botsTable.id,
						status: botsTable.status,
						coolifyServiceUuid: botsTable.coolifyServiceUuid,
					})
					.from(botsTable)
					.where(
						and(
							inArray(botsTable.id, input.ids),
							eq(botsTable.userId, ctx.session.user.id),
						),
					);

				const validBots = userBots.filter((b) =>
					(cancellableStatuses as readonly string[]).includes(b.status),
				);

				const invalidCount = input.ids.length - validBots.length;

				if (validBots.length === 0) {
					return { cancelled: 0, failed: input.ids.length };
				}

				let cancelledCount = 0;

				for (const bot of validBots) {
					try {
						// Log the cancellation event
						await ctx.db.insert(events).values({
							botId: bot.id,
							eventType: "USER_CANCELLED_DEPLOYMENT",
							eventTime: new Date(),
							data: {
								description: "Bot deployment cancelled by user (bulk action)",
							},
						});

						// Set to DONE directly for pre-call bots
						await ctx.db
							.update(botsTable)
							.set({ status: "DONE" })
							.where(eq(botsTable.id, bot.id));

						// Release pool slot if applicable
						if (bot.coolifyServiceUuid) {
							void services.deployment.release(bot.id).catch((error) => {
								console.error(
									`Failed to release pool slot for bot ${bot.id}:`,
									error,
								);
							});
						}

						cancelledCount++;
					} catch (error) {
						console.error(`Failed to cancel bot ${bot.id}:`, error);
					}
				}

				console.log(
					`[Bots] Bulk cancel deployments: ${cancelledCount} cancelled, ${invalidCount + (validBots.length - cancelledCount)} failed`,
				);

				return {
					cancelled: cancelledCount,
					failed: invalidCount + (validBots.length - cancelledCount),
				};
			},
		),

	/**
	 * Removes multiple bots from their active calls.
	 * Only works for bots in IN_WAITING_ROOM or IN_CALL states.
	 * @param input - Object containing an array of bot IDs
	 * @param input.ids - Array of bot IDs to remove from call
	 * @returns Promise<{removed: number, failed: number}> Count of removed and failed removals
	 */
	removeBotsFromCall: protectedProcedure
		.input(
			z.object({
				ids: z.array(z.number()).min(1, "At least one bot ID is required"),
			}),
		)
		.output(
			z.object({
				removed: z.number(),
				failed: z.number(),
			}),
		)
		.mutation(
			async ({ input, ctx }): Promise<{ removed: number; failed: number }> => {
				// Only in-call statuses can be removed
				const removableStatuses = ["IN_WAITING_ROOM", "IN_CALL"] as const;

				// Get all bots that belong to the user and are in a removable state
				const userBots = await ctx.db
					.select({
						id: botsTable.id,
						status: botsTable.status,
					})
					.from(botsTable)
					.where(
						and(
							inArray(botsTable.id, input.ids),
							eq(botsTable.userId, ctx.session.user.id),
						),
					);

				const validBots = userBots.filter((b) =>
					(removableStatuses as readonly string[]).includes(b.status),
				);

				const invalidCount = input.ids.length - validBots.length;

				if (validBots.length === 0) {
					return { removed: 0, failed: input.ids.length };
				}

				let removedCount = 0;

				for (const bot of validBots) {
					try {
						// Log the removal event
						await ctx.db.insert(events).values({
							botId: bot.id,
							eventType: "USER_REMOVED_FROM_CALL",
							eventTime: new Date(),
							data: {
								description: "Bot removed from call by user (bulk action)",
							},
						});

						// Set to LEAVING for graceful exit
						await ctx.db
							.update(botsTable)
							.set({ status: "LEAVING" })
							.where(eq(botsTable.id, bot.id));

						removedCount++;
					} catch (error) {
						console.error(`Failed to remove bot ${bot.id} from call:`, error);
					}
				}

				console.log(
					`[Bots] Bulk remove from call: ${removedCount} removed, ${invalidCount + (validBots.length - removedCount)} failed`,
				);

				return {
					removed: removedCount,
					failed: invalidCount + (validBots.length - removedCount),
				};
			},
		),

	/**
	 * Generates a signed URL for accessing a bot's recording.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot whose recording URL is requested
	 * @returns Promise<{recordingUrl: string | null}> The signed recording URL or null if no recording exists
	 * @throws Error if bot is not found
	 */
	getSignedRecordingUrl: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/{id}/recording",
				description:
					"Retrieve a signed URL for the recording associated with a specific bot",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				recordingUrl: z.string().nullable(),
			}),
		)
		.query(async ({ input, ctx }): Promise<{ recordingUrl: string | null }> => {
			const result = await ctx.db
				.select({ recording: botsTable.recording })
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!result[0]) {
				throw new Error("Bot not found");
			}

			if (!result[0].recording) {
				return { recordingUrl: null };
			}

			const signedUrl = await generateSignedUrl(result[0].recording);

			return { recordingUrl: signedUrl };
		}),

	/**
	 * Processes heartbeat signals from bot scripts to indicate the bot is still running.
	 * Returns shouldLeave flag if the bot has been requested to leave the call.
	 * Also returns logLevel for dynamic log level control.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot sending the heartbeat
	 * @returns Promise<{shouldLeave: boolean, logLevel: string | null}> Whether the bot should leave and current log level
	 */
	sendHeartbeat: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/heartbeat",
				description:
					"Heartbeat with leave signal and log level for runtime control",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				shouldLeave: z.boolean(),
				logLevel: z.string().nullable(),
			}),
		)
		.mutation(
			async ({
				input,
				ctx,
			}): Promise<{ shouldLeave: boolean; logLevel: string | null }> => {
				const startTime = Date.now();

				// Get current status and logLevel, update heartbeat in parallel
				const [botResult] = await Promise.all([
					ctx.db
						.select({ status: botsTable.status, logLevel: botsTable.logLevel })
						.from(botsTable)
						.where(eq(botsTable.id, input.id))
						.limit(1),
					ctx.db
						.update(botsTable)
						.set({ lastHeartbeat: new Date() })
						.where(eq(botsTable.id, input.id))
						.execute(),
				]);

				const duration = Date.now() - startTime;

				if (duration > 1000) {
					console.warn(
						`[DB] heartbeat query took ${duration}ms for bot ${input.id}`,
					);
				}

				// Return shouldLeave if bot status is LEAVING
				const shouldLeave = botResult[0]?.status === "LEAVING";
				const logLevel = botResult[0]?.logLevel ?? null;

				return { shouldLeave, logLevel };
			},
		),

	/**
	 * Deploys a bot by provisioning necessary resources and starting it up.
	 * If the pool is exhausted, the bot will be queued and queue info will be returned.
	 * @param input - Object containing the bot ID and optional queue timeout
	 * @param input.id - The ID of the bot to deploy
	 * @param input.queueTimeoutMs - Optional timeout for waiting in queue (max 10 minutes)
	 * @returns Promise<Bot> The deployed bot object with optional queue info
	 * @throws Error if bot is not found or doesn't belong to the user
	 */
	deployBot: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/deploy",
				description:
					"Deploy a bot by provisioning necessary resources and starting it up",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				queueTimeoutMs: z
					.number()
					.min(0)
					.max(10 * 60 * 1000)
					.optional(), // Max 10 minutes
			}),
		)
		.output(
			selectBotSchema.extend({
				queued: z.boolean().optional(),
				queuePosition: z.number().optional(),
				estimatedWaitMs: z.number().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Check if the bot belongs to the user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			const deployResult = await services.deployment.deploy(
				input.id,
				input.queueTimeoutMs,
			);

			return {
				...deployResult.bot,
				queued: deployResult.queued,
				queuePosition: deployResult.queuePosition,
				estimatedWaitMs: deployResult.estimatedWaitMs,
			};
		}),

	/**
	 * Retrieves the count of currently active bots for the authenticated user.
	 * Active bots are those not in DONE or FATAL status.
	 * @returns Promise<{count: number}> The count of active bots
	 */
	getActiveBotCount: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/active/count",
				description:
					"Get the count of currently active bots (not DONE or FATAL)",
			},
		})
		.input(z.void())
		.output(
			z.object({
				count: z.number(),
			}),
		)
		.query(async ({ ctx }): Promise<{ count: number }> => {
			const result = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(botsTable)
				.where(
					and(
						eq(botsTable.userId, ctx.session.user.id),
						notInArray(botsTable.status, ["DONE", "FATAL"] as const),
					),
				);

			return { count: extractCount(result) };
		}),

	/**
	 * Retrieves the current user's subscription information including plan details and limits.
	 * @returns Promise<SubscriptionInfo> User subscription information
	 */
	getUserSubscription: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/user/subscription",
				description: "Get the current user's subscription information",
			},
		})
		.input(z.void())
		.output(
			z.object({
				currentPlan: z.string(),
				dailyBotLimit: z.number().nullable(),
				customDailyBotLimit: z.number().nullable(),
				effectiveDailyLimit: z.number().nullable(),
				subscriptionActive: z.boolean(),
				subscriptionEndDate: z.date().nullable(),
			}),
		)
		.query(
			async ({
				ctx,
			}): Promise<{
				currentPlan: string;
				dailyBotLimit: number | null;
				customDailyBotLimit: number | null;
				effectiveDailyLimit: number | null;
				subscriptionActive: boolean;
				subscriptionEndDate: Date | null;
			}> => {
				const subscriptionInfo = await getUserSubscriptionInfo(
					ctx.db,
					ctx.session.user.id,
				);

				return {
					currentPlan: subscriptionInfo.currentPlan,
					dailyBotLimit: subscriptionInfo.dailyBotLimit,
					customDailyBotLimit: subscriptionInfo.customDailyBotLimit,
					effectiveDailyLimit: subscriptionInfo.effectiveDailyLimit,
					subscriptionActive: subscriptionInfo.subscriptionActive,
					subscriptionEndDate: subscriptionInfo.subscriptionEndDate,
				};
			},
		),

	/**
	 * Retrieves the user's daily bot usage statistics for a specific date.
	 * @param input - Optional input parameters
	 * @param input.date - Optional date in YYYY-MM-DD format (defaults to current date)
	 * @param input.timeZone - IANA timezone for date calculation (defaults to UTC)
	 * @returns Promise<UsageInfo> Daily usage information including current usage, limits, and remaining quota
	 */
	getDailyUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/user/daily-usage",
				description: "Get the user's daily bot usage",
			},
		})
		.input(
			z
				.object({
					date: z.string().optional(), // YYYY-MM-DD format
					timeZone: z.string().default("UTC"), // IANA timezone
				})
				.optional(),
		)
		.output(
			z.object({
				usage: z.number(),
				limit: z.number().nullable(),
				date: z.string(),
				remaining: z.number().nullable(),
			}),
		)
		.query(
			async ({
				input,
				ctx,
			}): Promise<{
				usage: number;
				limit: number | null;
				date: string;
				remaining: number | null;
			}> => {
				const date = input?.date ? new Date(input.date) : new Date();
				const timeZone = input?.timeZone ?? "UTC";

				const subscriptionInfo = await getUserSubscriptionInfo(
					ctx.db,
					ctx.session.user.id,
				);

				const usage = await getDailyBotUsage(
					ctx.db,
					ctx.session.user.id,
					date,
					timeZone,
				);

				const limit = subscriptionInfo.effectiveDailyLimit;
				const remaining = limit !== null ? Math.max(0, limit - usage) : null;

				return {
					usage,
					limit,
					date: date.toISOString().split("T")[0],
					remaining,
				};
			},
		),

	/**
	 * Removes a bot from an active call manually.
	 * Only works for bots in IN_WAITING_ROOM, IN_CALL, or RECORDING status.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot to remove from call
	 * @returns Promise<{success: boolean}> Success status
	 * @throws TRPCError if bot is not found, doesn't belong to user, or is not in an active call
	 */
	removeFromCall: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/remove-from-call",
				description: "Remove a bot from an active call",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
			const eligibleStatuses = ["IN_WAITING_ROOM", "IN_CALL", "RECORDING"];

			const bot = await ctx.db
				.select({
					id: botsTable.id,
					userId: botsTable.userId,
					status: botsTable.status,
					coolifyServiceUuid: botsTable.coolifyServiceUuid,
				})
				.from(botsTable)
				.where(eq(botsTable.id, input.id))
				.limit(1);

			if (!bot[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Bot not found",
				});
			}

			if (bot[0].userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Bot not found",
				});
			}

			if (!eligibleStatuses.includes(bot[0].status)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Bot is not in an active call",
				});
			}

			await ctx.db.insert(events).values({
				botId: input.id,
				eventType: "USER_REMOVED_FROM_CALL",
				eventTime: new Date(),
				data: {
					description: "Bot manually removed from call by user",
				},
			});

			// Set status to LEAVING - bot will see this and gracefully exit
			// Bot will then set status to DONE, which triggers container release
			await ctx.db
				.update(botsTable)
				.set({ status: "LEAVING" })
				.where(eq(botsTable.id, input.id));

			return { success: true };
		}),

	/**
	 * Cancels a bot deployment before it joins a call.
	 * Only works for bots in DEPLOYING status.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot to cancel
	 * @returns Promise<{success: boolean}> Success status
	 * @throws TRPCError if bot is not found, doesn't belong to user, or is not deploying
	 */
	cancelDeployment: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/cancel",
				description: "Cancel a bot deployment",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
			const bot = await ctx.db
				.select({
					id: botsTable.id,
					userId: botsTable.userId,
					status: botsTable.status,
					coolifyServiceUuid: botsTable.coolifyServiceUuid,
				})
				.from(botsTable)
				.where(eq(botsTable.id, input.id))
				.limit(1);

			if (!bot[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Bot not found",
				});
			}

			if (bot[0].userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Bot not found",
				});
			}

			if (bot[0].status !== "DEPLOYING") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Bot is not deploying",
				});
			}

			await ctx.db.insert(events).values({
				botId: input.id,
				eventType: "USER_CANCELLED_DEPLOYMENT",
				eventTime: new Date(),
				data: {
					description: "Bot deployment cancelled by user",
				},
			});

			await ctx.db
				.update(botsTable)
				.set({ status: "DONE" })
				.where(eq(botsTable.id, input.id));

			if (bot[0].coolifyServiceUuid) {
				void services.deployment.release(input.id).catch((error) => {
					console.error(
						`Failed to release pool slot for bot ${input.id}:`,
						error,
					);
				});
			}

			return { success: true };
		}),

	/**
	 * Retrieves the current bot pool statistics for monitoring.
	 * Shows idle, busy, and error slot counts.
	 * @returns Promise<PoolStats> Pool statistics
	 */
	getPoolStats: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/pool/stats",
				description: "Get bot pool statistics for monitoring",
			},
		})
		.input(z.void())
		.output(
			z.object({
				total: z.number(),
				idle: z.number(),
				busy: z.number(),
				error: z.number(),
				maxSize: z.number(),
			}),
		)
		.query(async () => {
			if (!services.pool) {
				throw new TRPCError({
					code: "NOT_IMPLEMENTED",
					message: "Pool stats are only available when using Coolify platform",
				});
			}

			return await services.pool.getPoolStats();
		}),

	/**
	 * Retrieves the current queue statistics for monitoring.
	 * Shows queue length, oldest entry, and average wait time.
	 * @returns Promise<QueueStats> Queue statistics
	 */
	getQueueStats: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/queue/stats",
				description: "Get bot queue statistics for monitoring",
			},
		})
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
					message: "Queue stats are only available when using Coolify platform",
				});
			}

			return await services.pool.getQueueStats();
		}),

	/**
	 * Appends a screenshot to a bot's screenshots array.
	 * Called by bot containers when capturing screenshots on errors or state changes.
	 * @param input - Object containing bot ID and screenshot data
	 * @param input.id - The ID of the bot
	 * @param input.screenshot - The screenshot metadata to append
	 * @returns Promise<{success: boolean, totalScreenshots: number}> Success status and total count
	 */
	addScreenshot: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/screenshots",
				description: "Append a screenshot to a bot's screenshots array",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				screenshot: screenshotDataSchema,
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
				totalScreenshots: z.number(),
			}),
		)
		.mutation(
			async ({
				input,
				ctx,
			}): Promise<{ success: boolean; totalScreenshots: number }> => {
				// Get current screenshots array
				const bot = await ctx.db
					.select({ screenshots: botsTable.screenshots })
					.from(botsTable)
					.where(eq(botsTable.id, input.id))
					.limit(1);

				if (!bot[0]) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Bot not found",
					});
				}

				// Append new screenshot to array (limit to last 50 to prevent unbounded growth)
				const currentScreenshots = (bot[0].screenshots ??
					[]) as ScreenshotData[];

				const updatedScreenshots = [
					...currentScreenshots,
					input.screenshot,
				].slice(-50);

				await ctx.db
					.update(botsTable)
					.set({ screenshots: updatedScreenshots })
					.where(eq(botsTable.id, input.id));

				console.log(
					`[Bot ${input.id}] Screenshot appended (${input.screenshot.type}), total: ${updatedScreenshots.length}`,
				);

				return {
					success: true,
					totalScreenshots: updatedScreenshots.length,
				};
			},
		),

	/**
	 * Generates a presigned URL for accessing a bot's screenshot.
	 * @param input - Object containing the S3 key
	 * @param input.key - The S3 key for the screenshot
	 * @returns Promise<{url: string}> The presigned URL
	 */
	getScreenshotSignedUrl: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/screenshots/signed-url",
				description: "Get a presigned URL for a screenshot",
			},
		})
		.input(
			z.object({
				key: z.string(),
			}),
		)
		.output(
			z.object({
				url: z.string(),
			}),
		)
		.query(async ({ input }): Promise<{ url: string }> => {
			const url = await generateSignedUrl(input.key, 3600); // 1 hour expiry

			return { url };
		}),

	/**
	 * Updates a bot's log level at runtime.
	 * Allows operators to change log verbosity without restarting the bot.
	 * @param input - Object containing bot ID and new log level
	 * @param input.id - The ID of the bot
	 * @param input.logLevel - The new log level (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
	 * @returns Promise<{success: boolean}> Success status
	 */
	updateLogLevel: protectedProcedure
		.meta({
			openapi: {
				method: "PATCH",
				path: "/bots/{id}/log-level",
				description: "Update a bot's log level at runtime",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				logLevel: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }): Promise<{ success: boolean }> => {
			// Verify bot belongs to user
			const bot = await ctx.db
				.select({ userId: botsTable.userId })
				.from(botsTable)
				.where(eq(botsTable.id, input.id))
				.limit(1);

			if (!bot[0]) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Bot not found",
				});
			}

			if (bot[0].userId !== ctx.session.user.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Bot not found",
				});
			}

			await ctx.db
				.update(botsTable)
				.set({ logLevel: input.logLevel })
				.where(eq(botsTable.id, input.id));

			console.log(`[Bot ${input.id}] Log level updated to ${input.logLevel}`);

			return { success: true };
		}),
});
