"use client";

import { keepPreviousData } from "@tanstack/react-query";
import {
	Cloud,
	Container,
	DollarSign,
	Hexagon,
	TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

// ─── Constants ───────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 10000; // 10 seconds for cost data

// ─── Cost Formatting ─────────────────────────────────────────────────────────

/**
 * Formats cost with appropriate decimal places.
 * Shows more decimals for small amounts.
 */
function formatCost(cost: number): string {
	if (cost < 0.01) {
		return `$${cost.toFixed(4)}`;
	}

	if (cost < 1) {
		return `$${cost.toFixed(3)}`;
	}

	if (cost < 100) {
		return `$${cost.toFixed(2)}`;
	}

	return `$${Math.round(cost).toLocaleString()}`;
}

// ─── Platform Icons ──────────────────────────────────────────────────────────

const PLATFORM_ICONS = {
	k8s: Container,
	aws: Cloud,
	coolify: Hexagon,
} as const;

const PLATFORM_NAMES = {
	k8s: "Kubernetes",
	aws: "AWS ECS",
	coolify: "Coolify",
} as const;

// ─── Cost Card Component ─────────────────────────────────────────────────────

interface CostCardProps {
	title: string;
	value: number;
	subtitle?: string;
	icon?: React.ReactNode;
	highlight?: boolean;
	isLoading?: boolean;
}

function CostCard({
	title,
	value,
	subtitle,
	icon,
	highlight,
	isLoading,
}: CostCardProps) {
	if (isLoading) {
		return (
			<Card>
				<CardHeader className="pb-2">
					<Skeleton className="h-4 w-24" />
				</CardHeader>
				<CardContent>
					<Skeleton className="h-8 w-20" />
					<Skeleton className="h-3 w-16 mt-1" />
				</CardContent>
			</Card>
		);
	}

	return (
		<Card
			className={cn(highlight && "border-emerald-200 dark:border-emerald-800")}
		>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
					{icon}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div
					className={cn(
						"text-2xl font-normal font-mono",
						highlight
							? "text-emerald-600 dark:text-emerald-400"
							: "text-foreground",
					)}
				>
					{formatCost(value)}
				</div>
				{subtitle ? (
					<p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
				) : null}
			</CardContent>
		</Card>
	);
}

// ─── Unified Cost Summary ────────────────────────────────────────────────────

export function CostSummary() {
	const { data, isLoading } = api.infrastructure.getCostStats.useQuery(
		undefined,
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<DollarSign className="h-5 w-5 text-muted-foreground" />
				<h2 className="text-lg font-semibold">Cost Overview</h2>
			</div>

			{/* Summary Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<CostCard
					title="Current Hourly"
					value={data?.totalCurrentHourlyCost ?? 0}
					subtitle={`${data?.totalActiveBots ?? 0} active bots`}
					icon={<TrendingUp className="h-3.5 w-3.5" />}
					highlight
					isLoading={isLoading}
				/>
				<CostCard
					title="Last 24 Hours"
					value={data?.totalLast24hCost ?? 0}
					isLoading={isLoading}
				/>
				<CostCard
					title="Last 7 Days"
					value={data?.totalLast7dCost ?? 0}
					isLoading={isLoading}
				/>
				<CostCard
					title="Projected Monthly"
					value={data?.totalProjectedMonthlyCost ?? 0}
					subtitle="Based on last 7 days"
					isLoading={isLoading}
				/>
			</div>

			{/* Per-Platform Breakdown */}
			{data?.platforms && data.platforms.length > 1 ? (
				<div className="grid gap-4 md:grid-cols-3">
					{data.platforms.map((platform) => {
						const Icon = PLATFORM_ICONS[platform.platform];
						const name = PLATFORM_NAMES[platform.platform];

						return (
							<Card key={platform.platform} className="gap-2">
								<CardHeader className="pb-2">
									<CardTitle className="text-sm font-medium flex items-center gap-2">
										<Icon className="h-4 w-4 text-muted-foreground" />
										{name}
									</CardTitle>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<div className="text-muted-foreground text-xs">
												Active Bots
											</div>
											<div className="font-semibold tabular-nums">
												{platform.activeBots}
											</div>
										</div>
										<div>
											<div className="text-muted-foreground text-xs">
												Hourly Rate
											</div>
											<div className="font-normal font-mono text-emerald-600 dark:text-emerald-400">
												{formatCost(platform.currentHourlyCost)}/hr
											</div>
										</div>
										<div>
											<div className="text-muted-foreground text-xs">
												Last 30 Days
											</div>
											<div className="font-normal font-mono">
												{formatCost(platform.last30dCost)}
											</div>
										</div>
										<div>
											<div className="text-muted-foreground text-xs">
												Projected
											</div>
											<div className="font-normal font-mono">
												{formatCost(platform.projectedMonthlyCost)}/mo
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
