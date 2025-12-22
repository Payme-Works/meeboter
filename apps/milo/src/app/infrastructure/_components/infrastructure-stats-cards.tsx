"use client";

import { CheckCircle, Container, Loader, Phone, Server } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityStats {
	deploying: number;
	joiningCall: number;
	inWaitingRoom: number;
	inCall: number;
	callEnded: number;
	todayTotal: number;
	todayCompleted: number;
	todayFailed: number;
}

interface K8sPlatform {
	platform: "k8s";
	activeJobs: number;
	pendingJobs: number;
	completedJobs: number;
	namespace: string;
}

interface AWSPlatform {
	platform: "aws";
	runningTasks: number;
	cluster: string;
	region: string;
}

interface InfrastructureStatsCardsProps {
	activityStats: ActivityStats | undefined;
	platform: K8sPlatform | AWSPlatform | undefined;
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

function PlatformSpecificCard({
	platform,
	activityStats,
}: {
	platform: K8sPlatform | AWSPlatform | undefined;
	activityStats: ActivityStats;
}) {
	if (platform?.platform === "k8s") {
		return (
			<StatCard>
				<StatCardContent>
					<StatCardLabel>Kubernetes</StatCardLabel>
					<StatCardValue>{platform.activeJobs}</StatCardValue>
					<StatCardSubtext>active jobs in {platform.namespace}</StatCardSubtext>
					<StatCardIcon>
						<Container className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>
		);
	}

	if (platform?.platform === "aws") {
		return (
			<StatCard>
				<StatCardContent>
					<StatCardLabel>AWS ECS</StatCardLabel>
					<StatCardValue>{platform.runningTasks}</StatCardValue>
					<StatCardSubtext>tasks in {platform.region}</StatCardSubtext>
					<StatCardIcon>
						<Container className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>
		);
	}

	return (
		<StatCard>
			<StatCardContent>
				<StatCardLabel>Today</StatCardLabel>
				<StatCardValue>
					{activityStats.todayCompleted}/{activityStats.todayTotal}
				</StatCardValue>
				<StatCardSubtext>
					{activityStats.todayFailed > 0 ? (
						<span className="text-destructive">
							{activityStats.todayFailed} failed
						</span>
					) : (
						"completed today"
					)}
				</StatCardSubtext>
				<StatCardIcon>
					<CheckCircle className="h-4 w-4" />
				</StatCardIcon>
			</StatCardContent>
		</StatCard>
	);
}

function SkeletonCard() {
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
		</div>
	);
}

export function InfrastructureStatsCards({
	activityStats,
	platform,
	isLoading,
}: InfrastructureStatsCardsProps) {
	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
			</div>
		);
	}

	if (!activityStats) {
		return (
			<div className="bg-card border border-border p-8 text-center">
				<p className="text-muted-foreground font-mono text-sm">
					Statistics unavailable
				</p>
			</div>
		);
	}

	const totalActive =
		activityStats.deploying +
		activityStats.joiningCall +
		activityStats.inWaitingRoom +
		activityStats.inCall;

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
			className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
		>
			{/* Active Bots */}
			<StatCard>
				<StatCardContent>
					<StatCardLabel>Active Bots</StatCardLabel>
					<StatCardValue>{totalActive}</StatCardValue>
					<StatCardSubtext>currently running</StatCardSubtext>
					<StatCardIcon>
						<Server className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			{/* In Call */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-green-500/10 text-green-500">
						[IN_CALL]
					</StatCardBadge>
					<StatCardValue>{activityStats.inCall}</StatCardValue>
					<StatCardSubtext>bots in meetings</StatCardSubtext>
					<StatCardIcon>
						<Phone className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			{/* Deploying */}
			<StatCard>
				<StatCardContent>
					<StatCardBadge className="bg-blue-500/10 text-blue-500">
						[DEPLOYING]
					</StatCardBadge>
					<StatCardValue>{activityStats.deploying}</StatCardValue>
					<StatCardSubtext>starting up</StatCardSubtext>
					<StatCardIcon>
						<Loader className="h-4 w-4" />
					</StatCardIcon>
				</StatCardContent>
			</StatCard>

			<PlatformSpecificCard platform={platform} activityStats={activityStats} />
		</motion.div>
	);
}
