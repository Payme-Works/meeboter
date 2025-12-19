import { TRPCError } from "@trpc/server";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
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

/**
 * TRPC router implementation for bot management operations.
 * Provides endpoints for creating, updating, deleting, and managing bots.
 */
export const botsRouter = createTRPCRouter({
	/**
	 * Retrieves all bots belonging to the authenticated user.
	 * @returns Promise<Bot[]> Array of bot objects ordered by creation date
	 */
	getBots: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots",
				description: "Retrieve a list of all bots",
			},
		})
		.input(z.void())
		.output(z.array(selectBotSchema))
		.query(async ({ ctx }): Promise<(typeof selectBotSchema._output)[]> => {
			return await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.userId, ctx.session.user.id))
				.orderBy(desc(botsTable.createdAt));
		}),

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
		.output(selectBotSchema)
		.query(async ({ input, ctx }): Promise<typeof selectBotSchema._output> => {
			const result = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!result[0] || result[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return result[0];
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
									input.automaticLeave.waitingRoomTimeout ?? 300000,
									5 * 60 * 1000,
								), // Minimum 5 minutes
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
								waitingRoomTimeout: 5 * 60 * 1000, // 5 minutes (default)
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
	updateBotStatus: publicProcedure
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
					} = {
						status: input.status,
					};

					// Include recording data if status is DONE
					if (input.status === "DONE") {
						updateData.recording = input.recording;
						updateData.speakerTimeframes = input.speakerTimeframes;
					}

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
	 * Uses fire-and-forget pattern for optimal performance.
	 * @param input - Object containing the bot ID
	 * @param input.id - The ID of the bot sending the heartbeat
	 * @returns Promise<void> Returns immediately without waiting for database
	 */
	heartbeat: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/heartbeat",
				description: "Lightweight heartbeat with no return data",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
			}),
		)
		.output(z.void())
		.mutation(async ({ input, ctx }): Promise<void> => {
			const startTime = Date.now();

			// Fire and forget pattern, don't wait for response
			ctx.db
				.update(botsTable)
				.set({ lastHeartbeat: new Date() })
				.where(eq(botsTable.id, input.id))
				.execute()
				.then(() => {
					const duration = Date.now() - startTime;

					if (duration > 1000) {
						console.warn(
							`[DB] heartbeat query took ${duration}ms for bot ${input.id}`,
						);
					}
				})
				.catch((error) => {
					const duration = Date.now() - startTime;

					console.error(
						`[DB] heartbeat failed after ${duration}ms for bot ${input.id}:`,
						error.message,
					);
				});

			// Return immediately without waiting
		}),

	/**
	 * Records events that occur during a bot session.
	 * Uses batch processing for optimal database performance.
	 * @param input - Object containing bot ID and event data
	 * @param input.id - The ID of the bot reporting the event
	 * @param input.event - The event data to record
	 * @returns Promise<void> Void promise
	 */
	reportEvent: publicProcedure
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
	 * Retrieves bot configuration for a pool slot (called by bot containers on startup).
	 * Uses POOL_SLOT_UUID env var to identify which slot is requesting its config.
	 * @param input - Object containing the pool slot UUID
	 * @param input.poolSlotUuid - The Coolify service UUID for the pool slot
	 * @returns Promise<BotConfig> The bot configuration for the assigned bot
	 * @throws Error if pool slot not found, no bot assigned, or bot not found
	 */
	getPoolSlot: publicProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/bots/pool-slot/{poolSlotUuid}",
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

			// Look up the bot directly by coolifyServiceUuid
			// This works even after the slot is released (assignedBotId = null)
			// because the bot's coolifyServiceUuid persists
			const botResult = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.coolifyServiceUuid, input.poolSlotUuid))
				.limit(1);

			if (!botResult[0]) {
				// Fallback: check the slot's assignedBotId for backwards compatibility
				const slotResult = await ctx.db
					.select({
						assignedBotId: botPoolSlotsTable.assignedBotId,
					})
					.from(botPoolSlotsTable)
					.where(eq(botPoolSlotsTable.coolifyServiceUuid, input.poolSlotUuid))
					.limit(1);

				if (!slotResult[0]) {
					throw new Error(`Pool slot not found: ${input.poolSlotUuid}`);
				}

				if (!slotResult[0].assignedBotId) {
					throw new Error(
						`No bot assigned to pool slot: ${input.poolSlotUuid}`,
					);
				}

				const fallbackBotResult = await ctx.db
					.select()
					.from(botsTable)
					.where(eq(botsTable.id, slotResult[0].assignedBotId))
					.limit(1);

				if (!fallbackBotResult[0]) {
					throw new Error(`Bot not found: ${slotResult[0].assignedBotId}`);
				}

				const bot = fallbackBotResult[0];

				// Prevent restarting bots that have already finished
				if (
					terminalStatuses.includes(
						bot.status as (typeof terminalStatuses)[number],
					)
				) {
					throw new Error(
						`Bot ${bot.id} has already finished (status: ${bot.status}). Container should exit.`,
					);
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

			const bot = botResult[0];

			// Prevent restarting bots that have already finished
			if (
				terminalStatuses.includes(
					bot.status as (typeof terminalStatuses)[number],
				)
			) {
				throw new Error(
					`Bot ${bot.id} has already finished (status: ${bot.status}). Container should exit.`,
				);
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
});
