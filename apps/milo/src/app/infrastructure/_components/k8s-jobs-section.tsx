"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bot, Container, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

/** Refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL = 5000;

/**
 * Status badge for bot status
 */
function StatusBadge({ status }: { status: string }) {
	const config: Record<
		string,
		{ badge: string; color: string; bgColor: string }
	> = {
		DEPLOYING: {
			badge: "[DEPLOYING]",
			color: "text-blue-500",
			bgColor: "bg-blue-500/10",
		},
		JOINING_CALL: {
			badge: "[JOINING]",
			color: "text-amber-500",
			bgColor: "bg-amber-500/10",
		},
		IN_WAITING_ROOM: {
			badge: "[WAITING]",
			color: "text-amber-500",
			bgColor: "bg-amber-500/10",
		},
		IN_CALL: {
			badge: "[IN_CALL]",
			color: "text-green-500",
			bgColor: "bg-green-500/10",
		},
		LEAVING: {
			badge: "[LEAVING]",
			color: "text-muted-foreground",
			bgColor: "bg-muted",
		},
		DONE: {
			badge: "[DONE]",
			color: "text-muted-foreground",
			bgColor: "bg-muted",
		},
		FATAL: {
			badge: "[FATAL]",
			color: "text-destructive",
			bgColor: "bg-destructive/10",
		},
	};

	const statusConfig = config[status] ?? {
		badge: `[${status}]`,
		color: "text-muted-foreground",
		bgColor: "bg-muted",
	};

	return (
		<span
			className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-wider ${statusConfig.bgColor} ${statusConfig.color}`}
		>
			{statusConfig.badge}
		</span>
	);
}

/**
 * Card for displaying a bot running on Kubernetes
 */
function K8sBotCard({
	bot,
}: {
	bot: {
		id: number;
		status: string;
		displayName: string;
		createdAt: Date | null;
		platformIdentifier: string | null;
	};
}) {
	const jobName = bot.platformIdentifier ?? `bot-${bot.id}`;

	return (
		<div className="bg-card border border-border p-4 hover:border-accent/20 transition-colors">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<Bot className="h-4 w-4 text-muted-foreground" />
						<span className="font-mono text-sm font-semibold">
							Bot #{bot.id}
						</span>
						<StatusBadge status={bot.status} />
					</div>
					<p className="text-xs text-muted-foreground truncate">
						{bot.displayName}
					</p>
				</div>

				<Link
					href={`/bots/${bot.id}`}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					<ExternalLink className="h-4 w-4" />
				</Link>
			</div>

			<div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
				<div className="flex items-center gap-1.5">
					<Container className="h-3 w-3 text-muted-foreground" />
					<span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
						{jobName}
					</span>
				</div>

				{bot.createdAt ? (
					<span className="text-xs text-muted-foreground tabular-nums">
						{formatDistanceToNow(new Date(bot.createdAt), { addSuffix: true })}
					</span>
				) : null}
			</div>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div key={i} className="bg-card border border-border p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 space-y-2">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-48" />
						</div>
						<Skeleton className="h-4 w-4" />
					</div>
					<div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
						<Skeleton className="h-4 w-36" />
						<Skeleton className="h-4 w-20" />
					</div>
				</div>
			))}
		</div>
	);
}

/** Active bot statuses that indicate a running K8s job */
const ACTIVE_STATUSES = new Set([
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
]);

export function K8sJobsSection() {
	// Fetch all bots and filter client-side for active ones
	const { data: botsResponse, isLoading } = api.bots.getBots.useQuery(
		{ page: 1, pageSize: 50 },
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold">Active Jobs</h2>
					<Skeleton className="h-5 w-12" />
				</div>
				<LoadingSkeleton />
			</div>
		);
	}

	const bots = (botsResponse?.data ?? []).filter((bot) =>
		ACTIVE_STATUSES.has(bot.status),
	);

	if (bots.length === 0) {
		return (
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">Active Jobs</h2>
				<div className="bg-card border border-border p-8 text-center">
					<Container className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
					<p className="text-muted-foreground font-mono text-sm">
						No active Kubernetes jobs
					</p>
					<p className="text-muted-foreground/70 text-xs mt-1">
						Jobs will appear here when bots are deployed
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<h2 className="text-lg font-semibold">Active Jobs</h2>
				<span className="font-mono text-xs px-2 py-0.5 bg-green-500/10 text-green-500 tabular-nums">
					{bots.length} running
				</span>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				{bots.map((bot) => (
					<K8sBotCard key={bot.id} bot={bot} />
				))}
			</div>
		</div>
	);
}
