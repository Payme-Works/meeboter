"use client";

import { Clock, Hourglass } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface QueueEntry {
	id: number;
	botId: number;
	priority: number;
	queuedAt: Date;
	timeoutAt: Date;
	bot: {
		botDisplayName: string;
		meetingTitle: string;
		status: string;
	} | null;
}

interface PoolQueueSectionProps {
	entries: QueueEntry[] | undefined;
	isLoading: boolean;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes === 0) {
		return `${remainingSeconds}s`;
	}

	return `${minutes}m ${remainingSeconds}s`;
}

interface QueueEntryCardProps {
	entry: QueueEntry;
	index: number;
}

function QueueEntryCard({ entry, index }: QueueEntryCardProps) {
	const [waitingMs, setWaitingMs] = useState(0);
	const [remainingMs, setRemainingMs] = useState(0);

	useEffect(() => {
		const updateTimes = () => {
			const now = Date.now();
			const queuedTime = new Date(entry.queuedAt).getTime();
			const timeoutTime = new Date(entry.timeoutAt).getTime();

			setWaitingMs(now - queuedTime);
			setRemainingMs(Math.max(0, timeoutTime - now));
		};

		updateTimes();
		const interval = setInterval(updateTimes, 1000);

		return () => clearInterval(interval);
	}, [entry.queuedAt, entry.timeoutAt]);

	const isNearTimeout = remainingMs < 60000; // Less than 1 minute

	return (
		<motion.div
			initial={{ opacity: 0, x: -20 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{ duration: 0.3, delay: index * 0.1 }}
			className={`bg-card border p-4 ${
				isNearTimeout ? "border-destructive/50" : "border-border"
			}`}
		>
			<div className="flex items-start justify-between gap-4">
				{/* Bot info */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm font-semibold">
							Bot #{entry.botId}
						</span>
						<span className="font-mono text-[10px] px-1.5 py-0.5 bg-amber-500/10 text-amber-500 uppercase tracking-wider">
							[QUEUED]
						</span>
					</div>
					{entry.bot ? (
						<p className="text-xs text-muted-foreground mt-1 truncate">
							{entry.bot.botDisplayName} - {entry.bot.meetingTitle}
						</p>
					) : null}
				</div>

				{/* Priority badge */}
				<div className="shrink-0 text-right">
					<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
						Priority
					</span>
					<p className="font-mono text-sm font-semibold tabular-nums">
						{entry.priority}
					</p>
				</div>
			</div>

			{/* Time info */}
			<div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
				<div className="flex items-center gap-1.5">
					<Clock className="h-3 w-3 text-muted-foreground" />
					<span className="font-mono text-xs text-muted-foreground">
						Waiting:
					</span>
					<span className="font-mono text-xs font-medium tabular-nums">
						{formatDuration(waitingMs)}
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					<Hourglass
						className={`h-3 w-3 ${
							isNearTimeout ? "text-destructive" : "text-muted-foreground"
						}`}
					/>
					<span
						className={`font-mono text-xs ${
							isNearTimeout ? "text-destructive" : "text-muted-foreground"
						}`}
					>
						Timeout:
					</span>
					<span
						className={`font-mono text-xs font-medium tabular-nums ${
							isNearTimeout ? "text-destructive" : ""
						}`}
					>
						{formatDuration(remainingMs)}
					</span>
				</div>
			</div>
		</motion.div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-3">
			{[1, 2].map((i) => (
				<div key={i} className="bg-card border border-border p-4">
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 space-y-2">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="h-4 w-48" />
						</div>
						<Skeleton className="h-10 w-16" />
					</div>
					<div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-24" />
					</div>
				</div>
			))}
		</div>
	);
}

export function PoolQueueSection({
	entries,
	isLoading,
}: PoolQueueSectionProps) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold">Queue</h2>
					<Skeleton className="h-5 w-12" />
				</div>
				<LoadingSkeleton />
			</div>
		);
	}

	if (!entries || entries.length === 0) {
		return null; // Don't show section if queue is empty
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
			className="space-y-4"
		>
			<div className="flex items-center gap-2">
				<h2 className="text-lg font-semibold">Queue</h2>
				<span className="font-mono text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 tabular-nums">
					{entries.length} waiting
				</span>
			</div>

			<div className="space-y-3">
				{entries.map((entry, index) => (
					<QueueEntryCard key={entry.id} entry={entry} index={index} />
				))}
			</div>
		</motion.div>
	);
}
