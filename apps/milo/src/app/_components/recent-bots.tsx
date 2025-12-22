"use client";

import { formatDistanceToNow } from "date-fns";
import { Bot, ChevronRight, Circle, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { BotDetailsDialog } from "../bots/_components/bot-details-dialog";
import { CancelDeploymentDialog } from "../bots/_components/cancel-deployment-dialog";
import { RemoveFromCallDialog } from "../bots/_components/remove-from-call-dialog";

const STATUS_COLORS: Record<string, string> = {
	JOINING_CALL: "text-amber-500",
	IN_CALL: "text-green-500",
	RECORDING: "text-red-500",
	LEAVING: "text-orange-500",
	CALL_ENDED: "text-muted-foreground",
	FATAL: "text-destructive",
	DEPLOYING: "text-blue-500",
	CREATED: "text-muted-foreground",
};

const ACTIVE_STATUSES = [
	"IN_CALL",
	"RECORDING",
	"LEAVING",
	"IN_WAITING_ROOM",
	"JOINING_CALL",
	"DEPLOYING",
];

const REMOVABLE_STATUSES = ["IN_WAITING_ROOM", "IN_CALL", "RECORDING"];

function getStatusPriority(status: string): number {
	const index = ACTIVE_STATUSES.indexOf(status);

	return index === -1 ? ACTIVE_STATUSES.length : index;
}

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
		.join(" ");
}

export function RecentBots() {
	const { data: botsResponse, isLoading } = api.bots.getBots.useQuery({
		page: 1,
		pageSize: 10,
	});

	const bots = botsResponse?.data ?? [];

	const [selectedBot, setSelectedBot] = useState<number | null>(null);

	const [botToRemove, setBotToRemove] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const [botToCancel, setBotToCancel] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const sortedBots = useMemo(() => {
		return [...bots].sort((a, b) => {
			const priorityA = getStatusPriority(a.status);
			const priorityB = getStatusPriority(b.status);

			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
			const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

			return dateB - dateA;
		});
	}, [bots]);

	if (isLoading) {
		return <RecentBotsSkeleton />;
	}

	const recentBots = sortedBots.slice(0, 8);

	const hasActiveBots = bots.some((bot) =>
		["JOINING_CALL", "IN_CALL", "RECORDING", "DEPLOYING"].includes(bot.status),
	);

	return (
		<div className="border bg-card h-full flex flex-col min-h-[400px]">
			<div className="p-4 border-b flex items-center justify-between">
				<div className="flex items-center gap-3">
					<h3 className="font-semibold">Recent Bots</h3>

					{hasActiveBots && (
						<Badge
							variant="secondary"
							className="bg-green-500/10 text-green-600 border-green-500/20"
						>
							<Circle className="h-2! w-2! fill-current mr-1" />
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

							const canRemove = REMOVABLE_STATUSES.includes(bot.status);
							const canCancel = bot.status === "DEPLOYING";

							return (
								<div
									key={bot.id}
									className="group p-4 hover:bg-muted/50 transition-colors cursor-pointer"
									onClick={() => setSelectedBot(bot.id)}
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

										{canRemove ? (
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white hover:bg-destructive"
												onClick={(e) => {
													e.stopPropagation();

													setBotToRemove({
														id: bot.id,
														name: bot.botDisplayName,
													});
												}}
												title="Remove from Call"
											>
												<X className="h-4 w-4" />
											</Button>
										) : null}
										{canCancel ? (
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white hover:bg-destructive"
												onClick={(e) => {
													e.stopPropagation();

													setBotToCancel({
														id: bot.id,
														name: bot.botDisplayName,
													});
												}}
												title="Cancel Deployment"
											>
												<X className="h-4 w-4" />
											</Button>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<RemoveFromCallDialog
				botId={botToRemove?.id ?? null}
				botName={botToRemove?.name ?? ""}
				open={!!botToRemove}
				onOpenChange={(open) => {
					if (!open) setBotToRemove(null);
				}}
			/>

			<CancelDeploymentDialog
				botId={botToCancel?.id ?? null}
				botName={botToCancel?.name ?? ""}
				open={!!botToCancel}
				onOpenChange={(open) => {
					if (!open) setBotToCancel(null);
				}}
			/>

			<BotDetailsDialog
				botId={selectedBot}
				onClose={() => setSelectedBot(null)}
			/>
		</div>
	);
}

export function RecentBotsSkeleton() {
	return (
		<div className="border bg-card h-full flex flex-col min-h-[400px]">
			<div className="p-4 border-b flex items-center justify-between">
				<h3 className="font-semibold">Recent Bots</h3>
				<Skeleton className="h-5 w-16" />
			</div>

			<div className="flex-1">
				<div className="divide-y">
					{Array.from({ length: 8 }, (_, index) => (
						<div key={index} className="p-4">
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 shrink-0" />
								<div className="flex-1 min-w-0 space-y-1.5">
									<div className="flex items-center gap-2">
										<Skeleton className="h-[18px] w-24" />
										<Skeleton className="h-[14px] w-16" />
									</div>
									<Skeleton className="h-[14px] w-28" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
