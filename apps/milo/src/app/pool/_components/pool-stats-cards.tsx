"use client";

import { AlertTriangle, Box, CheckCircle, Loader, Server } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface PoolStats {
	total: number;
	idle: number;
	deploying: number;
	busy: number;
	error: number;
	maxSize: number;
}

interface PoolStatsCardsProps {
	stats: PoolStats | undefined;
	isLoading: boolean;
}

/**
 * Animated number component for smooth value transitions
 */
function AnimatedValue({ children }: { children: ReactNode }) {
	return (
		<motion.span
			key={String(children)}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, ease: "easeOut" }}
			className="text-3xl font-medium font-mono tabular-nums tracking-tight"
		>
			{children}
		</motion.span>
	);
}

function StatCard({ children }: { children: ReactNode }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: "easeOut" }}
			className="relative overflow-hidden bg-card border border-border p-5 min-h-[120px]"
		>
			{children}
		</motion.div>
	);
}

function StatCardContent({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex-1 space-y-1">{children}</div>
		</div>
	);
}

function StatCardBadge({
	children,
	className = "bg-muted text-muted-foreground",
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p
			className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-wider w-fit mr-12 ${className}`}
		>
			{children}
		</p>
	);
}

function StatCardLabel({ children }: { children: ReactNode }) {
	return (
		<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mr-12">
			{children}
		</p>
	);
}

function StatCardValue({ children }: { children: ReactNode }) {
	return <AnimatedValue>{children}</AnimatedValue>;
}

function StatCardSubtext({ children }: { children: ReactNode }) {
	return <p className="text-xs text-muted-foreground font-mono">{children}</p>;
}

function StatCardIcon({ children }: { children: ReactNode }) {
	return (
		<div className="p-2.5 bg-muted text-muted-foreground absolute top-5 right-5">
			{children}
		</div>
	);
}

function StatCardCapacityBar({ percent }: { percent: number }) {
	return (
		<div className="mt-4 space-y-1.5">
			<div className="h-1.5 w-full bg-muted overflow-hidden">
				<motion.div
					initial={{ width: 0 }}
					animate={{ width: `${percent}%` }}
					transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
					className="h-full bg-accent"
				/>
			</div>
			<p className="text-[10px] text-muted-foreground font-mono tabular-nums">
				{percent.toFixed(0)}% capacity used
			</p>
		</div>
	);
}

function SkeletonCard({ hasProgress = false }: { hasProgress?: boolean }) {
	return (
		<div className="bg-card border border-border p-5 min-h-[120px]">
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 space-y-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-8 w-16" />
					<Skeleton className="h-3 w-24" />
				</div>
				<Skeleton className="h-9 w-9" />
			</div>
			{hasProgress ? (
				<div className="mt-4 space-y-1.5">
					<Skeleton className="h-1.5 w-full" />
					<Skeleton className="h-3 w-20" />
				</div>
			) : null}
		</div>
	);
}

export function PoolStatsCards({ stats, isLoading }: PoolStatsCardsProps) {
	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
				<SkeletonCard hasProgress />
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
			</div>
		);
	}

	if (!stats) {
		return (
			<div className="bg-card border border-border p-8 text-center">
				<p className="text-muted-foreground font-mono text-sm">
					Pool statistics unavailable
				</p>
			</div>
		);
	}

	const capacityPercent = (stats.total / stats.maxSize) * 100;

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="grid gap-4 md:grid-cols-2 lg:grid-cols-5"
		>
			{/* Total Capacity */}
			<StatCard>
				<StatCardContent>
					<StatCardLabel>Total Capacity</StatCardLabel>
					<StatCardValue>
						{stats.total}/{stats.maxSize}
					</StatCardValue>
					<StatCardSubtext>slots provisioned</StatCardSubtext>
					<StatCardIcon>
						<Server className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
				<StatCardCapacityBar percent={capacityPercent} />
			</StatCard>

			{/* Idle */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-emerald-500/10 text-emerald-500">
						[IDLE]
					</StatCardBadge>
					<StatCardValue>{stats.idle}</StatCardValue>
					<StatCardSubtext>ready for assignment</StatCardSubtext>
					<StatCardIcon>
						<CheckCircle className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			{/* Deploying */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-accent/10 text-accent">
						[DEPLOYING]
					</StatCardBadge>
					<StatCardValue>{stats.deploying}</StatCardValue>
					<StatCardSubtext>starting containers</StatCardSubtext>
					<StatCardIcon>
						<Loader className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			{/* Busy */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-amber-500/10 text-amber-500">
						[BUSY]
					</StatCardBadge>
					<StatCardValue>{stats.busy}</StatCardValue>
					<StatCardSubtext>running bots</StatCardSubtext>
					<StatCardIcon>
						<Box className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			{/* Error */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-destructive/10 text-destructive">
						[ERROR]
					</StatCardBadge>
					<StatCardValue>{stats.error}</StatCardValue>
					<StatCardSubtext>need attention</StatCardSubtext>
					<StatCardIcon>
						<AlertTriangle className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>
		</motion.div>
	);
}
