"use client";

import { ArrowRight, Bot, Hexagon } from "lucide-react";
import Link from "next/link";
import { LiveIndicator } from "@/components/live-indicator";
import type { PoolSlotStatus } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface PoolCardProps {
	slotStatuses: PoolSlotStatus[];
	maxSize: number;
	botStats: {
		deploying: number;
		joiningCall: number;
		inWaitingRoom: number;
		inCall: number;
		leaving: number;
		total: number;
	};
}

type SlotDisplayStatus = PoolSlotStatus | "empty";

function SlotDot({
	status,
	index,
}: {
	status: SlotDisplayStatus;
	index: number;
}) {
	const baseClasses =
		"w-2.5 h-2.5 rounded-full transition-all duration-300 ease-out";

	const statusClasses: Record<SlotDisplayStatus, string> = {
		idle: "bg-accent shadow-[0_0_6px_rgba(var(--accent),0.4)]",
		deploying:
			"bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)] animate-pulse",
		busy: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
		error: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]",
		empty: "bg-transparent border border-muted-foreground/20",
	};

	const hoverClasses: Record<SlotDisplayStatus, string> = {
		idle: "group-hover/card:shadow-[0_0_8px_rgba(var(--accent),0.5)]",
		deploying: "group-hover/card:shadow-[0_0_8px_rgba(59,130,246,0.5)]",
		busy: "group-hover/card:shadow-[0_0_8px_rgba(245,158,11,0.5)]",
		error: "group-hover/card:shadow-[0_0_8px_rgba(239,68,68,0.5)]",
		empty: "group-hover/card:border-muted-foreground/30",
	};

	const statusLabels: Record<SlotDisplayStatus, string> = {
		idle: "Idle",
		deploying: "Deploying",
		busy: "Busy",
		error: "Error",
		empty: "N/A",
	};

	return (
		<div
			className={`${baseClasses} ${statusClasses[status]} ${hoverClasses[status]}`}
			style={{
				animationDelay: `${index * 20}ms`,
			}}
			title={statusLabels[status]}
		/>
	);
}

function PoolCard({ slotStatuses, maxSize, botStats }: PoolCardProps) {
	// Build array of slot display statuses
	const slots: SlotDisplayStatus[] = [...slotStatuses];

	// Calculate counts from actual statuses
	const idle = slotStatuses.filter((s) => s === "idle").length;
	const deploying = slotStatuses.filter((s) => s === "deploying").length;
	const busy = slotStatuses.filter((s) => s === "busy").length;
	const total = slotStatuses.length;

	// Add empty slots (unprovisioned capacity)
	const emptyCount = maxSize - total;
	for (let i = 0; i < emptyCount; i++) {
		slots.push("empty");
	}

	return (
		<div className="group/card border bg-card p-5 flex flex-col h-full min-h-[180px] relative overflow-hidden transition-all duration-300 hover:border-accent/20">
			{/* Subtle ambient glow on hover */}
			<div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/5 rounded-full blur-3xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />

			{/* Live indicator */}
			<LiveIndicator className="absolute top-4 right-4" />

			{/* Header */}
			<div className="flex items-center gap-2.5 mb-5 relative">
				<div className="h-8 w-8 bg-accent/10 rounded-md flex items-center justify-center text-accent">
					<Hexagon className="h-4 w-4" strokeWidth={2.5} />
				</div>
				<h3 className="text-sm font-semibold tracking-tight text-foreground/90">
					Pool
				</h3>
			</div>

			{/* Dot Grid */}
			<div className="flex-1 flex flex-col justify-center relative">
				<div
					className="flex flex-wrap gap-1.5 mb-4"
					role="img"
					aria-label={`Pool status: ${idle} idle, ${deploying} deploying, ${busy} busy, ${emptyCount} empty slots`}
				>
					{slots.map((status, index) => (
						<SlotDot key={index} status={status} index={index} />
					))}
				</div>

				{/* Pool Stats line */}
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-accent" />
						<span className="tabular-nums font-medium text-foreground/80">
							{idle}
						</span>
						<span>idle</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="flex items-center gap-1">
						<span
							className={`w-1.5 h-1.5 rounded-full bg-blue-500 ${deploying > 0 ? "animate-pulse" : "opacity-40"}`}
						/>
						<span className="tabular-nums font-medium text-foreground/80">
							{deploying}
						</span>
						<span>deploying</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="flex items-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
						<span className="tabular-nums font-medium text-foreground/80">
							{busy}
						</span>
						<span>busy</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="tabular-nums">
						<span className="font-medium text-foreground/80">{total}</span>
						<span className="text-muted-foreground/60">/{maxSize}</span>
					</span>
				</div>

				{/* Bot Stats line */}
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
					<Bot className="h-2 w-2 text-muted-foreground/50" />
					<span className="flex items-center gap-1">
						<span className="tabular-nums font-medium text-foreground/80">
							{botStats.inCall}
						</span>
						<span>in call</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="flex items-center gap-1">
						<span className="tabular-nums font-medium text-foreground/80">
							{botStats.inWaitingRoom}
						</span>
						<span>waiting</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="flex items-center gap-1">
						<span className="tabular-nums font-medium text-foreground/80">
							{botStats.joiningCall}
						</span>
						<span>joining</span>
					</span>
					<span className="text-muted-foreground/40">·</span>
					<span className="tabular-nums">
						<span className="font-medium text-foreground/80">
							{botStats.total}
						</span>
						<span className="text-muted-foreground/60"> active</span>
					</span>
				</div>
			</div>

			{/* Footer */}
			<div className="mt-auto pt-4 relative">
				<Link
					href="/pool"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors duration-200 group/link"
				>
					<span>View Pool</span>
					<ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/link:translate-x-0.5" />
				</Link>
			</div>
		</div>
	);
}

export function PoolCardSkeleton() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[180px]">
			{/* Header */}
			<div className="flex items-center gap-2.5 mb-5">
				<div className="h-8 w-8 bg-muted rounded-md animate-pulse" />
				<div className="h-4 w-10 bg-muted rounded animate-pulse" />
			</div>

			{/* Dot grid skeleton */}
			<div className="flex-1 flex flex-col justify-center">
				<div className="flex flex-wrap gap-1.5 mb-4">
					{Array.from({ length: 16 }).map((_, i) => (
						<div
							key={i}
							className="w-2.5 h-2.5 rounded-full bg-muted animate-pulse"
							style={{ animationDelay: `${i * 50}ms` }}
						/>
					))}
				</div>
				<div className="h-3 w-32 bg-muted rounded animate-pulse" />
			</div>

			{/* Footer */}
			<div className="mt-auto pt-4">
				<div className="h-3 w-16 bg-muted rounded animate-pulse" />
			</div>
		</div>
	);
}

function PoolCardUnavailable() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[180px]">
			{/* Header */}
			<div className="flex items-center gap-2.5 mb-5">
				<div className="h-8 w-8 bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground/50">
					<Hexagon className="h-4 w-4" strokeWidth={2.5} />
				</div>
				<h3 className="text-sm font-semibold tracking-tight text-muted-foreground/70">
					Pool
				</h3>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col items-center justify-center text-center">
				<div className="flex gap-1.5 mb-3 opacity-30">
					{Array.from({ length: 8 }).map((_, i) => (
						<div
							key={i}
							className="w-2.5 h-2.5 rounded-full border border-muted-foreground/30"
						/>
					))}
				</div>
				<p className="text-xs text-muted-foreground/60">
					Pool statistics unavailable
				</p>
			</div>

			{/* Footer */}
			<div className="mt-auto pt-4">
				<Link
					href="/pool"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-accent transition-colors duration-200 group/link"
				>
					<span>View Pool</span>
					<ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/link:translate-x-0.5" />
				</Link>
			</div>
		</div>
	);
}

/**
 * Client-side wrapper that fetches pool data and renders PoolCard.
 * This enables React Query cache invalidation after bot deployment.
 */
export function PoolCardLoader() {
	const { data: slotData, isLoading: slotsLoading } =
		api.pool.statistics.getSlotStatuses.useQuery(undefined, {
			refetchInterval: 5000,
		});

	const { data: botStats, isLoading: botsLoading } =
		api.pool.statistics.getBotStatusCounts.useQuery(undefined, {
			refetchInterval: 5000,
		});

	if (slotsLoading || botsLoading) {
		return <PoolCardSkeleton />;
	}

	if (!slotData || !botStats) {
		return <PoolCardUnavailable />;
	}

	return (
		<PoolCard
			slotStatuses={slotData.statuses}
			maxSize={slotData.maxSize}
			botStats={botStats}
		/>
	);
}
