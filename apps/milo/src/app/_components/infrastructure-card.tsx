"use client";

import { ChevronDown, Cloud, Container, Hexagon, Server } from "lucide-react";
import { useState } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import {
	StatCard,
	StatCardContent,
	StatCardFooter,
	StatCardHeader,
	StatCardIcon,
	StatCardIconSkeleton,
	StatCardLink,
	StatCardLinkSkeleton,
	StatCardTitle,
} from "./stat-card";

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
 * Bot activity status type
 */
type BotActivityStatus = "DEPLOYING" | "JOINING" | "IN_CALL";

/**
 * Status to color mapping
 */
const STATUS_COLORS: Record<BotActivityStatus, string> = {
	DEPLOYING: "bg-blue-500",
	JOINING: "bg-amber-500",
	IN_CALL: "bg-green-500",
};

/**
 * Status pulse animation (transitional states pulse)
 */
const STATUS_PULSE: Record<BotActivityStatus, boolean> = {
	DEPLOYING: true,
	JOINING: true,
	IN_CALL: false,
};

/**
 * Activity bars visualization - inline vertical bars showing actual bot sequence
 * Each bar represents one bot in its current status.
 * Responsive: bars scale based on bot count, no empty placeholders.
 */
function ActivityBars({ sequence }: { sequence: BotActivityStatus[] }) {
	const maxBars = 100;
	const displaySequence = sequence.slice(0, maxBars);
	const hasOverflow = sequence.length > maxBars;

	// Empty state - show subtle placeholder bars
	if (sequence.length === 0) {
		return (
			<div className="flex items-center justify-center h-5 w-full">
				<div className="flex items-center gap-1">
					{Array.from({ length: 5 }).map((_, i) => (
						<div
							key={`empty-${i}`}
							className="w-0.5 h-2 rounded-full bg-muted/30"
						/>
					))}
				</div>
			</div>
		);
	}

	// Calculate dynamic gap based on bot count for visual density
	// Few bots = more spacing, many bots = tighter packing
	const getGapClass = (count: number) => {
		if (count <= 5) return "gap-3";

		if (count <= 15) return "gap-2";

		if (count <= 30) return "gap-1.5";

		if (count <= 50) return "gap-1";

		return "gap-0.5";
	};

	// Bar width scales inversely with count
	const getBarWidth = (count: number) => {
		if (count <= 10) return "w-1";

		if (count <= 30) return "w-0.5";

		return "w-px";
	};

	return (
		<div
			className={cn(
				"flex items-center justify-center h-5 w-full",
				getGapClass(displaySequence.length),
			)}
			role="img"
			aria-label={`${sequence.length} active bots`}
		>
			{displaySequence.map((status, i) => (
				<div
					key={`bar-${i}`}
					className={cn(
						"h-5 rounded-full transition-all duration-300 shrink-0",
						getBarWidth(displaySequence.length),
						STATUS_COLORS[status],
						STATUS_PULSE[status] && "animate-pulse",
					)}
					style={{
						animationDelay: STATUS_PULSE[status]
							? `${(i % 5) * 100}ms`
							: undefined,
					}}
					title={status.replace("_", " ")}
				/>
			))}

			{/* Overflow indicator */}
			{hasOverflow ? (
				<span className="ml-1 text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
					+{sequence.length - maxBars}
				</span>
			) : null}
		</div>
	);
}

/**
 * Status indicator dot with label
 */
function StatusIndicator({
	color,
	count,
	label,
	shouldPulse,
}: {
	color: string;
	count: number;
	label: string;
	shouldPulse?: boolean;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span
				className={cn(
					"size-2 rounded-full shrink-0",
					color,
					shouldPulse && count > 0 && "animate-pulse",
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
		PENDING: number;
		ACTIVE: number;
		SUCCEEDED: number;
		FAILED: number;
		namespace: string;
	};
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.ACTIVE}
				</span>
				<span>jobs active</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.PENDING}
				</span>
				<span>pending</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.SUCCEEDED}
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
		PROVISIONING: number;
		RUNNING: number;
		STOPPED: number;
		FAILED: number;
		cluster: string;
		region: string;
	};
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.RUNNING}
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
		IDLE: number;
		DEPLOYING: number;
		HEALTHY: number;
		ERROR: number;
		queueDepth: number;
	};
}) {
	const slotsUsed = metrics.DEPLOYING + metrics.HEALTHY + metrics.ERROR;
	const slotsTotal = slotsUsed + metrics.IDLE;

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<span className="tabular-nums font-medium text-foreground/80">
					{slotsUsed}
				</span>
				<span className="text-muted-foreground/60">/{slotsTotal}</span>
				<span>slots</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.IDLE}
				</span>
				<span>idle</span>
				<span className="text-muted-foreground/40">·</span>
				<span className="tabular-nums font-medium text-foreground/80">
					{metrics.HEALTHY}
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
 * Platform type matching API schema (UPPERCASE status fields per PLATFORM_NOMENCLATURE.md)
 */
type Platform =
	| {
			platform: "k8s";
			namespace: string;
			PENDING: number;
			ACTIVE: number;
			SUCCEEDED: number;
			FAILED: number;
	  }
	| {
			platform: "aws";
			cluster: string;
			region: string;
			PROVISIONING: number;
			RUNNING: number;
			STOPPED: number;
			FAILED: number;
	  }
	| {
			platform: "coolify";
			queueDepth: number;
			IDLE: number;
			DEPLOYING: number;
			HEALTHY: number;
			ERROR: number;
	  }
	| { platform: "local"; message: string };

/**
 * Platform metrics content renderer
 * Avoids nested ternaries by using switch-like pattern
 */
function PlatformMetricsContent({ platform }: { platform: Platform }) {
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
	platform: Platform;
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
	botSequence: BotActivityStatus[];
	platform: Platform;
	platforms: Platform[];
	queueDepth: number;
}

function InfrastructureCard({
	activityStats,
	botSequence,
	platform,
	platforms,
	queueDepth,
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

	const isMultiPlatform = platforms.length > 1;

	return (
		<StatCard className="min-h-[180px] relative">
			{/* Live indicator - absolute positioned top-right */}
			<div className="absolute top-4 right-4">
				<LiveIndicator />
			</div>

			{/* Header - icon, title only */}
			<StatCardHeader className="justify-start gap-3 mb-4">
				<StatCardIcon>
					<PlatformIcon platform={platform.platform} className="h-5 w-5" />
				</StatCardIcon>
				<StatCardTitle>Infrastructure</StatCardTitle>
			</StatCardHeader>

			{/* Content */}
			<StatCardContent className="mb-0">
				{/* Activity visualization */}
				<div className="space-y-2.5 mb-3">
					{/* Vertical bars - hero visualization */}
					<ActivityBars sequence={botSequence} />

					{/* Status counts row */}
					<div className="flex items-center gap-3 text-xs">
						<StatusIndicator
							color="bg-blue-500"
							count={deploying}
							label="deploying"
							shouldPulse
						/>
						<span className="text-muted-foreground/30">·</span>
						<StatusIndicator
							color="bg-amber-500"
							count={joiningCall + inWaitingRoom}
							label="joining"
							shouldPulse
						/>
						<span className="text-muted-foreground/30">·</span>
						<StatusIndicator
							color="bg-green-500"
							count={inCall}
							label="in call"
						/>
						{queueDepth > 0 ? (
							<>
								<span className="text-muted-foreground/30">·</span>
								<span className="text-amber-600 dark:text-amber-400 font-medium">
									{queueDepth} queued
								</span>
							</>
						) : null}
					</div>
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

				{/* Platform Section (Collapsible) - shows all platforms for multi-platform */}
				{isMultiPlatform ? (
					<div className="border-t border-border/50 mt-3 pt-3">
						<button
							onClick={() => setIsPlatformExpanded(!isPlatformExpanded)}
							className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors group"
							type="button"
						>
							<span className="flex items-center gap-1.5">
								<ChevronDown
									className={cn(
										"h-3 w-3 transition-transform duration-200",
										isPlatformExpanded && "rotate-180",
									)}
								/>
								<span>Platforms</span>
							</span>
							<span className="flex items-center gap-1">
								{platforms.map((p) => (
									<span
										key={p.platform}
										className="px-1.5 py-0.5 rounded bg-muted/50 flex items-center gap-1"
									>
										<PlatformIcon platform={p.platform} className="h-3 w-3" />
									</span>
								))}
							</span>
						</button>

						<div
							className={cn(
								"overflow-hidden transition-all duration-200",
								isPlatformExpanded
									? "max-h-96 mt-2 opacity-100"
									: "max-h-0 opacity-0",
							)}
						>
							<div className="space-y-2">
								{platforms.map((p) => (
									<div
										key={p.platform}
										className="p-2.5 rounded bg-muted/30 border border-border/30"
									>
										<div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium">
											<PlatformIcon platform={p.platform} className="h-3 w-3" />
											<span>{PLATFORM_NAMES[p.platform]}</span>
										</div>
										<PlatformMetricsContent platform={p} />
									</div>
								))}
							</div>
						</div>
					</div>
				) : (
					<PlatformSection
						platform={platform}
						isExpanded={isPlatformExpanded}
						onToggle={() => setIsPlatformExpanded(!isPlatformExpanded)}
					/>
				)}
			</StatCardContent>

			{/* Footer */}
			<StatCardFooter className="border-t-0 pt-4">
				<StatCardLink href="/infrastructure">View Infrastructure</StatCardLink>
			</StatCardFooter>
		</StatCard>
	);
}

export function InfrastructureCardSkeleton() {
	return (
		<StatCard className="min-h-[180px]">
			{/* Header */}
			<StatCardHeader className="justify-start gap-3 mb-4">
				<StatCardIconSkeleton />
				<div className="h-5 w-24 bg-muted rounded animate-pulse" />
			</StatCardHeader>

			{/* Content */}
			<StatCardContent className="mb-0">
				{/* Activity bars + stats skeleton */}
				<div className="flex items-center gap-4 mb-3">
					{/* Bars skeleton */}
					<div className="flex items-center gap-0.5 h-4">
						{Array.from({ length: 8 }).map((_, i) => (
							<div
								key={`skeleton-bar-${i}`}
								className="w-1 h-4 rounded-full bg-muted animate-pulse"
								style={{ animationDelay: `${i * 50}ms` }}
							/>
						))}
					</div>
					{/* Stats skeleton */}
					<div className="flex gap-2">
						<div className="h-3 w-16 bg-muted rounded animate-pulse" />
						<div className="h-3 w-14 bg-muted rounded animate-pulse" />
						<div className="h-3 w-14 bg-muted rounded animate-pulse" />
					</div>
				</div>

				{/* Daily summary skeleton */}
				<div className="h-3 w-32 bg-muted rounded animate-pulse border-t border-border/30 pt-3" />
			</StatCardContent>

			{/* Footer */}
			<StatCardFooter className="border-t-0 pt-4">
				<StatCardLinkSkeleton className="w-32" />
			</StatCardFooter>
		</StatCard>
	);
}

function InfrastructureCardUnavailable() {
	return (
		<StatCard className="min-h-[180px]">
			{/* Header */}
			<StatCardHeader className="justify-start gap-3 mb-4">
				<StatCardIcon className="bg-muted/50 text-muted-foreground/50">
					<Server className="h-5 w-5" />
				</StatCardIcon>
				<StatCardTitle className="text-muted-foreground/70">
					Infrastructure
				</StatCardTitle>
			</StatCardHeader>

			{/* Content */}
			<StatCardContent className="flex-1 flex flex-col items-center justify-center text-center mb-0">
				<div className="h-3 bg-muted/30 rounded-sm w-full mb-3" />
				<p className="text-sm text-muted-foreground/60">
					Infrastructure statistics unavailable
				</p>
			</StatCardContent>

			{/* Footer */}
			<StatCardFooter className="border-t-0 pt-4">
				<StatCardLink
					href="/infrastructure"
					className="text-muted-foreground/60"
				>
					View Infrastructure
				</StatCardLink>
			</StatCardFooter>
		</StatCard>
	);
}

/**
 * Client-side wrapper that fetches infrastructure data and renders InfrastructureCard.
 * Uses React Query for caching and automatic refetching.
 */
export function InfrastructureCardLoader() {
	const { data: activityStats, isLoading: isStatsLoading } =
		api.infrastructure.getActivityStats.useQuery(undefined, {
			refetchInterval: 5000,
		});

	const { data: botSequence, isLoading: isSequenceLoading } =
		api.infrastructure.getActiveBotSequence.useQuery(undefined, {
			refetchInterval: 5000,
		});

	// Use getPlatforms (plural) for hybrid support, fall back to getPlatform
	const platformsQuery = api.infrastructure.getPlatforms.useQuery(undefined, {
		refetchInterval: 10000,
	});

	// Get queue stats for hybrid infrastructure
	const queueStatsQuery = api.infrastructure.getQueueStats.useQuery(undefined, {
		refetchInterval: 5000,
	});

	if (isStatsLoading || isSequenceLoading || platformsQuery.isLoading) {
		return <InfrastructureCardSkeleton />;
	}

	if (!activityStats || !botSequence || !platformsQuery.data) {
		return <InfrastructureCardUnavailable />;
	}

	// Use first platform for the card header icon
	const primaryPlatform = platformsQuery.data[0] ?? {
		platform: "local" as const,
		message: "Local development mode",
	};

	return (
		<InfrastructureCard
			activityStats={activityStats}
			botSequence={botSequence}
			platform={primaryPlatform}
			platforms={platformsQuery.data}
			queueDepth={queueStatsQuery.data?.total ?? 0}
		/>
	);
}
