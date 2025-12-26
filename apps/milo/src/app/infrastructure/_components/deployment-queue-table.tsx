"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { Clock, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/trpc/react";

// ─── Helper Functions ─────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

	if (seconds < 60) return `${seconds}s ago`;

	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

	return `${Math.floor(seconds / 3600)}h ago`;
}

function formatTimeRemaining(date: Date): string {
	const seconds = Math.floor((date.getTime() - Date.now()) / 1000);

	if (seconds <= 0) return "Expired";

	if (seconds < 60) return `${seconds}s`;

	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;

	return `${Math.floor(seconds / 3600)}h`;
}

// ─── Queue Stats Card ─────────────────────────────────────────────────────────

function QueueStatsCard() {
	const { data: stats, isLoading } = api.infrastructure.getQueueStats.useQuery(
		undefined,
		{
			refetchInterval: 5000,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	if (isLoading) {
		return (
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="flex items-center gap-2 text-sm font-medium">
						<Users className="h-4 w-4" />
						Deployment Queue
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse h-4 w-20 bg-muted rounded" />
				</CardContent>
			</Card>
		);
	}

	const avgWaitSec = Math.round((stats?.avgWaitMs ?? 0) / 1000);

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-sm font-medium">
					<Users className="h-4 w-4" />
					Deployment Queue
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-4">
					<div>
						<span className="text-2xl font-bold">{stats?.total ?? 0}</span>
						<span className="ml-1 text-sm text-muted-foreground">
							bots waiting
						</span>
					</div>
					{stats?.total && stats.total > 0 ? (
						<div className="flex items-center gap-1 text-sm text-muted-foreground">
							<Clock className="h-3 w-3" />
							<span>~{avgWaitSec}s avg wait</span>
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Queue Table ──────────────────────────────────────────────────────────────

function QueueTable() {
	const { data: queuedBots, isLoading } =
		api.infrastructure.getQueuedBots.useQuery(undefined, {
			refetchInterval: 5000,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		});

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8 text-muted-foreground">
				Loading queue...
			</div>
		);
	}

	if (!queuedBots || queuedBots.length === 0) {
		return (
			<div className="flex items-center justify-center py-8 text-muted-foreground">
				No bots in queue
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">#</TableHead>
					<TableHead>Bot</TableHead>
					<TableHead>Platform</TableHead>
					<TableHead>Queued</TableHead>
					<TableHead>Timeout</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{queuedBots.map((bot) => (
					<TableRow key={bot.id}>
						<TableCell className="font-mono">{bot.position}</TableCell>
						<TableCell>
							<div className="flex flex-col">
								<span className="font-medium">
									{bot.botName ?? `Bot ${bot.botId}`}
								</span>
								<span className="text-xs text-muted-foreground">
									ID: {bot.botId}
								</span>
							</div>
						</TableCell>
						<TableCell>
							<Badge variant="outline">{bot.meetingPlatform}</Badge>
						</TableCell>
						<TableCell className="text-muted-foreground">
							{formatTimeAgo(bot.queuedAt)}
						</TableCell>
						<TableCell>
							<Badge
								variant={
									bot.timeoutAt.getTime() - Date.now() < 60000
										? "destructive"
										: "secondary"
								}
							>
								{formatTimeRemaining(bot.timeoutAt)}
							</Badge>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function DeploymentQueueSection() {
	return (
		<div className="space-y-4">
			<QueueStatsCard />
			<Card>
				<CardContent className="pt-6">
					<QueueTable />
				</CardContent>
			</Card>
		</div>
	);
}
