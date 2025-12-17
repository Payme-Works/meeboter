"use client";

import { formatDistanceToNow } from "date-fns";
import { Bot, ChevronRight, Circle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

const STATUS_COLORS: Record<string, string> = {
	JOINING_CALL: "text-amber-500",
	IN_CALL: "text-green-500",
	RECORDING: "text-red-500",
	CALL_ENDED: "text-muted-foreground",
	FATAL: "text-destructive",
	DEPLOYING: "text-blue-500",
	CREATED: "text-muted-foreground",
};

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
		.join(" ");
}

export function RecentBots() {
	const { data: bots = [], isLoading } = api.bots.getBots.useQuery();

	if (isLoading) {
		return <RecentBotsSkeleton />;
	}

	const recentBots = bots.slice(0, 5);

	const hasActiveBots = bots.some((bot) =>
		["JOINING_CALL", "IN_CALL", "RECORDING", "DEPLOYING"].includes(bot.status),
	);

	return (
		<div className="border bg-card h-full flex flex-col">
			<div className="p-4 border-b flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h3 className="font-semibold">Recent Bots</h3>
					{hasActiveBots && (
						<Badge
							variant="secondary"
							className="bg-green-500/10 text-green-600 border-green-500/20"
						>
							<Circle className="h-2 w-2 fill-current mr-1" />
							Active
						</Badge>
					)}
				</div>

				<Link
					href="/bots"
					className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
				>
					View all
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>

			<div className="flex-1 overflow-auto">
				{recentBots.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full py-8 text-center">
						<div className="h-12 w-12 bg-muted flex items-center justify-center mb-3">
							<Bot className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm text-muted-foreground">
							No bots deployed yet
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							Deploy your first bot using the form above
						</p>
					</div>
				) : (
					<div className="divide-y">
						{recentBots.map((bot) => {
							const platform = bot.meetingInfo.platform;

							const statusColor =
								STATUS_COLORS[bot.status] || "text-muted-foreground";

							return (
								<div
									key={bot.id}
									className="p-4 hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-3">
										<div className="h-10 w-10 bg-muted flex items-center justify-center shrink-0">
											{typeof platform === "string" ? (
												<Image
													src={`/platform-logos/${platform}.svg`}
													alt={`${platform} logo`}
													width={20}
													height={20}
												/>
											) : (
												<Bot className="h-5 w-5 text-muted-foreground" />
											)}
										</div>

										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="font-medium text-sm truncate">
													{bot.botDisplayName}
												</span>
												<span
													className={`flex items-center gap-1 ${statusColor}`}
												>
													<Circle className="h-2 w-2 fill-current" />
													<span className="text-xs">
														{formatStatus(bot.status)}
													</span>
												</span>
											</div>

											<div className="text-xs text-muted-foreground mt-0.5">
												{typeof platform === "string"
													? platform.charAt(0).toUpperCase() + platform.slice(1)
													: "Unknown"}{" "}
												&middot;{" "}
												{bot.createdAt
													? formatDistanceToNow(new Date(bot.createdAt), {
															addSuffix: true,
														})
													: "Unknown"}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

export function RecentBotsSkeleton() {
	return (
		<div className="border bg-card h-full flex flex-col">
			<div className="p-4 border-b flex items-center justify-between">
				<Skeleton className="h-5 w-24" />
				<Skeleton className="h-4 w-16" />
			</div>

			<div className="flex-1">
				<div className="divide-y">
					{Array.from({ length: 5 }, () => Math.random()).map((key) => (
						<div key={key} className="p-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 shrink-0" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-24" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
