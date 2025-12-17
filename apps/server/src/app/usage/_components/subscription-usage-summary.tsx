"use client";

import { Bot, Crown, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

function AnimatedNumber({ value }: { value: number | string }) {
	return (
		<motion.span
			key={value}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			{value}
		</motion.span>
	);
}

function StatCard({
	label,
	value,
	subtext,
	icon: Icon,
	variant = "default",
	badge,
	progress,
}: {
	label: string;
	value: string | number;
	subtext?: string;
	icon: React.ElementType;
	variant?: "default" | "highlight" | "accent";
	badge?: { text: string; variant: "default" | "secondary" | "outline" };
	progress?: { value: number; label: string };
}) {
	const variants = {
		default: "bg-card border border-border",
		highlight:
			"bg-gradient-to-br from-accent/5 via-accent/10 to-accent/5 border border-accent/20",
		accent: "bg-accent text-accent-foreground",
	};

	const iconVariants = {
		default: "bg-muted text-muted-foreground",
		highlight: "bg-accent/20 text-accent",
		accent: "bg-accent-foreground/20 text-accent-foreground",
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: "easeOut" }}
			className={`relative overflow-hidden p-5 ${variants[variant]}`}
		>
			{/* Decorative corner accent */}
			{variant === "highlight" ? (
				<div className="absolute top-0 right-0 w-20 h-20 bg-accent/10 blur-2xl" />
			) : null}

			<div className="relative flex items-start justify-between gap-4">
				<div className="flex-1 space-y-1">
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</p>
					<div className="flex items-end gap-3">
						<span className="text-3xl font-bold tabular-nums tracking-tight">
							<AnimatedNumber value={value} />
						</span>
						{badge ? (
							<Badge variant={badge.variant} className="text-[10px] mb-1">
								{badge.text}
							</Badge>
						) : null}
					</div>
					{subtext ? (
						<p className="text-xs text-muted-foreground">{subtext}</p>
					) : null}
				</div>

				<div className={`p-2.5 ${iconVariants[variant]}`}>
					<Icon className="h-4 w-4" />
				</div>
			</div>

			{/* Progress bar */}
			{progress ? (
				<div className="mt-4 space-y-1.5">
					<div className="h-1.5 w-full bg-muted overflow-hidden">
						<motion.div
							initial={{ width: 0 }}
							animate={{ width: `${progress.value}%` }}
							transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
							className="h-full bg-accent"
						/>
					</div>
					<p className="text-[10px] text-muted-foreground tabular-nums">
						{progress.label}
					</p>
				</div>
			) : null}
		</motion.div>
	);
}

function SkeletonCard({ hasProgress = false }: { hasProgress?: boolean }) {
	return (
		<div className="bg-card border border-border p-5 min-h-[161px]">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-1">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-4 w-16" />
				</div>
				<Skeleton className="h-9 w-9" />
			</div>
			{hasProgress ? (
				<div className="mt-4 space-y-1.5">
					<Skeleton className="h-1.5 w-full" />
					<Skeleton className="h-3 w-28" />
				</div>
			) : null}
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<SkeletonCard />
			<SkeletonCard />
			<SkeletonCard hasProgress />
			<SkeletonCard />
		</div>
	);
}

export function SubscriptionUsageSummary() {
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const { data: subscriptionInfo, isLoading: subLoading } =
		api.bots.getUserSubscription.useQuery();

	const { data: dailyUsage, isLoading: usageLoading } =
		api.bots.getDailyUsage.useQuery({
			timeZone: userTimezone,
		});

	if (subLoading || usageLoading) {
		return <LoadingSkeleton />;
	}

	const formatPlanName = (plan: string) => {
		switch (plan) {
			case "FREE":
				return "Free";
			case "PRO":
				return "Pro";
			case "PAY_AS_YOU_GO":
				return "Pay-as-You-Go";
			case "CUSTOM":
				return "Enterprise";
			default:
				return plan;
		}
	};

	const getPlanIcon = (plan: string) => {
		switch (plan) {
			case "FREE":
				return Sparkles;
			case "PRO":
				return Zap;
			case "CUSTOM":
				return Crown;
			default:
				return Sparkles;
		}
	};

	const usagePercentage =
		subscriptionInfo?.effectiveDailyLimit && dailyUsage?.usage
			? Math.min(
					(dailyUsage.usage / subscriptionInfo.effectiveDailyLimit) * 100,
					100,
				)
			: 0;

	const formatLimit = (limit: number | null) => {
		return limit === null ? "∞" : limit.toString();
	};

	const getRemainingStatus = (remaining: number | null | undefined) => {
		if (remaining === null || remaining === undefined) return "No limits";

		if (remaining > 0) return "Available";

		return "Limit reached";
	};

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
		>
			{/* Current Plan - Highlight card */}
			<StatCard
				label="Current Plan"
				value={
					subscriptionInfo ? formatPlanName(subscriptionInfo.currentPlan) : "—"
				}
				icon={getPlanIcon(subscriptionInfo?.currentPlan || "FREE")}
				variant="highlight"
				badge={
					subscriptionInfo
						? {
								text: subscriptionInfo.subscriptionActive
									? "Active"
									: "Inactive",
								variant: subscriptionInfo.subscriptionActive
									? "default"
									: "secondary",
							}
						: undefined
				}
			/>

			{/* Daily Limit */}
			<StatCard
				label="Daily Bot Limit"
				value={
					subscriptionInfo
						? formatLimit(subscriptionInfo.effectiveDailyLimit)
						: "—"
				}
				subtext={
					subscriptionInfo?.customDailyBotLimit ? "Custom override" : "Per day"
				}
				icon={Bot}
			/>

			{/* Today's Usage - with progress */}
			<StatCard
				label="Today's Usage"
				value={dailyUsage ? dailyUsage.usage.toString() : "0"}
				subtext={`of ${dailyUsage ? formatLimit(dailyUsage.limit) : "0"} bots`}
				icon={Zap}
				progress={
					subscriptionInfo?.effectiveDailyLimit
						? {
								value: usagePercentage,
								label: `${Math.round(usagePercentage)}% of daily quota`,
							}
						: undefined
				}
			/>

			{/* Remaining */}
			<StatCard
				label="Remaining Today"
				value={
					dailyUsage?.remaining !== null
						? dailyUsage?.remaining?.toString() || "0"
						: "∞"
				}
				subtext={getRemainingStatus(dailyUsage?.remaining)}
				icon={Sparkles}
				variant={
					dailyUsage?.remaining !== null && dailyUsage?.remaining === 0
						? "default"
						: "default"
				}
			/>
		</motion.div>
	);
}
