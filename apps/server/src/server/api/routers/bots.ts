import { and, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import {
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
	incrementDailyBotUsage,
	validateBotCreation,
} from "@/server/utils/subscription";
import { deployBot, shouldDeployImmediately } from "../services/bot-deployment";

export const botsRouter = createTRPCRouter({
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
		.query(async ({ ctx }) => {
			return await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.userId, ctx.session.user.id))
				.orderBy(botsTable.createdAt);
		}),

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
		.query(async ({ input, ctx }) => {
			const result = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!result[0] || result[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return result[0];
		}),

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
			}),
		)
		.output(selectBotSchema)
		.mutation(async ({ input, ctx }) => {
			console.log("Starting bot creation...");

			try {
				// Test database connection
				await ctx.db.execute(sql`SELECT 1`);

				console.log("Database connection successful");

				// Validate bot creation limits
				const validation = await validateBotCreation(
					ctx.db,
					ctx.session.user.id,
				);

				if (!validation.allowed) {
					throw new Error(validation.reason || "Bot creation not allowed");
				}

				console.log(
					`Bot creation allowed. Current usage: ${validation.usage}/${validation.limit ?? "unlimited"}`,
				);

				// Extract database fields from input

				const dbInput = {
					botDisplayName: input.botDisplayName ?? "Live Boost",
					botImage: input.botImage,
					userId: ctx.session.user.id,
					meetingTitle: input.meetingTitle ?? "Meeting",
					meetingInfo: input.meetingInfo,
					startTime: input.startTime,
					endTime: input.endTime,
					recordingEnabled: input.recordingEnabled ?? false,
					heartbeatInterval: input.heartbeatInterval ?? 5000,
					automaticLeave: input.automaticLeave
						? {
								waitingRoomTimeout: Math.max(
									input.automaticLeave.waitingRoomTimeout ?? 300000,
									60000,
								), // minimum 60 seconds
								noOneJoinedTimeout: Math.max(
									input.automaticLeave.noOneJoinedTimeout ?? 300000,
									60000,
								), // minimum 60 seconds
								everyoneLeftTimeout: Math.max(
									input.automaticLeave.everyoneLeftTimeout ?? 300000,
									60000,
								), // minimum 60 seconds
								inactivityTimeout: Math.max(
									input.automaticLeave.inactivityTimeout ?? 300000,
									60000,
								), // minimum 60 seconds
							}
						: {
								waitingRoomTimeout: 300000, // 5 minutes (default)
								noOneJoinedTimeout: 300000, // 5 minutes (default)
								everyoneLeftTimeout: 300000, // 5 minutes (default)
								inactivityTimeout: 300000, // 5 minutes (default)
							},
					callbackUrl: input.callbackUrl, // Credit to @martinezpl for this line -- cannot merge at time of writing due to capstone requirements
				};

				const result = await ctx.db
					.insert(botsTable)
					.values(dbInput)
					.returning();

				if (!result[0]) {
					throw new Error("Bot creation failed - no result returned");
				}

				// Increment daily bot usage counter
				await incrementDailyBotUsage(ctx.db, ctx.session.user.id);

				// Check if we should deploy immediately
				if (await shouldDeployImmediately(input.startTime)) {
					console.log("Deploying bot immediately...");

					return await deployBot({
						botId: result[0].id,
						db: ctx.db,
					});
				}

				return result[0];
			} catch (error) {
				console.error("Error creating bot:", error);

				throw error;
			}
		}),

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
		.mutation(async ({ input, ctx }) => {
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
		}),

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
		.mutation(async ({ input, ctx }) => {
			// First get the bot to check if recording is enabled
			const botRecord = await ctx.db
				.select({ recordingEnabled: botsTable.recordingEnabled })
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

			const result = await ctx.db
				.update(botsTable)
				.set({ status: input.status })
				.where(eq(botsTable.id, input.id))
				.returning();

			if (!result[0]) {
				throw new Error("Bot not found");
			}

			// Get the bot to check for callback URL
			const bot = (
				await ctx.db
					.select({
						callbackUrl: botsTable.callbackUrl,
						id: botsTable.id,
					})
					.from(botsTable)
					.where(eq(botsTable.id, input.id))
			)[0];

			if (!bot) {
				throw new Error("Bot not found");
			}

			if (input.status === "DONE") {
				// add the recording to the bot
				await ctx.db
					.update(botsTable)
					.set({
						recording: input.recording,
						speakerTimeframes: input.speakerTimeframes,
					})
					.where(eq(botsTable.id, bot.id));

				if (bot.callbackUrl) {
					// call the callback url
					try {
						await fetch(bot.callbackUrl, {
							method: "POST",
							body: JSON.stringify({
								botId: bot.id,
								status: input.status,
							}),
						});
					} catch (error) {
						console.error("Error calling callback URL:", error);
					}
				}
			}

			return result[0];
		}),

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
		.mutation(async ({ input, ctx }) => {
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
		.query(async ({ input, ctx }) => {
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

	heartbeat: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/heartbeat",
				description:
					"Called every few seconds by bot scripts to indicate that the bot is still running",
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
		.mutation(async ({ input, ctx }) => {
			console.log("Heartbeat received for bot", input.id);

			// Update bot's last heartbeat
			const botUpdate = await ctx.db
				.update(botsTable)
				.set({ lastHeartbeat: new Date() })
				.where(eq(botsTable.id, input.id))
				.returning();

			if (!botUpdate[0]) {
				throw new Error("Bot not found");
			}

			return { success: true };
		}),

	reportEvent: publicProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/events",
				description:
					"Called whenever an event occurs during the bot session to record it immediately",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				event: insertEventSchema.omit({ botId: true }),
			}),
		)
		.output(
			z.object({
				success: z.boolean(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Insert the event
			await ctx.db.insert(events).values({
				...input.event,
				botId: input.id,
			});

			return { success: true };
		}),

	deployBot: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/bots/{id}/deploy",
				description:
					"Deploy a bot by provisioning necessary resources and starting it up",
			},
		})
		.input(z.object({ id: z.string().transform((val) => Number(val)) }))
		.output(selectBotSchema)
		.mutation(async ({ input, ctx }) => {
			// Check if the bot belongs to the user
			const bot = await ctx.db
				.select()
				.from(botsTable)
				.where(eq(botsTable.id, input.id));

			if (!bot[0] || bot[0].userId !== ctx.session.user.id) {
				throw new Error("Bot not found");
			}

			return await deployBot({
				botId: input.id,
				db: ctx.db,
			});
		}),

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
		.query(async ({ ctx }) => {
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
		.query(async ({ ctx }) => {
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
		}),

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
		.query(async ({ input, ctx }) => {
			const date = input?.date ? new Date(input.date) : new Date();

			const subscriptionInfo = await getUserSubscriptionInfo(
				ctx.db,
				ctx.session.user.id,
			);

			const usage = await getDailyBotUsage(ctx.db, ctx.session.user.id, date);

			const limit = subscriptionInfo.effectiveDailyLimit;
			const remaining = limit !== null ? Math.max(0, limit - usage) : null;

			return {
				usage,
				limit,
				date: date.toISOString().split("T")[0],
				remaining,
			};
		}),
});
