"use client";

import {
	ArrowRight,
	ChevronDown,
	Cloud,
	Container,
	Hexagon,
	Server,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

/**
 * Platform icon mapping
 */
function PlatformIcon({
	platform,
	className,
}: {
	platform: "k8s" | "aws" | "coolify" | "local";
	className?: string;
}) {
	const icons = {
		k8s: Container,
		aws: Cloud,
		coolify: Hexagon,
		local: Server,
	};

	const Icon = icons[platform];

	return <Icon className={className} />;
}

/**
 * Platform display names
 */
const PLATFORM_NAMES = {
	k8s: "Kubernetes",
	aws: "AWS ECS",
	coolify: "Coolify",
	local: "Local",
} as const;

/**
 * Stacked bar segment for bot status visualization
 */
function StackedBarSegment({
	value,
	total,
	color,
	pulseAnimation,
	label,
}: {
	value: number;
	total: number;
	color: string;
	pulseAnimation?: boolean;
	label: string;
}) {
	const percentage = total > 0 ? (value / total) * 100 : 0;

	if (percentage === 0) return null;

	return (
		<div
			className={cn(
				"h-full transition-all duration-500 ease-out first:rounded-l-sm last:rounded-r-sm",
				color,
				pulseAnimation && "animate-pulse",
			)}
			style={{ width: `${percentage}%` }}
			title={`${label}: ${value}`}
		/>
	);
}

/**
 * Status indicator dot with label
 */
function StatusIndicator({
	color,
	count,
	label,
	pulseAnimation,
}: {
	color: string;
	count: number;
	label: string;
	pulseAnimation?: boolean;
}) {
	return (
		<span className="flex items-center gap-1.5">
			<span
				className={cn(
					"w-2 h-2 rounded-full",
					color,
					pulseAnimation && count > 0 && "animate-pulse",
					count === 0 && "opacity-40",
				)}
			/>
			<span className="tabular-nums font-medium text-foreground/80">
				{count}
			</span>
			<span className="text-muted-foreground">{label}</span>
		</span>
	);
}

/**
 * Kubernetes platform metrics
 */
function K8sMetrics({
	metrics,
}: {
	metrics: {
		activeJobs: number;
		pendingJobs: number;
		completedJobs: number;
		namespace: string;
	};
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.activeJobs}
				</span>
				<span>jobs active</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.pendingJobs}
				</span>
				<span>pending</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.completedJobs}
				</span>
				<span>completed</span>
			</div>
			<div className="text-xs text-muted-foreground/70">
				Namespace: <span className="font-mono">{metrics.namespace}</span>
			</div>
		</div>
	);
}

/**
 * AWS ECS platform metrics
 */
function AWSMetrics({
	metrics,
}: {
	metrics: {
		runningTasks: number;
		cluster: string;
		region: string;
	};
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.runningTasks}
				</span>
				<span>tasks running</span>
				<span className="text-muted-foreground/40">·</span>
				<span>Cluster:</span>
				<span className="font-mono text-foreground/80">{metrics.cluster}</span>
			</div>
			<div className="text-xs text-muted-foreground/70">
				Region: <span className="font-mono">{metrics.region}</span>
			</div>
		</div>
	);
}

/**
 * Coolify platform metrics
 */
function CoolifyMetrics({
	metrics,
}: {
	metrics: {
		slotsUsed: number;
		slotsTotal: number;
		idle: number;
		busy: number;
		queueDepth: number;
	};
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.slotsUsed}
				</span>
				<span className="text-muted-foreground/60">/{metrics.slotsTotal}</span>
				<span>slots</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.idle}
				</span>
				<span>idle</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.busy}
				</span>
				<span>busy</span>
			</div>
			<div className="text-xs text-muted-foreground/70">
				Queue: <span className="font-mono">{metrics.queueDepth}</span> pending
			</div>
		</div>
	);
}

/**
 * Local platform message (development mode)
 */
function LocalMessage({ message }: { message: string }) {
	return (
		<div className="text-xs text-muted-foreground/70 italic">{message}</div>
	);
}

/**
 * Platform metrics content renderer
 * Avoids nested ternaries by using switch-like pattern
 */
function PlatformMetricsContent({
	platform,
}: {
	platform:
		| {
				platform: "k8s";
				activeJobs: number;
				pendingJobs: number;
				completedJobs: number;
				namespace: string;
		  }
		| { platform: "aws"; runningTasks: number; cluster: string; region: string }
		| {
				platform: "coolify";
				slotsUsed: number;
				slotsTotal: number;
				idle: number;
				busy: number;
				queueDepth: number;
		  }
		| { platform: "local"; message: string };
}) {
	switch (platform.platform) {
		case "k8s":
			return <K8sMetrics metrics={platform} />;
		case "aws":
			return <AWSMetrics metrics={platform} />;
		case "coolify":
			return <CoolifyMetrics metrics={platform} />;
		case "local":
			return <LocalMessage message={platform.message} />;
	}
}

/**
 * Platform section (collapsible)
 */
function PlatformSection({
	platform,
	isExpanded,
	onToggle,
}: {
	platform:
		| {
				platform: "k8s";
				activeJobs: number;
				pendingJobs: number;
				completedJobs: number;
				namespace: string;
		  }
		| { platform: "aws"; runningTasks: number; cluster: string; region: string }
		| {
				platform: "coolify";
				slotsUsed: number;
				slotsTotal: number;
				idle: number;
				busy: number;
				queueDepth: number;
		  }
		| { platform: "local"; message: string };
	isExpanded: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="border-t border-border/50 mt-3 pt-3">
			<button
				onClick={onToggle}
				className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors group"
				type="button"
			>
				<span className="flex items-center gap-1.5">
					<ChevronDown
						className={cn(
							"h-3 w-3 transition-transform duration-200",
							isExpanded && "rotate-180",
						)}
					/>
					<span>Platform</span>
				</span>
				<span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/50">
					<PlatformIcon platform={platform.platform} className="h-3 w-3" />
					<span className="font-medium">
						{PLATFORM_NAMES[platform.platform]}
					</span>
				</span>
			</button>

			<div
				className={cn(
					"overflow-hidden transition-all duration-200",
					isExpanded ? "max-h-24 mt-2 opacity-100" : "max-h-0 opacity-0",
				)}
			>
				<div className="p-2.5 rounded bg-muted/30 border border-border/30">
					<PlatformMetricsContent platform={platform} />
				</div>
			</div>
		</div>
	);
}

interface InfrastructureCardProps {
	activityStats: {
		deploying: number;
		joiningCall: number;
		inWaitingRoom: number;
		inCall: number;
		callEnded: number;
		todayTotal: number;
		todayCompleted: number;
		todayFailed: number;
	};
	platform:
		| {
				platform: "k8s";
				activeJobs: number;
				pendingJobs: number;
				completedJobs: number;
				namespace: string;
		  }
		| { platform: "aws"; runningTasks: number; cluster: string; region: string }
		| {
				platform: "coolify";
				slotsUsed: number;
				slotsTotal: number;
				idle: number;
				busy: number;
				queueDepth: number;
		  }
		| { platform: "local"; message: string };
}

function InfrastructureCard({
	activityStats,
	platform,
}: InfrastructureCardProps) {
	const [isPlatformExpanded, setIsPlatformExpanded] = useState(false);

	const {
		deploying,
		joiningCall,
		inWaitingRoom,
		inCall,
		todayTotal,
		todayCompleted,
		todayFailed,
	} = activityStats;

	// Total active bots for stacked bar (excluding completed/callEnded)
	const activeTotal = deploying + joiningCall + inWaitingRoom + inCall;

	return (
		<div className="group/card border bg-card p-5 flex flex-col h-full min-h-[220px] relative overflow-hidden transition-all duration-300 hover:border-accent/20">
			{/* Ambient glow on hover */}
			<div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/5 rounded-full blur-3xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />

			{/* Live indicator */}
			<LiveIndicator className="absolute top-4 right-4" />

			{/* Header */}
			<div className="flex items-center gap-2.5 mb-4 relative">
				<div className="h-8 w-8 bg-amber-500/10 rounded-md flex items-center justify-center text-amber-500">
					<Zap className="h-4 w-4" strokeWidth={2.5} />
				</div>
				<h3 className="text-sm font-semibold tracking-tight text-foreground/90">
					Infrastructure
				</h3>
			</div>

			{/* Stacked Bar Visualization */}
			<div className="mb-3 relative">
				<div
					className="h-3 bg-muted/50 rounded-sm flex overflow-hidden"
					role="img"
					aria-label={`Bot activity: ${deploying} deploying, ${joiningCall + inWaitingRoom} joining, ${inCall} in call`}
				>
					{activeTotal > 0 ? (
						<>
							<StackedBarSegment
								value={deploying}
								total={activeTotal}
								color="bg-blue-500"
								pulseAnimation
								label="Deploying"
							/>
							<StackedBarSegment
								value={joiningCall + inWaitingRoom}
								total={activeTotal}
								color="bg-amber-500"
								pulseAnimation
								label="Joining"
							/>
							<StackedBarSegment
								value={inCall}
								total={activeTotal}
								color="bg-green-500"
								label="In Call"
							/>
						</>
					) : (
						<div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/50">
							No active bots
						</div>
					)}
				</div>
			</div>

			{/* Active Status Line */}
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mb-3">
				<StatusIndicator
					color="bg-blue-500"
					count={deploying}
					label="deploying"
					pulseAnimation
				/>
				<span className="text-muted-foreground/40">·</span>
				<StatusIndicator
					color="bg-amber-500"
					count={joiningCall + inWaitingRoom}
					label="joining"
					pulseAnimation
				/>
				<span className="text-muted-foreground/40">·</span>
				<StatusIndicator color="bg-green-500" count={inCall} label="in call" />
			</div>

			{/* Daily Summary */}
			<div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-border/30 pt-3 mb-1">
				<span className="tabular-nums font-medium text-foreground/80">
					{todayTotal}
				</span>
				<span>today</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-green-500/80">
					{todayCompleted}
				</span>
				<span>completed</span>
				<span className="text-muted-foreground/40">·</span>
				<span
					className={cn(
						"tabular-nums font-medium",
						todayFailed > 0 ? "text-red-500" : "text-foreground/80",
					)}
				>
					{todayFailed}
				</span>
				<span>failed</span>
			</div>

				{/* Platform Section (Collapsible) */}
			<PlatformSection
				platform={platform}
				isExpanded={isPlatformExpanded}
				onToggle={() => setIsPlatformExpanded(!isPlatformExpanded)}
			/>

			{/* Footer */}
			<div className="mt-auto pt-4 relative">
				<Link
					href="/infrastructure"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors duration-200 group/link"
				>
					<span>View Infrastructure</span>
					<ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/link:translate-x-0.5" />
				</Link>
			</div>
		</div>
	);
}

export function InfrastructureCardSkeleton() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[220px]">
			{/* Header */}
			<div className="flex items-center gap-2.5 mb-4">
				<div className="h-8 w-8 bg-muted rounded-md animate-pulse" />
				<div className="h-4 w-24 bg-muted rounded animate-pulse" />
			</div>

			{/* Stacked bar skeleton */}
			<div className="h-3 bg-muted rounded-sm animate-pulse mb-3" />

			{/* Stats skeleton */}
			<div className="flex gap-4 mb-3">
				<div className="h-3 w-20 bg-muted rounded animate-pulse" />
				<div className="h-3 w-16 bg-muted rounded animate-pulse" />
				<div className="h-3 w-16 bg-muted rounded animate-pulse" />
			</div>

			{/* Daily summary skeleton */}
			<div className="h-3 w-32 bg-muted rounded animate-pulse border-t border-border/30 pt-3" />

			{/* Footer */}
			<div className="mt-auto pt-4">
				<div className="h-3 w-28 bg-muted rounded animate-pulse" />
			</div>
		</div>
	);
}

function InfrastructureCardUnavailable() {
	return (
		<div className="border bg-card p-5 flex flex-col h-full min-h-[220px]">
			{/* Header */}
			<div className="flex items-center gap-2.5 mb-4">
				<div className="h-8 w-8 bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground/50">
					<Zap className="h-4 w-4" strokeWidth={2.5} />
				</div>
				<h3 className="text-sm font-semibold tracking-tight text-muted-foreground/70">
					Infrastructure
				</h3>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col items-center justify-center text-center">
				<div className="h-3 bg-muted/30 rounded-sm w-full mb-3" />
				<p className="text-xs text-muted-foreground/60">
					Infrastructure statistics unavailable
				</p>
			</div>

			{/* Footer */}
			<div className="mt-auto pt-4">
				<Link
					href="/infrastructure"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-accent transition-colors duration-200 group/link"
				>
					<span>View Infrastructure</span>
					<ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover/link:translate-x-0.5" />
				</Link>
			</div>
		</div>
	);
}

/**
 * Client-side wrapper that fetches infrastructure data and renders InfrastructureCard.
 * Uses React Query for caching and automatic refetching.
 */
export function InfrastructureCardLoader() {
	const { data: activityStats, isLoading: statsLoading } =
		api.infrastructure.getActivityStats.useQuery(undefined, {
			refetchInterval: 5000,
		});

	const platformQuery = api.infrastructure.getPlatform.useQuery(undefined, {
		refetchInterval: 10000,
	});

	if (statsLoading || platformQuery.isLoading) {
		return <InfrastructureCardSkeleton />;
	}

	if (!activityStats || !platformQuery.data) {
		return <InfrastructureCardUnavailable />;
	}

	return (
		<InfrastructureCard
			activityStats={activityStats}
			platform={platformQuery.data}
		/>
	);
}
