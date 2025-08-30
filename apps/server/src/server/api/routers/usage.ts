import { and, eq, gte } from "drizzle-orm";
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
				// Get the start date
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

			// Passback List of values
			console.log(outputObject);

			return outputObject;
		}),

	getDailyUsage: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/usage/daily",
				description:
					"Retrieve hourly bot usage for today. Empty hours will be reported as well.\n",
			},
		})
		.input(
			z
				.object({
					timezoneOffset: z
						.string()
						.transform((val) => Number(val))
						.optional()
						.default(0), // minutes offset from UTC
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timezoneOffset = input?.timezoneOffset || 0;

			// Calculate start of today in user's timezone
			const now = new Date();

			const localNow = new Date(now.getTime() - timezoneOffset * 60000);

			const startOfDay = new Date(
				localNow.getFullYear(),
				localNow.getMonth(),
				localNow.getDate(),
			);

			const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

			// Convert back to UTC for database query
			const startOfDayUTC = new Date(
				startOfDay.getTime() + timezoneOffset * 60000,
			);

			const endOfDayUTC = new Date(endOfDay.getTime() + timezoneOffset * 60000);

			// Get all bots for today
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
						gte(botsTable.startTime, startOfDayUTC),
					),
				);

			// Populate entries for each hour of the day (24 hours)
			const eventsByHour: Record<string, DayUsage> = {};
			for (let i = 0; i < 24; i++) {
				const hourStart = new Date(startOfDay.getTime() + i * 60 * 60 * 1000);
				const dateString = hourStart.toISOString().slice(0, 13) + ":00:00.000Z";

				eventsByHour[dateString] = {
					date: dateString,
					botsUsed: 0,
					msEllapsed: 0,
					estimatedCost: "0",
				};
			}

			userBots.forEach((bot) => {
				// Convert bot start time to user's timezone
				const botStartLocal = new Date(
					bot.startTime.getTime() - timezoneOffset * 60000,
				);

				const hourBucket = new Date(
					botStartLocal.getFullYear(),
					botStartLocal.getMonth(),
					botStartLocal.getDate(),
					botStartLocal.getHours(),
					0,
					0,
					0,
				);

				// Convert back to UTC format for the key
				const hourBucketUTC = new Date(
					hourBucket.getTime() + timezoneOffset * 60000,
				);

				const dateString =
					hourBucketUTC.toISOString().slice(0, 13) + ":00:00.000Z";

				// Calculate bot elapsed time
				const endTime = bot.endTime || bot.lastHeartbeat || now;
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
					"Retreive a list of daily bot usage over the last week. Empty days will be reported as well.\n",
			},
		})
		.input(
			z
				.object({
					timezoneOffset: z
						.string()
						.transform((val) => Number(val))
						.optional()
						.default(0), // minutes offset from UTC
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timezoneOffset = input?.timezoneOffset || 0;

			// Calculate start of this week in user's timezone
			const now = new Date();
			const localNow = new Date(now.getTime() - timezoneOffset * 60000);

			const startOfWeek = new Date(
				localNow.setDate(localNow.getDate() - localNow.getDay()),
			);

			// Convert to UTC for database query
			const startOfWeekUTC = new Date(
				startOfWeek.getTime() + timezoneOffset * 60000,
			);

			// Get all bots timestamp
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
						gte(botsTable.startTime, startOfWeekUTC), // After the beginning of the week
					),
				);

			// Populate entries for each day of the week, even if no data
			const eventsByDate: Record<string, DayUsage> = {};
			for (let i = 0; i < 7; i++) {
				const currentDate = new Date(
					startOfWeek.getTime() + i * 24 * 60 * 60 * 1000,
				);

				const dateString = currentDate.toISOString().split("T")[0];

				if (dateString && !eventsByDate[dateString]) {
					eventsByDate[dateString] = {
						date: dateString,
						botsUsed: 0,
						msEllapsed: 0,
						estimatedCost: "0",
					};
				}
			}

			userBots.forEach((bot) => {
				// Convert bot start time to user's timezone for date bucketing
				const botStartLocal = new Date(
					bot.startTime.getTime() - timezoneOffset * 60000,
				);

				const startDate = botStartLocal.toISOString().split("T")[0];

				// Calculate bot elapsed time - use endTime, lastHeartbeat, or current time
				const endTime = bot.endTime || bot.lastHeartbeat || now;
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Check if the date exists and elapsed time is positive
				if (startDate && eventsByDate[startDate] && botElapsed > 0) {
					eventsByDate[startDate].msEllapsed += botElapsed;
					eventsByDate[startDate].botsUsed += 1;
					// Convert to string when saving
					const currentCost = parseFloat(eventsByDate[startDate].estimatedCost);

					eventsByDate[startDate].estimatedCost = (
						currentCost +
						botElapsed / 36000000
					).toFixed(2);
				}
			});

			// Return proper format
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
					timezoneOffset: z
						.string()
						.transform((val) => Number(val))
						.optional()
						.default(0), // minutes offset from UTC
				})
				.optional(),
		)
		.output(z.array(dailyUsageSchema))
		.query(async ({ input, ctx }) => {
			const timezoneOffset = input?.timezoneOffset || 0;

			// Calculate start of this month in user's timezone
			const now = new Date();
			const localNow = new Date(now.getTime() - timezoneOffset * 60000);

			const startOfMonth = new Date(
				localNow.getFullYear(),
				localNow.getMonth(),
				1,
			);

			const endOfMonth = new Date(
				localNow.getFullYear(),
				localNow.getMonth() + 1,
				0,
			);

			const daysInMonth = endOfMonth.getDate();

			// Convert to UTC for database query
			const startOfMonthUTC = new Date(
				startOfMonth.getTime() + timezoneOffset * 60000,
			);

			// Get all bots timestamp
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
						gte(botsTable.startTime, startOfMonthUTC), // After the beginning of the month
					),
				);

			// Populate entries for each day of the month, even if no data
			const eventsByDate: Record<string, DayUsage> = {};

			for (let i = 0; i < daysInMonth; i++) {
				const currentDate = new Date(
					startOfMonth.getTime() + i * 24 * 60 * 60 * 1000,
				);

				const dateString = currentDate.toISOString().split("T")[0];

				if (dateString && !eventsByDate[dateString]) {
					eventsByDate[dateString] = {
						date: dateString,
						botsUsed: 0,
						msEllapsed: 0,
						estimatedCost: "0",
					};
				}
			}

			userBots.forEach((bot) => {
				// Convert bot start time to user's timezone for date bucketing
				const botStartLocal = new Date(
					bot.startTime.getTime() - timezoneOffset * 60000,
				);

				const startDate = botStartLocal.toISOString().split("T")[0];

				// Calculate bot elapsed time - use endTime, lastHeartbeat, or current time
				const endTime = bot.endTime || bot.lastHeartbeat || now;
				const botElapsed = endTime.getTime() - bot.startTime.getTime();

				// Check if the date exists and elapsed time is positive
				if (startDate && eventsByDate[startDate] && botElapsed > 0) {
					eventsByDate[startDate].msEllapsed += botElapsed;
					eventsByDate[startDate].botsUsed += 1;
					// Convert to string when saving
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
