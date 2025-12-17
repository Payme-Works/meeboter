"use client";

import { Activity, Bot, File, Key } from "lucide-react";
import ErrorAlert from "@/components/custom/error-alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";

import DashboardCard from "./dashboard-card";

export default function Dashboard() {
	const { data: session } = useSession();
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const {
		data: activeBotCount,
		isLoading: activeBotCountLoading,
		error: activeBotCountError,
	} = api.bots.getActiveBotCount.useQuery();

	const {
		data: keyCount,
		isLoading: keyCountLoading,
		error: keyCountError,
	} = api.apiKeys.getApiKeyCount.useQuery();

	const { data: dailyUsage, isLoading: usageLoading } =
		api.bots.getDailyUsage.useQuery({
			timeZone: userTimezone,
		});

	const usagePercentage =
		dailyUsage?.limit && dailyUsage?.usage
			? Math.min((dailyUsage.usage / dailyUsage.limit) * 100, 100)
			: 0;

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
				<DashboardCard
					title="Active Bots"
					className="h-full min-h-56"
					content={
						activeBotCountLoading ? (
							<Skeleton className="h-10 w-10" />
						) : activeBotCountError ? (
							<div className="text-4xl font-bold">
								<ErrorAlert errorMessage={activeBotCountError.message} />
							</div>
						) : (
							<div className="text-4xl font-bold">{activeBotCount?.count}</div>
						)
					}
					icon={<Bot />}
					link={{
						type: "INTERNAL",
						url: "/bots",
						text: "View Bots",
					}}
				/>

				<DashboardCard
					title="Active Keys"
					className="h-full min-h-56"
					content={
						keyCountLoading ? (
							<Skeleton className="h-10 w-10" />
						) : keyCountError ? (
							<div className="text-4xl font-bold">
								<ErrorAlert errorMessage={keyCountError.message} />
							</div>
						) : (
							<div className="text-4xl font-bold">{keyCount?.count}</div>
						)
					}
					icon={<Key />}
					link={{
						type: "INTERNAL",
						url: "/api-keys",
						text: "View API Keys",
					}}
				/>

				<DashboardCard
					title="Today's Usage"
					className="h-full min-h-56"
					content={
						usageLoading ? (
							<div className="space-y-2">
								<Skeleton className="h-10 w-20" />
								<Skeleton className="h-2 w-full" />
							</div>
						) : (
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
						)
					}
					icon={<Activity />}
					link={{
						type: "INTERNAL",
						url: "/usage",
						text: "View Usage",
					}}
				/>

				<DashboardCard
					title="Documentation"
					className="h-full min-h-56"
					content="Learn how to create bots, integrate with meetings, and boost engagement."
					icon={<File className="text-muted-foreground" />}
					link={{
						type: "INTERNAL",
						url: "/docs",
						text: "View Docs",
					}}
				/>
			</div>
		</div>
	);
}
