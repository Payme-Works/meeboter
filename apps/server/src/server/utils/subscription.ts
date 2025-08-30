import { and, desc, eq, gte, lt } from "drizzle-orm";
import { FREE_PLAN, SUBSCRIPTION_PLANS } from "@/constants/subscription-plans";
import type { db } from "@/server/database/db";
import {
	botsTable,
	type Subscription,
	subscriptionsTable,
	usersTable,
} from "@/server/database/schema";

type Database = typeof db;

export interface UserSubscriptionInfo {
	userId: string;
	currentPlan: Subscription | "FREE";
	dailyBotLimit: number | null;
	customDailyBotLimit: number | null;
	effectiveDailyLimit: number | null;
	subscriptionActive: boolean;
	subscriptionEndDate: Date | null;
}

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

export async function getDailyBotUsage(
	db: Database,
	userId: string,
	date = new Date(),
	timezoneOffset = 0,
): Promise<number> {
	// Calculate date range in user's timezone
	const localDate = new Date(date.getTime() - timezoneOffset * 60000);

	const startOfDay = new Date(
		localDate.getFullYear(),
		localDate.getMonth(),
		localDate.getDate(),
	);

	const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

	// Convert back to UTC for database query
	const startOfDayUTC = new Date(startOfDay.getTime() + timezoneOffset * 60000);
	const endOfDayUTC = new Date(endOfDay.getTime() + timezoneOffset * 60000);

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

export async function validateBotCreation(
	db: Database,
	userId: string,
	timezoneOffset = 0,
): Promise<{
	allowed: boolean;
	reason?: string;
	usage?: number;
	limit?: number | null;
}> {
	try {
		const subscriptionInfo = await getUserSubscriptionInfo(db, userId);

		const todayUsage = await getDailyBotUsage(
			db,
			userId,
			new Date(),
			timezoneOffset,
		);

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
