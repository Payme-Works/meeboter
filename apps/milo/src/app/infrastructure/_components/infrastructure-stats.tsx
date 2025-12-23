"use client";

import { keepPreviousData } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Platform = "k8s" | "aws" | "coolify" | "local";

const REFRESH_INTERVAL = 5000;

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

// ─── Main Export ──────────────────────────────────────────────────────────────

export function InfrastructureStats({ platform }: { platform: Platform }) {
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
