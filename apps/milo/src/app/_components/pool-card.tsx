"use client";

import { ChevronRight, Circle, Server } from "lucide-react";
import Link from "next/link";

interface PoolCardProps {
	idle: number;
	busy: number;
	total: number;
	maxSize: number;
}

export function PoolCard({ idle, busy, total, maxSize }: PoolCardProps) {
	const capacityPercent = Math.round((total / maxSize) * 100);

	// Calculate stroke dash for circular progress
	const circumference = 2 * Math.PI * 40; // radius = 40
	const capacityDash = (capacityPercent / 100) * circumference;
	const idleDash = total > 0 ? (idle / total) * capacityDash : 0;

	return (
		<div className="group border bg-card p-5 flex flex-col h-full min-h-[180px] relative overflow-hidden transition-all duration-300 hover:border-accent/30">
			{/* Subtle gradient overlay on hover */}
			<div className="absolute inset-0 bg-gradient-to-br from-accent/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

			{/* Header */}
			<div className="flex items-center gap-3 mb-4 relative">
				<div className="h-10 w-10 bg-accent/10 flex items-center justify-center text-accent">
					<Server className="h-5 w-5" />
				</div>
				<h3 className="font-semibold tracking-tight">Pool</h3>
			</div>

			{/* Main content - circular viz + stats */}
			<div className="flex items-center gap-5 flex-1 relative">
				{/* Circular capacity indicator */}
				<div className="relative w-[100px] h-[100px] shrink-0">
					<svg
						viewBox="0 0 100 100"
						className="w-full h-full -rotate-90"
						role="img"
						aria-label={`Pool capacity: ${capacityPercent}%`}
					>
						{/* Background track */}
						<circle
							cx="50"
							cy="50"
							r="40"
							fill="none"
							strokeWidth="8"
							className="stroke-muted"
						/>
						{/* Busy slots (rendered first, full arc) */}
						<circle
							cx="50"
							cy="50"
							r="40"
							fill="none"
							strokeWidth="8"
							strokeDasharray={`${capacityDash} ${circumference}`}
							strokeDashoffset="0"
							className="stroke-amber-500/70 transition-all duration-500"
						/>
						{/* Idle slots (rendered on top, partial arc) */}
						<circle
							cx="50"
							cy="50"
							r="40"
							fill="none"
							strokeWidth="8"
							strokeDasharray={`${idleDash} ${circumference}`}
							strokeDashoffset="0"
							className="stroke-accent transition-all duration-500"
						/>
					</svg>
					{/* Center text */}
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span className="text-2xl font-bold tabular-nums leading-none">
							{capacityPercent}%
						</span>
						<span className="text-[10px] text-muted-foreground mt-0.5">
							capacity
						</span>
					</div>
				</div>

				{/* Stats */}
				<div className="flex-1 space-y-3">
					{/* Idle */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Circle className="h-2.5 w-2.5 fill-accent text-accent" />
							<span className="text-sm text-muted-foreground">Idle</span>
						</div>
						<span className="font-semibold tabular-nums">
							{idle}
							<span className="text-muted-foreground font-normal">
								/{total}
							</span>
						</span>
					</div>

					{/* Busy */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
							<span className="text-sm text-muted-foreground">Busy</span>
						</div>
						<span className="font-semibold tabular-nums">{busy}</span>
					</div>

					{/* Capacity */}
					<div className="pt-2 border-t">
						<div className="flex items-baseline justify-between">
							<span className="text-xs text-muted-foreground">
								Pool capacity
							</span>
							<span className="text-xs tabular-nums">
								<span className="font-medium">{total}</span>
								<span className="text-muted-foreground">/{maxSize} slots</span>
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="mt-4 pt-3 border-t relative">
				<Link
					href="/pool"
					className="text-sm text-muted-foreground hover:text-accent flex items-center gap-1 transition-colors"
				>
					View Pool
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>
		</div>
	);
}

export function PoolCardSkeleton() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[180px]">
			{/* Header */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-10 w-10 bg-muted animate-pulse" />
				<div className="h-5 w-12 bg-muted animate-pulse" />
			</div>

			{/* Content */}
			<div className="flex items-center gap-5 flex-1">
				{/* Circle skeleton */}
				<div className="w-[100px] h-[100px] shrink-0 bg-muted animate-pulse rounded-full" />

				{/* Stats skeleton */}
				<div className="flex-1 space-y-3">
					<div className="flex items-center justify-between">
						<div className="h-4 w-12 bg-muted animate-pulse" />
						<div className="h-4 w-10 bg-muted animate-pulse" />
					</div>
					<div className="flex items-center justify-between">
						<div className="h-4 w-12 bg-muted animate-pulse" />
						<div className="h-4 w-6 bg-muted animate-pulse" />
					</div>
					<div className="pt-2 border-t">
						<div className="flex items-center justify-between">
							<div className="h-3 w-20 bg-muted animate-pulse" />
							<div className="h-3 w-16 bg-muted animate-pulse" />
						</div>
					</div>
				</div>
			</div>

			{/* Footer */}
			<div className="mt-4 pt-3 border-t">
				<div className="h-4 w-20 bg-muted animate-pulse" />
			</div>
		</div>
	);
}

export function PoolCardUnavailable() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[180px]">
			{/* Header */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground">
					<Server className="h-5 w-5" />
				</div>
				<h3 className="font-semibold tracking-tight">Pool</h3>
			</div>

			{/* Content */}
			<div className="flex-1 flex items-center justify-center">
				<p className="text-sm text-muted-foreground text-center">
					Pool statistics unavailable.
					<br />
					<span className="text-xs">
						Monitor bot pool capacity and deployment queue.
					</span>
				</p>
			</div>

			{/* Footer */}
			<div className="mt-4 pt-3 border-t">
				<Link
					href="/pool"
					className="text-sm text-muted-foreground hover:text-accent flex items-center gap-1 transition-colors"
				>
					View Pool
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>
		</div>
	);
}
