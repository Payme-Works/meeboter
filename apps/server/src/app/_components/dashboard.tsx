"use client";

import { Bot, File, Key } from "lucide-react";
import ErrorAlert from "@/components/custom/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";

import DashboardCard from "./dashboard-card";

export default function Dashboard() {
	const { data: session } = useSession();

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

	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-3xl font-bold">
					Welcome to Live Boost
					{session?.user?.name ? `, ${session.user.name}` : ""}
				</h1>
				<p className="mt-2 text-gray-600">
					Easily create automated applications that leverage recordings across
					popular video meeting platforms.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
					title="View our Docs"
					className="h-full min-h-56"
					content="To learn more about how to create bots, pull meeting recordings, pull transcriptions and more, view our Documentation!"
					icon={<File className="text-slate-500" />}
					link={{
						type: "INTERNAL",
						url: "/docs",
						text: "View Documentation",
					}}
				/>
			</div>
		</div>
	);
}
