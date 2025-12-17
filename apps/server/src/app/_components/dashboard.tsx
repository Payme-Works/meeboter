"use client";

import { Activity, Bot, File, Key } from "lucide-react";
import ErrorAlert from "@/components/custom/error-alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";

import {
	DashboardCard,
	DashboardCardContent,
	DashboardCardHeader,
	DashboardCardLink,
	DashboardCardTitleRow,
} from "./dashboard-card";

function ActiveBotsContent() {
	const {
		data: activeBotCount,
		isLoading,
		error,
	} = api.bots.getActiveBotCount.useQuery();

	if (isLoading) {
		return <Skeleton className="h-10 w-10" />;
	}

	if (error) {
		return <ErrorAlert errorMessage={error.message} />;
	}

	return <div className="text-4xl font-bold">{activeBotCount?.count}</div>;
}

function ActiveKeysContent() {
	const {
		data: keyCount,
		isLoading,
		error,
	} = api.apiKeys.getApiKeyCount.useQuery();

	if (isLoading) {
		return <Skeleton className="h-10 w-10" />;
	}

	if (error) {
		return <ErrorAlert errorMessage={error.message} />;
	}

	return <div className="text-4xl font-bold">{keyCount?.count}</div>;
}

function TodayUsageContent() {
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const { data: dailyUsage, isLoading } = api.bots.getDailyUsage.useQuery({
		timeZone: userTimezone,
	});

	if (isLoading) {
		return (
			<div className="space-y-2">
				<Skeleton className="h-10 w-20" />
				<Skeleton className="h-2 w-full" />
			</div>
		);
	}

	const usagePercentage =
		dailyUsage?.limit && dailyUsage?.usage
			? Math.min((dailyUsage.usage / dailyUsage.limit) * 100, 100)
			: 0;

	return (
		<div className="space-y-2">
			<div className="text-4xl font-bold">
				{dailyUsage?.usage ?? 0}
				<span className="text-lg text-muted-foreground font-normal">
					/{dailyUsage?.limit ?? "∞"}
				</span>
			</div>

			{dailyUsage?.limit && (
				<div>
					<Progress value={usagePercentage} className="h-2" />

					<p className="text-xs text-muted-foreground mt-1">
						{Math.round(usagePercentage)}% of daily limit
					</p>
				</div>
			)}
		</div>
	);
}

export default function Dashboard() {
	const { data: session } = useSession();

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
				</h1>
				<p className="mt-2 text-muted-foreground">
					Deploy intelligent bots to boost engagement and participation across
					video meetings.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
				<DashboardCard className="min-h-56">
					<DashboardCardHeader>
						<DashboardCardTitleRow icon={<Bot />}>
							Active Bots
						</DashboardCardTitleRow>
					</DashboardCardHeader>

					<DashboardCardContent>
						<ActiveBotsContent />
					</DashboardCardContent>

					<DashboardCardLink href="/bots">View Bots</DashboardCardLink>
				</DashboardCard>

				<DashboardCard className="min-h-56">
					<DashboardCardHeader>
						<DashboardCardTitleRow icon={<Key />}>
							Active Keys
						</DashboardCardTitleRow>
					</DashboardCardHeader>

					<DashboardCardContent>
						<ActiveKeysContent />
					</DashboardCardContent>

					<DashboardCardLink href="/api-keys">View API Keys</DashboardCardLink>
				</DashboardCard>

				<DashboardCard className="min-h-56">
					<DashboardCardHeader>
						<DashboardCardTitleRow icon={<Activity />}>
							Today's Usage
						</DashboardCardTitleRow>
					</DashboardCardHeader>

					<DashboardCardContent>
						<TodayUsageContent />
					</DashboardCardContent>

					<DashboardCardLink href="/usage">View Usage</DashboardCardLink>
				</DashboardCard>

				<DashboardCard className="min-h-56">
					<DashboardCardHeader>
						<DashboardCardTitleRow
							icon={<File className="text-muted-foreground" />}
						>
							Documentation
						</DashboardCardTitleRow>
					</DashboardCardHeader>

					<DashboardCardContent>
						Learn how to create bots, integrate with meetings, and boost
						engagement.
					</DashboardCardContent>

					<DashboardCardLink href="/docs">View Docs</DashboardCardLink>
				</DashboardCard>
			</div>
		</div>
	);
}
