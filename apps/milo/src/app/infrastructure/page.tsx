"use client";

import { keepPreviousData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { Cloud, Container, Hexagon, RefreshCw, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/trpc/react";
import { InfrastructureStatsCards } from "./_components/infrastructure-stats-cards";
import { K8sJobsSection } from "./_components/k8s-jobs-section";

// ─── Types ────────────────────────────────────────────────────────────────────

type RouterOutputs = inferRouterOutputs<AppRouter>;

type ActivityStats = RouterOutputs["infrastructure"]["getActivityStats"];

type PlatformData = RouterOutputs["infrastructure"]["getPlatform"];

/** Refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL = 5000;

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
 * Platform descriptions
 */
const PLATFORM_DESCRIPTIONS = {
	k8s: "Monitor Kubernetes Jobs and bot deployments",
	aws: "Monitor AWS ECS tasks and bot deployments",
	coolify: "Monitor bot pool capacity and deployment queue",
	local: "Local development mode",
} as const;

/**
 * Shared hook for infrastructure data fetching
 */
function useInfrastructureData() {
	const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);

	const activityStats = api.infrastructure.getActivityStats.useQuery(
		undefined,
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	const platformQuery = api.infrastructure.getPlatform.useQuery(undefined, {
		refetchInterval: REFRESH_INTERVAL,
		refetchOnWindowFocus: true,
		placeholderData: keepPreviousData,
	});

	useEffect(() => {
		if (activityStats.data || platformQuery.data) {
			setLastUpdated(new Date());
		}
	}, [activityStats.data, platformQuery.data]);

	const handleManualRefresh = async () => {
		setIsManualRefreshing(true);

		try {
			await Promise.all([activityStats.refetch(), platformQuery.refetch()]);
			setLastUpdated(new Date());
		} finally {
			setIsManualRefreshing(false);
		}
	};

	return {
		activityStats,
		platformQuery,
		lastUpdated,
		isManualRefreshing,
		handleManualRefresh,
	};
}

/**
 * Header actions with live indicator and refresh button
 */
function InfrastructureHeaderActions({
	lastUpdated,
	isManualRefreshing,
	onRefresh,
}: {
	lastUpdated: Date | undefined;
	isManualRefreshing: boolean;
	onRefresh: () => void;
}) {
	return (
		<PageHeaderActions>
			<LiveIndicator lastUpdated={lastUpdated} />

			<Button
				variant="outline"
				size="sm"
				onClick={onRefresh}
				disabled={isManualRefreshing}
			>
				<RefreshCw
					className={`size-3! ${isManualRefreshing ? "animate-spin" : ""}`}
				/>
				Refresh
			</Button>
		</PageHeaderActions>
	);
}

/**
 * Coolify-specific page content
 */
function CoolifyContent({
	activityStats,
	isLoading,
}: {
	activityStats: ActivityStats | undefined;
	isLoading: boolean;
}) {
	return (
		<div className="space-y-6">
			<InfrastructureStatsCards
				activityStats={activityStats}
				platform={undefined}
				isLoading={isLoading}
			/>

			<div className="bg-card border border-border p-8 text-center">
				<Hexagon className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
				<p className="text-muted-foreground font-mono text-sm">
					Coolify pool is managed automatically
				</p>
				<p className="text-muted-foreground/70 text-xs mt-1">
					View individual bots in the Bots section
				</p>
			</div>
		</div>
	);
}

/**
 * Kubernetes-specific page content
 */
function K8sContent({
	activityStats,
	platformMetrics,
	isLoading,
}: {
	activityStats: ActivityStats | undefined;
	platformMetrics: PlatformData | undefined;
	isLoading: boolean;
}) {
	return (
		<div className="space-y-6">
			<InfrastructureStatsCards
				activityStats={activityStats}
				platform={
					platformMetrics?.platform === "k8s" ? platformMetrics : undefined
				}
				isLoading={isLoading}
			/>

			<K8sJobsSection />
		</div>
	);
}

/**
 * AWS ECS-specific page content
 */
function AWSContent({
	activityStats,
	platformMetrics,
	isLoading,
}: {
	activityStats: ActivityStats | undefined;
	platformMetrics: PlatformData | undefined;
	isLoading: boolean;
}) {
	return (
		<div className="space-y-6">
			<InfrastructureStatsCards
				activityStats={activityStats}
				platform={
					platformMetrics?.platform === "aws" ? platformMetrics : undefined
				}
				isLoading={isLoading}
			/>

			<div className="bg-card border border-border p-8 text-center">
				<Cloud className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
				<p className="text-muted-foreground font-mono text-sm">
					AWS ECS tasks are ephemeral and auto-managed
				</p>
				<p className="text-muted-foreground/70 text-xs mt-1">
					View individual bots in the Bots section
				</p>
			</div>
		</div>
	);
}

/**
 * Local development page content
 */
function LocalContent() {
	return (
		<div className="space-y-6">
			<div className="bg-card border border-border p-8 text-center">
				<Server className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
				<p className="text-muted-foreground font-mono text-sm">
					Running in local development mode
				</p>
				<p className="text-muted-foreground/70 text-xs mt-1">
					Infrastructure monitoring is available in production deployments
				</p>
			</div>
		</div>
	);
}

/**
 * Loading skeleton for the infrastructure page
 */
function InfrastructurePageSkeleton() {
	return (
		<div className="mx-auto container space-y-6 px-4">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-72" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-8 w-20" />
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{[1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-32" />
				))}
			</div>
		</div>
	);
}

/**
 * Platform-specific content renderer
 */
function PlatformContent({
	platform,
	activityStats,
	platformMetrics,
	isLoading,
}: {
	platform: "k8s" | "aws" | "coolify" | "local";
	activityStats: ActivityStats | undefined;
	platformMetrics: PlatformData | undefined;
	isLoading: boolean;
}) {
	switch (platform) {
		case "coolify":
			return (
				<CoolifyContent activityStats={activityStats} isLoading={isLoading} />
			);
		case "k8s":
			return (
				<K8sContent
					activityStats={activityStats}
					platformMetrics={platformMetrics}
					isLoading={isLoading}
				/>
			);
		case "aws":
			return (
				<AWSContent
					activityStats={activityStats}
					platformMetrics={platformMetrics}
					isLoading={isLoading}
				/>
			);
		case "local":
			return <LocalContent />;
	}
}

export default function InfrastructurePage() {
	const {
		activityStats,
		platformQuery,
		lastUpdated,
		isManualRefreshing,
		handleManualRefresh,
	} = useInfrastructureData();

	if (platformQuery.isLoading || !platformQuery.data) {
		return <InfrastructurePageSkeleton />;
	}

	const platform = platformQuery.data.platform;
	const isLoading = activityStats.isLoading || platformQuery.isLoading;

	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<div className="flex items-center gap-2">
						<PlatformIcon platform={platform} className="h-6 w-6" />
						<PageHeaderTitle>Infrastructure</PageHeaderTitle>
						<span className="text-xs font-mono px-2 py-0.5 bg-muted text-muted-foreground rounded">
							{PLATFORM_NAMES[platform]}
						</span>
					</div>
					<PageHeaderDescription>
						{PLATFORM_DESCRIPTIONS[platform]}
					</PageHeaderDescription>
				</PageHeaderContent>

				<InfrastructureHeaderActions
					lastUpdated={lastUpdated}
					isManualRefreshing={isManualRefreshing}
					onRefresh={handleManualRefresh}
				/>
			</PageHeader>

			<PlatformContent
				platform={platform}
				activityStats={activityStats.data}
				platformMetrics={platformQuery.data}
				isLoading={isLoading}
			/>
		</div>
	);
}
