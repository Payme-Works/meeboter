"use client";

import { Activity, Bot, ChevronRight, File, Key } from "lucide-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import { QuickBotJoin, QuickBotJoinSkeleton } from "./quick-bot-join";
import { RecentBots, RecentBotsSkeleton } from "./recent-bots";

function StatCard({
	icon,
	label,
	value,
	href,
	linkText,
	children,
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
	href: string;
	linkText: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="border bg-card p-4 flex flex-col h-full">
			<div className="flex items-center justify-between mb-3">
				<div className="h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground">
					{icon}
				</div>
				<span className="text-xs text-muted-foreground">{label}</span>
			</div>

			<div className="text-3xl font-bold tabular-nums mb-1">{value}</div>

			{children && <div className="flex-1 mb-3">{children}</div>}

			<div className="mt-auto pt-3 border-t">
				<Link
					href={href}
					className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
				>
					{linkText}
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>
		</div>
	);
}

function StatCardSkeleton() {
	return (
		<div className="border bg-card p-4 flex flex-col h-full">
			<div className="flex items-center justify-between mb-3">
				<Skeleton className="h-10 w-10" />
				<Skeleton className="h-3 w-16" />
			</div>
			<Skeleton className="h-9 w-16 mb-3" />
			<div className="mt-auto pt-3 border-t">
				<Skeleton className="h-4 w-20" />
			</div>
		</div>
	);
}

function ActiveBotsContent() {
	const { data: activeBotCount, isLoading } =
		api.bots.getActiveBotCount.useQuery();

	if (isLoading) {
		return <Skeleton className="h-9 w-12" />;
	}

	return <>{activeBotCount?.count ?? 0}</>;
}

function ActiveKeysContent() {
	const { data: keyCount, isLoading } = api.apiKeys.getApiKeyCount.useQuery();

	if (isLoading) {
		return <Skeleton className="h-9 w-12" />;
	}

	return <>{keyCount?.count ?? 0}</>;
}

function TodayUsageContent() {
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const { data: dailyUsage, isLoading } = api.bots.getDailyUsage.useQuery({
		timeZone: userTimezone,
	});

	if (isLoading) {
		return {
			value: <Skeleton className="h-9 w-20" />,
			extra: null,
		};
	}

	const usage = dailyUsage?.usage ?? 0;
	const limit = dailyUsage?.limit;
	const isUnlimited = limit === null;

	const usagePercentage =
		limit && usage ? Math.min((usage / limit) * 100, 100) : 0;

	return {
		value: (
			<>
				{usage}
				<span className="text-lg text-muted-foreground font-normal ml-1">
					/{isUnlimited ? "∞" : limit}
				</span>
			</>
		),
		extra: !isUnlimited && (
			<div className="space-y-1">
				<Progress value={usagePercentage} className="h-1.5" />
				<p className="text-xs text-muted-foreground">
					{Math.round(usagePercentage)}% of daily limit
				</p>
			</div>
		),
	};
}

function TodayUsageCard() {
	const usageData = TodayUsageContent();

	return (
		<StatCard
			icon={<Activity className="h-5 w-5" />}
			label="Today's Usage"
			value={usageData.value}
			href="/usage"
			linkText="View Usage"
		>
			{usageData.extra}
		</StatCard>
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
					Deploy intelligent bots to boost engagement and productivity in your
					meetings.
				</p>
			</div>

			<QuickBotJoin />

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<RecentBots />
				</div>

				<div className="grid gap-4">
					<div className="grid grid-cols-2 gap-4">
						<StatCard
							icon={<Bot className="h-5 w-5" />}
							label="Active Bots"
							value={<ActiveBotsContent />}
							href="/bots"
							linkText="View Bots"
						/>

						<StatCard
							icon={<Key className="h-5 w-5" />}
							label="API Keys"
							value={<ActiveKeysContent />}
							href="/api-keys"
							linkText="Manage Keys"
						/>
					</div>

					<TodayUsageCard />

					<StatCard
						icon={<File className="h-5 w-5" />}
						label="Resources"
						value="Docs"
						href="/docs"
						linkText="View Docs"
					>
						<p className="text-sm text-muted-foreground">
							Learn how to integrate bots and configure interactions.
						</p>
					</StatCard>
				</div>
			</div>
		</div>
	);
}

export function DashboardSkeleton() {
	return (
		<div className="space-y-8">
			<div>
				<Skeleton className="h-9 w-72" />
				<Skeleton className="mt-2 h-5 w-96" />
			</div>

			<QuickBotJoinSkeleton />

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<RecentBotsSkeleton />
				</div>

				<div className="grid gap-4">
					<div className="grid grid-cols-2 gap-4">
						<StatCardSkeleton />
						<StatCardSkeleton />
					</div>
					<StatCardSkeleton />
					<StatCardSkeleton />
				</div>
			</div>
		</div>
	);
}
