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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { env } from "@/env";
import { api } from "@/trpc/react";

import { InfrastructureTable } from "./_components/infrastructure-table";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "k8s" | "aws" | "coolify" | "local";

/** Refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL = 5000;

// ─── Platform Configuration ───────────────────────────────────────────────────

/**
 * Platform icon mapping
 */
function PlatformIcon({
	platform,
	className,
}: {
	platform: Platform | undefined;
	className?: string;
}) {
	const icons: Record<Platform, typeof Server> = {
		k8s: Container,
		aws: Cloud,
		coolify: Hexagon,
		local: Server,
	};

	const Icon = (platform ? icons[platform] : undefined) ?? Server;

	return <Icon className={className} />;
}

/**
 * Platform display names
 */
const PLATFORM_NAMES: Record<Platform, string> = {
	k8s: "Kubernetes",
	aws: "AWS ECS",
	coolify: "Coolify",
	local: "Local",
};

/**
 * Platform descriptions
 */
const PLATFORM_DESCRIPTIONS: Record<Platform, string> = {
	k8s: "Monitor Kubernetes Jobs and bot deployments",
	aws: "Monitor AWS ECS tasks and bot deployments",
	coolify: "Monitor bot pool capacity and deployment queue",
	local: "Local development mode",
};

// ─── Stats Card Component ─────────────────────────────────────────────────────

interface StatsCardProps {
	title: string;
	value: number;
	color: "green" | "blue" | "amber" | "red" | "gray";
	isLoading?: boolean;
}

function StatsCard({ title, value, color, isLoading }: StatsCardProps) {
	const colorClasses = {
		green: "text-green-500",
		blue: "text-blue-500",
		amber: "text-amber-500",
		red: "text-destructive",
		gray: "text-muted-foreground",
	};

	if (isLoading) {
		return (
			<Card>
				<CardHeader className="pb-2">
					<Skeleton className="h-4 w-20" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-8 w-12" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground">
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className={`text-2xl font-bold ${colorClasses[color]}`}>
					{value}
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Coolify Stats Cards ──────────────────────────────────────────────────────

function CoolifyStatsCards() {
	const { data, isLoading } = api.infrastructure.coolify.getStats.useQuery(
		undefined,
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatsCard
				title="Idle"
				value={data?.IDLE ?? 0}
				color="gray"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Deploying"
				value={data?.DEPLOYING ?? 0}
				color="blue"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Healthy"
				value={data?.HEALTHY ?? 0}
				color="green"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Error"
				value={data?.ERROR ?? 0}
				color="red"
				isLoading={isLoading}
			/>
		</div>
	);
}

// ─── K8s Stats Cards ──────────────────────────────────────────────────────────

function K8sStatsCards() {
	const { data, isLoading } = api.infrastructure.k8s.getStats.useQuery(
		undefined,
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatsCard
				title="Pending"
				value={data?.PENDING ?? 0}
				color="amber"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Active"
				value={data?.ACTIVE ?? 0}
				color="green"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Succeeded"
				value={data?.SUCCEEDED ?? 0}
				color="gray"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Failed"
				value={data?.FAILED ?? 0}
				color="red"
				isLoading={isLoading}
			/>
		</div>
	);
}

// ─── AWS Stats Cards ──────────────────────────────────────────────────────────

function AWSStatsCards() {
	const { data, isLoading } = api.infrastructure.aws.getStats.useQuery(
		undefined,
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatsCard
				title="Provisioning"
				value={data?.PROVISIONING ?? 0}
				color="amber"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Running"
				value={data?.RUNNING ?? 0}
				color="green"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Stopped"
				value={data?.STOPPED ?? 0}
				color="gray"
				isLoading={isLoading}
			/>
			<StatsCard
				title="Failed"
				value={data?.FAILED ?? 0}
				color="red"
				isLoading={isLoading}
			/>
		</div>
	);
}

// ─── Local Stats Cards ────────────────────────────────────────────────────────

function LocalStatsCards() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Local Development Mode</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground">
					Running in local development mode. No infrastructure metrics
					available.
				</p>
			</CardContent>
		</Card>
	);
}

// ─── Platform Stats Cards ─────────────────────────────────────────────────────

function PlatformStatsCards({ platform }: { platform: Platform | undefined }) {
	switch (platform) {
		case "coolify":
			return <CoolifyStatsCards />;
		case "k8s":
			return <K8sStatsCards />;
		case "aws":
			return <AWSStatsCards />;
		default:
			return <LocalStatsCards />;
	}
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function InfrastructurePage() {
	const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);

	const platform = env.NEXT_PUBLIC_DEPLOYMENT_PLATFORM;

	// Update last updated timestamp
	useEffect(() => {
		const interval = setInterval(() => {
			setLastUpdated(new Date());
		}, REFRESH_INTERVAL);

		return () => clearInterval(interval);
	}, []);

	const handleRefresh = async () => {
		setIsManualRefreshing(true);
		await new Promise((resolve) => setTimeout(resolve, 500));
		setIsManualRefreshing(false);
		setLastUpdated(new Date());
	};

	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<div className="flex items-center gap-2">
						<PageHeaderTitle className="mb-2">Infrastructure</PageHeaderTitle>

						<PlatformIcon platform={platform} className="h-5 w-5" />

						<span className="text-sm text-muted-foreground">
							{PLATFORM_NAMES[platform] ?? "Unknown"}
						</span>
					</div>
					<PageHeaderDescription>
						{PLATFORM_DESCRIPTIONS[platform] ?? "Infrastructure monitoring"}
					</PageHeaderDescription>
				</PageHeaderContent>
				<PageHeaderActions>
					<LiveIndicator lastUpdated={lastUpdated} />
					<Button
						variant="outline"
						size="icon"
						onClick={handleRefresh}
						disabled={isManualRefreshing}
					>
						<RefreshCw
							className={`h-4 w-4 ${isManualRefreshing ? "animate-spin" : ""}`}
						/>
					</Button>
				</PageHeaderActions>
			</PageHeader>

			<PlatformStatsCards platform={platform} />

			{platform !== "local" ? (
				<InfrastructureTable
					platform={platform as "k8s" | "aws" | "coolify" | undefined}
				/>
			) : null}
		</div>
	);
}
