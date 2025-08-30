"use client";

import { Calendar, TrendingUp, Users, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

export function SubscriptionUsageSummary() {
	const { data: subscriptionInfo, isLoading: subLoading } =
		api.bots.getUserSubscription.useQuery();

	const { data: dailyUsage, isLoading: usageLoading } =
		api.bots.getDailyUsage.useQuery();

	if (subLoading || usageLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Card key={Math.random()}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">
								<Skeleton className="h-4 w-20" />
							</CardTitle>
							<Skeleton className="h-4 w-4" />
						</CardHeader>

						<CardContent>
							<Skeleton className="h-8 w-16 mb-2" />
							<Skeleton className="h-3 w-full" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	const formatPlanName = (plan: string) => {
		switch (plan) {
			case "FREE":
				return "Free";
			case "PRO":
				return "Pro";
			case "PAY_AS_YOU_GO":
				return "Pay-as-You-Go";
			case "CUSTOM":
				return "Enterprise";
			default:
				return plan;
		}
	};

	const getPlanBadgeVariant = (plan: string) => {
		switch (plan) {
			case "FREE":
				return "secondary" as const;
			case "PRO":
				return "default" as const;
			case "PAY_AS_YOU_GO":
				return "outline" as const;
			case "CUSTOM":
				return "destructive" as const;
			default:
				return "secondary" as const;
		}
	};

	const usagePercentage =
		subscriptionInfo?.effectiveDailyLimit && dailyUsage?.usage
			? Math.min(
					(dailyUsage.usage / subscriptionInfo.effectiveDailyLimit) * 100,
					100,
				)
			: 0;

	const formatLimit = (limit: number | null) => {
		return limit === null ? "Unlimited" : limit.toString();
	};

	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			{/* Current Plan */}
			<Card className="justify-between">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Current Plan</CardTitle>
					<Users className="h-4 w-4 text-muted-foreground" />
				</CardHeader>

				<CardContent>
					<div className="text-2xl font-bold mb-2">
						{subscriptionInfo
							? formatPlanName(subscriptionInfo.currentPlan)
							: "Loading..."}
					</div>
					{subscriptionInfo && (
						<Badge variant={getPlanBadgeVariant(subscriptionInfo.currentPlan)}>
							{subscriptionInfo.subscriptionActive ? "Active" : "Inactive"}
						</Badge>
					)}
				</CardContent>
			</Card>

			{/* Daily Limit */}
			<Card className="justify-between">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Daily Bot Limit</CardTitle>
					<Zap className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{subscriptionInfo
							? formatLimit(subscriptionInfo.effectiveDailyLimit)
							: "Loading..."}
					</div>
					{subscriptionInfo?.customDailyBotLimit && (
						<Badge variant="outline" className="text-xs">
							Custom Override
						</Badge>
					)}
				</CardContent>
			</Card>

			{/* Today's Usage */}
			<Card className="justify-between">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Today's Usage</CardTitle>
					<Calendar className="h-4 w-4 text-muted-foreground" />
				</CardHeader>

				<CardContent>
					<div className="text-2xl font-bold">
						{dailyUsage
							? `${dailyUsage.usage}/${formatLimit(dailyUsage.limit)}`
							: "0/0"}
					</div>

					{subscriptionInfo?.effectiveDailyLimit && (
						<div className="mt-2">
							<Progress value={usagePercentage} className="h-2" />

							<p className="text-xs text-muted-foreground mt-1">
								{Math.round(usagePercentage)}% used
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Remaining Bots */}
			<Card className="justify-between">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-sm font-medium">Remaining Today</CardTitle>
					<TrendingUp className="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="text-2xl font-bold">
						{dailyUsage?.remaining !== null
							? dailyUsage?.remaining || 0
							: "Unlimited"}
					</div>
					<p className="text-xs text-muted-foreground">
						{dailyUsage?.remaining !== null &&
						dailyUsage?.remaining !== undefined &&
						dailyUsage.remaining > 0
							? "Bots available"
							: dailyUsage?.remaining === 0
								? "Limit reached"
								: "No daily limits"}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
