import { startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { FREE_PLAN, SUBSCRIPTION_PLANS } from "@/constants/subscription-plans";
import type { db } from "@/server/database/db";
import {
	botsTable,
	type Subscription,
	subscriptionsTable,
	usersTable,
} from "@/server/database/schema";

/**
 * Database type alias for subscription operations
 */
type Database = typeof db;

/**
 * User subscription information interface containing plan details and limits
 */
interface UserSubscriptionInfo {
	userId: string;
	currentPlan: Subscription | "FREE";
	dailyBotLimit: number | null;
	customDailyBotLimit: number | null;
	effectiveDailyLimit: number | null;
	subscriptionActive: boolean;
	subscriptionEndDate: Date | null;
}

/**
 * Retrieves subscription information for a user including plan details and limits
 *
 * @param db - The database instance
 * @param userId - The user ID to get subscription information for
 * @returns User subscription information including current plan and limits
 * @throws Error if the user is not found
 */
export async function getUserSubscriptionInfo(
	db: Database,
	userId: string,
): Promise<UserSubscriptionInfo> {
	// Get user info with custom limit
	const userResult = await db
		.select({
			customDailyBotLimit: usersTable.customDailyBotLimit,
		})
		.from(usersTable)
		.where(eq(usersTable.id, userId))
		.limit(1);

	if (!userResult[0]) {
		throw new Error("User not found");
	}

	const user = userResult[0];

	// Get current active subscription
	const subscriptionResult = await db
		.select({
			type: subscriptionsTable.type,
			isActive: subscriptionsTable.isActive,
			endDate: subscriptionsTable.endDate,
		})
		.from(subscriptionsTable)
		.where(
			and(
				eq(subscriptionsTable.userId, userId),
				eq(subscriptionsTable.isActive, true),
			),
		)
		.orderBy(desc(subscriptionsTable.startDate))
		.limit(1);

	// Default to FREE plan if no subscription found
	let currentPlan: Subscription | "FREE" = "FREE";
	let dailyBotLimit: number | null = FREE_PLAN.dailyBotLimit;
	let subscriptionActive = true;
	let subscriptionEndDate: Date | null = null;

	if (subscriptionResult[0]) {
		currentPlan = subscriptionResult[0].type;
		dailyBotLimit = SUBSCRIPTION_PLANS[currentPlan].dailyBotLimit;
		subscriptionActive = subscriptionResult[0].isActive;
		subscriptionEndDate = subscriptionResult[0].endDate;
	}

	// Determine effective daily limit
	const effectiveDailyLimit = user.customDailyBotLimit ?? dailyBotLimit;

	return {
		userId,
		currentPlan,
		dailyBotLimit,
		customDailyBotLimit: user.customDailyBotLimit,
		effectiveDailyLimit,
		subscriptionActive,
		subscriptionEndDate,
	};
}

/**
 * Calculates the daily bot usage for a user within a specific timezone
 *
 * @param db - The database instance
 * @param userId - The user ID to calculate usage for
 * @param date - The date to calculate usage for (defaults to current date)
 * @param timeZone - IANA timezone identifier (e.g., "America/Sao_Paulo", defaults to "UTC")
 * @returns The number of bots used on the specified date
 */
export async function getDailyBotUsage(
	db: Database,
	userId: string,
	date = new Date(),
	timeZone = "UTC",
): Promise<number> {
	// Convert current date to user's timezone
	const dateInUserTimeZone = toZonedTime(date, timeZone);

	// Get start of day in user's timezone
	const startOfDayInUserTimeZone = startOfDay(dateInUserTimeZone);

	// Convert start and end of day back to UTC for database query
	const startOfDayUTC = fromZonedTime(startOfDayInUserTimeZone, timeZone);
	const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000);

	const bots = await db
		.select()
		.from(botsTable)
		.where(
			and(
				eq(botsTable.userId, userId),
				gte(botsTable.startTime, startOfDayUTC),
				lt(botsTable.startTime, endOfDayUTC),
			),
		);

	return bots.length;
}

/**
 * Validates whether a user can create a new bot based on their subscription and daily limits
 *
 * @param db - The database instance
 * @param userId - The user ID to validate bot creation for
 * @param timeZone - IANA timezone identifier (e.g., "America/Sao_Paulo", defaults to "UTC")
 * @returns Validation result containing allowed status, reason, usage, and limit information
 */
export async function validateBotCreation(
	db: Database,
	userId: string,
	timeZone = "UTC",
): Promise<{
	allowed: boolean;
	reason?: string;
	usage?: number;
	limit?: number | null;
}> {
	try {
		const subscriptionInfo = await getUserSubscriptionInfo(db, userId);

		const todayUsage = await getDailyBotUsage(db, userId, new Date(), timeZone);

		// Check if subscription is active
		if (!subscriptionInfo.subscriptionActive) {
			return {
				allowed: false,
				reason: "Your subscription is not active",
			};
		}

		// Check if subscription has expired
		if (
			subscriptionInfo.subscriptionEndDate &&
			new Date() > subscriptionInfo.subscriptionEndDate
		) {
			return {
				allowed: false,
				reason: "Your subscription has expired",
			};
		}

		// Handle unlimited plans (null limit)
		if (subscriptionInfo.effectiveDailyLimit === null) {
			return {
				allowed: true,
				usage: todayUsage,
				limit: null,
			};
		}

		// Check daily limit
		if (todayUsage >= subscriptionInfo.effectiveDailyLimit) {
			return {
				allowed: false,
				reason: `Daily bot limit of ${subscriptionInfo.effectiveDailyLimit} bots exceeded. Current usage: ${todayUsage}`,
				usage: todayUsage,
				limit: subscriptionInfo.effectiveDailyLimit,
			};
		}

		// Handle pay-as-you-go (coming soon)
		if (subscriptionInfo.currentPlan === "PAY_AS_YOU_GO") {
			return {
				allowed: false,
				reason: "Pay-as-you-go plan is coming soon!",
			};
		}

		return {
			allowed: true,
			usage: todayUsage,
			limit: subscriptionInfo.effectiveDailyLimit,
		};
	} catch (error) {
		console.error("Error validating bot creation:", error);

		return {
			allowed: false,
			reason: "Error validating subscription. Please try again.",
		};
	}
}
