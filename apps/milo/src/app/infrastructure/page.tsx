"use client";

import { keepPreviousData } from "@tanstack/react-query";
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
import { api } from "@/trpc/react";
import { InfrastructureStatsCards } from "./_components/infrastructure-stats-cards";
import { K8sJobsSection } from "./_components/k8s-jobs-section";

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
 * Coolify-specific page content
 *
 * Uses the same stats card pattern as K8s/AWS but shows Coolify-specific metrics.
 */
function CoolifyContent() {
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

	return (
		<>
			<PageHeaderActions>
				<LiveIndicator lastUpdated={lastUpdated} />

				<Button
					variant="outline"
					size="sm"
					onClick={handleManualRefresh}
					disabled={isManualRefreshing}
				>
					<RefreshCw
						className={`size-3! ${isManualRefreshing ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</PageHeaderActions>

			<div className="space-y-6 mt-6">
				<InfrastructureStatsCards
					activityStats={activityStats.data}
					platform={undefined}
					isLoading={activityStats.isLoading || platformQuery.isLoading}
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
		</>
	);
}

/**
 * Kubernetes-specific page content
 */
function K8sContent() {
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

	return (
		<>
			<PageHeaderActions>
				<LiveIndicator lastUpdated={lastUpdated} />

				<Button
					variant="outline"
					size="sm"
					onClick={handleManualRefresh}
					disabled={isManualRefreshing}
				>
					<RefreshCw
						className={`size-3! ${isManualRefreshing ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</PageHeaderActions>

			<div className="space-y-6 mt-6">
				<InfrastructureStatsCards
					activityStats={activityStats.data}
					platform={
						platformQuery.data?.platform === "k8s"
							? platformQuery.data
							: undefined
					}
					isLoading={activityStats.isLoading || platformQuery.isLoading}
				/>

				<K8sJobsSection />
			</div>
		</>
	);
}

/**
 * AWS ECS-specific page content
 */
function AWSContent() {
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

	return (
		<>
			<PageHeaderActions>
				<LiveIndicator lastUpdated={lastUpdated} />

				<Button
					variant="outline"
					size="sm"
					onClick={handleManualRefresh}
					disabled={isManualRefreshing}
				>
					<RefreshCw
						className={`size-3! ${isManualRefreshing ? "animate-spin" : ""}`}
					/>
					Refresh
				</Button>
			</PageHeaderActions>

			<div className="space-y-6 mt-6">
				<InfrastructureStatsCards
					activityStats={activityStats.data}
					platform={
						platformQuery.data?.platform === "aws"
							? platformQuery.data
							: undefined
					}
					isLoading={activityStats.isLoading || platformQuery.isLoading}
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
		</>
	);
}

/**
 * Local development page content
 */
function LocalContent() {
	return (
		<>
			<PageHeaderActions>
				<LiveIndicator />
			</PageHeaderActions>

			<div className="space-y-6 mt-6">
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
		</>
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
}: {
	platform: "k8s" | "aws" | "coolify" | "local";
}) {
	switch (platform) {
		case "coolify":
			return <CoolifyContent />;
		case "k8s":
			return <K8sContent />;
		case "aws":
			return <AWSContent />;
		case "local":
			return <LocalContent />;
	}
}

export default function InfrastructurePage() {
	const platformQuery = api.infrastructure.getPlatform.useQuery(undefined, {
		staleTime: 60000, // Platform type doesn't change often
	});

	if (platformQuery.isLoading || !platformQuery.data) {
		return <InfrastructurePageSkeleton />;
	}

	const platform = platformQuery.data.platform;

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

				<PlatformContent platform={platform} />
			</PageHeader>
		</div>
	);
}
