import { addDays, addHours, startOfMonth, startOfWeek } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { botsTable } from "@/server/database/schema";

// Interface matching dailyUsageSchema exactly
interface DayUsage {
	date: string;
	botsUsed: number;
	msEllapsed: number;
	estimatedCost: string;
}

export const dailyUsageSchema = z.object({
	date: z.string(),
	msEllapsed: z.number(),
	estimatedCost: z.string(),
	botsUsed: z.number(),
});

export type DailyUsageType = z.infer<typeof dailyUsageSchema>;

const formatDayUsageDictToOutput = (eventsByDate: Record<string, DayUsage>) => {
	// Create Output Object (list of dates)
	const outputObject = Object.values(eventsByDate);

	// The estimatedCost is already a string, so we don't need to convert it
	// Sort output keys (date)
	return outputObject.sort(
		(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
	);
};

export const usageRouter = createTRPCRouter({
	getAllUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/usage",
				description:
					"Retreive a sorted list of daily bot usage over all time\n",
			},
		})
		.input(z.void())
		.output(z.array(dailyUsageSchema))
		.query(async ({ ctx }) => {
			// Get all bots timestamp
			const userBots = await ctx.db
				.select({
					startTime: botsTable.startTime,
					endTime: botsTable.endTime,
					lastHeartbeat: botsTable.lastHeartbeat,
					id: botsTable.id,
				})
				.from(botsTable)
				.where(eq(botsTable.userId, ctx.session.user.id));

			// Collect the Bot Id's.
			const botIds = userBots.map((bot) => bot.id);

			if (botIds.length === 0) {
				return [];
			}

			// Ensure botId is defined before using it in the query
			const botId = botIds[0];

			if (botId === undefined) {
				throw new Error("Bot not found");
			}

			// Create a list of days
			const eventsByDate: Record<string, DayUsage> = {};

			userBots.forEach((bot) => {
				// Get the start date in UTC
				const startDate = bot.startTime.toISOString().split("T")[0];

				// Initialize this date if it doesn't exist
				if (startDate && !eventsByDate[startDate]) {
					eventsByDate[startDate] = {
						date: startDate,
						botsUsed: 0,
						msEllapsed: 0,
						estimatedCost: "0",
					};
				}

				// Calculate bot elapsed time - use endTime, lastHeartbeat, or current time
				const endTime = bot.endTime || bot.lastHeartbeat || new Date();
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Only count positive elapsed time
				if (botElapsed > 0 && startDate && eventsByDate[startDate]) {
					eventsByDate[startDate].msEllapsed += botElapsed;
					eventsByDate[startDate].botsUsed += 1;
				}
			});

			// Create Output Object (list of dates)
			let outputObject = Object.values(eventsByDate);

			// Alter to include a cost variable
			outputObject = outputObject.map((d) => {
				return {
					...d,
					estimatedCost: (d.msEllapsed / 36000000).toFixed(2),
				};
			});

			// Sort by keys
			outputObject = outputObject.sort(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
			);

			return outputObject;
		}),

	getDailyUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/usage/daily",
				description:
					"Retrieve hourly bot usage for the last 24 hours. Empty hours will be reported as well.\n",
			},
		})
		.input(
			z
				.object({
					timeZone: z.string().default("UTC"), // IANA timezone (e.g., "America/Sao_Paulo")
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timeZone = input?.timeZone || "UTC";

			// Get current time in user's timezone
			const nowUTC = new Date();
			const nowInUserTimeZone = toZonedTime(nowUTC, timeZone);

			// Calculate 24 hours ago in user's timezone
			const twentyFourHoursAgoInUserTimeZone = new Date(
				nowInUserTimeZone.getTime() - 24 * 60 * 60 * 1000,
			);

			// Convert back to UTC for database queries
			const startTimeUTC = fromZonedTime(
				twentyFourHoursAgoInUserTimeZone,
				timeZone,
			);

			const endTimeUTC = fromZonedTime(nowInUserTimeZone, timeZone);

			// Get all bots for the last 24 hours
			const userBots = await ctx.db
				.select({
					startTime: botsTable.startTime,
					endTime: botsTable.endTime,
					lastHeartbeat: botsTable.lastHeartbeat,
					id: botsTable.id,
				})
				.from(botsTable)
				.where(
					and(
						eq(botsTable.userId, ctx.session.user.id),
						gte(botsTable.startTime, startTimeUTC),
						lt(botsTable.startTime, endTimeUTC),
					),
				);

			// Generate 24 hour buckets starting from 24 hours ago
			const eventsByHour: Record<string, DayUsage> = {};

			for (let i = 0; i < 24; i++) {
				const hourStartUTC = addHours(startTimeUTC, i);

				const dateString =
					hourStartUTC.toISOString().slice(0, 13) + ":00:00.000Z";

				eventsByHour[dateString] = {
					date: dateString,
					botsUsed: 0,
					msEllapsed: 0,
					estimatedCost: "0",
				};
			}

			// Process each bot
			userBots.forEach((bot) => {
				// Find which hour bucket this bot belongs to
				const botStartHour = new Date(bot.startTime);
				botStartHour.setMinutes(0, 0, 0);

				const dateString =
					botStartHour.toISOString().slice(0, 13) + ":00:00.000Z";

				// Calculate bot elapsed time
				const endTime = bot.endTime || bot.lastHeartbeat || nowUTC;
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Add to the appropriate hour bucket
				if (eventsByHour[dateString] && botElapsed > 0) {
					eventsByHour[dateString].msEllapsed += botElapsed;
					eventsByHour[dateString].botsUsed += 1;

					const currentCost = parseFloat(
						eventsByHour[dateString].estimatedCost,
					);

					eventsByHour[dateString].estimatedCost = (
						currentCost +
						botElapsed / 36000000
					).toFixed(2);
				}
			});

			return formatDayUsageDictToOutput(eventsByHour);
		}),

	getWeekDailyUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/usage/week",
				description:
					"Retrieve a list of daily bot usage over the last week. Empty days will be reported as well.\n",
			},
		})
		.input(
			z
				.object({
					timeZone: z.string().default("UTC"), // IANA timezone
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timeZone = input?.timeZone || "UTC";

			// Get current time and convert to user's timezone
			const now = new Date();
			const nowZoned = toZonedTime(now, timeZone);

			// Get start of week in user's timezone
			const startOfWeekZoned = startOfWeek(nowZoned, { weekStartsOn: 0 }); // Sunday start

			// Convert to UTC for database query
			const startOfWeekUTC = fromZonedTime(startOfWeekZoned, timeZone);

			// Get all bots for this week
			const userBots = await ctx.db
				.select({
					startTime: botsTable.startTime,
					endTime: botsTable.endTime,
					lastHeartbeat: botsTable.lastHeartbeat,
					id: botsTable.id,
				})
				.from(botsTable)
				.where(
					and(
						eq(botsTable.userId, ctx.session.user.id),
						gte(botsTable.startTime, startOfWeekUTC),
					),
				);

			// Generate 7 day buckets based on user's timezone days
			const eventsByDate: Record<string, DayUsage> = {};

			for (let i = 0; i < 7; i++) {
				// Add days in user's timezone to maintain proper date boundaries
				const dayInUserTz = addDays(startOfWeekZoned, i);
				// Convert to UTC date string format for consistent API response
				const dateString = dayInUserTz.toISOString().split("T")[0];

				eventsByDate[dateString] = {
					date: dateString,
					botsUsed: 0,
					msEllapsed: 0,
					estimatedCost: "0",
				};
			}

			// Process each bot
			userBots.forEach((bot) => {
				// Get the date in UTC for bucketing
				const botStartDate = new Date(bot.startTime);
				const startDate = botStartDate.toISOString().split("T")[0];

				// Calculate bot elapsed time
				const endTime = bot.endTime || bot.lastHeartbeat || now;
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Add to the appropriate day bucket
				if (startDate && eventsByDate[startDate] && botElapsed > 0) {
					eventsByDate[startDate].msEllapsed += botElapsed;
					eventsByDate[startDate].botsUsed += 1;

					const currentCost = parseFloat(eventsByDate[startDate].estimatedCost);

					eventsByDate[startDate].estimatedCost = (
						currentCost +
						botElapsed / 36000000
					).toFixed(2);
				}
			});

			return formatDayUsageDictToOutput(eventsByDate);
		}),

	getMonthDailyUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/usage/month",
				description:
					"Retreive a list of daily bot usage over the last month. Empty days will be reported as well.\n",
			},
		})
		.input(
			z
				.object({
					timeZone: z.string().default("UTC"), // IANA timezone
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timeZone = input?.timeZone || "UTC";

			// Get current time and convert to user's timezone
			const now = new Date();
			const nowZoned = toZonedTime(now, timeZone);

			// Get start of month in user's timezone
			const startOfMonthZoned = startOfMonth(nowZoned);

			// Convert to UTC for database query
			const startOfMonthUTC = fromZonedTime(startOfMonthZoned, timeZone);

			// Get all bots for this month
			const userBots = await ctx.db
				.select({
					startTime: botsTable.startTime,
					endTime: botsTable.endTime,
					lastHeartbeat: botsTable.lastHeartbeat,
					id: botsTable.id,
				})
				.from(botsTable)
				.where(
					and(
						eq(botsTable.userId, ctx.session.user.id),
						gte(botsTable.startTime, startOfMonthUTC),
					),
				);

			// Calculate days in month
			const endOfMonthZoned = new Date(
				nowZoned.getFullYear(),
				nowZoned.getMonth() + 1,
				0,
			);

			const daysInMonth = endOfMonthZoned.getDate();

			// Generate day buckets in UTC
			const eventsByDate: Record<string, DayUsage> = {};

			for (let i = 0; i < daysInMonth; i++) {
				const dayUTC = addDays(startOfMonthUTC, i);
				const dateString = dayUTC.toISOString().split("T")[0];

				eventsByDate[dateString] = {
					date: dateString,
					botsUsed: 0,
					msEllapsed: 0,
					estimatedCost: "0",
				};
			}

			// Process each bot
			userBots.forEach((bot) => {
				// Get the date in UTC for bucketing
				const botStartDate = new Date(bot.startTime);
				const startDate = botStartDate.toISOString().split("T")[0];

				// Calculate bot elapsed time
				const endTime = bot.endTime || bot.lastHeartbeat || now;
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Add to the appropriate day bucket
				if (startDate && eventsByDate[startDate] && botElapsed > 0) {
					eventsByDate[startDate].msEllapsed += botElapsed;
					eventsByDate[startDate].botsUsed += 1;

					const currentCost = parseFloat(eventsByDate[startDate].estimatedCost);

					eventsByDate[startDate].estimatedCost = (
						currentCost +
						botElapsed / 36000000
					).toFixed(2);
				}
			});

			return formatDayUsageDictToOutput(eventsByDate);
		}),
});
