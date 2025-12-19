"use client";

import { ArrowRight, Hexagon } from "lucide-react";
import Link from "next/link";

interface PoolCardProps {
	idle: number;
	busy: number;
	total: number;
	maxSize: number;
}

type SlotStatus = "idle" | "busy" | "empty";

function SlotDot({ status, index }: { status: SlotStatus; index: number }) {
	const baseClasses =
		"w-2.5 h-2.5 rounded-full transition-all duration-300 ease-out";

	const statusClasses: Record<SlotStatus, string> = {
		idle: "bg-accent shadow-[0_0_6px_rgba(var(--accent),0.4)]",
		busy: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
		empty: "bg-transparent border border-muted-foreground/20",
	};

	const hoverClasses: Record<SlotStatus, string> = {
		idle: "group-hover/card:shadow-[0_0_8px_rgba(var(--accent),0.5)]",
		busy: "group-hover/card:shadow-[0_0_8px_rgba(245,158,11,0.5)]",
		empty: "group-hover/card:border-muted-foreground/30",
	};

	return (
		<div
			className={`${baseClasses} ${statusClasses[status]} ${hoverClasses[status]}`}
			style={{
				animationDelay: `${index * 20}ms`,
			}}
			title={status.charAt(0).toUpperCase() + status.slice(1)}
		/>
	);
}

export function PoolCard({ idle, busy, total, maxSize }: PoolCardProps) {
	// Build array of slot statuses
	const slots: SlotStatus[] = [];

	// Add idle slots first
	for (let i = 0; i < idle; i++) {
		slots.push("idle");
	}

	// Add busy slots
	for (let i = 0; i < busy; i++) {
		slots.push("busy");
	}

	// Add empty slots (unprovisioned)
	const empty = maxSize - total;

	for (let i = 0; i < empty; i++) {
		slots.push("empty");
	}

	return (
		<div className="group/card border bg-card p-5 flex flex-col h-full min-h-[180px] relative overflow-hidden transition-all duration-300 hover:border-accent/20">
			{/* Subtle ambient glow on hover */}
			<div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/5 rounded-full blur-3xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />

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
					aria-label={`Pool status: ${idle} idle, ${busy} busy, ${empty} empty slots`}
				>
					{slots.map((status, index) => (
						<SlotDot key={index} status={status} index={index} />
					))}
				</div>

				{/* Stats line */}
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

export function PoolCardUnavailable() {
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
