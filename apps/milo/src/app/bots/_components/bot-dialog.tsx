"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
	Activity,
	Calendar,
	Camera,
	Clock,
	ExternalLink,
	Heart,
	Radio,
	Server,
	Terminal,
	Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import ErrorAlert from "@/components/custom/error-alert";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { LogsTab } from "./logs-tab";
import { PlatformTab } from "./platform-tab";
import { ScreenshotViewer } from "./screenshot-viewer";

interface BotDialogProps {
	botId: number | null;
	onClose: () => void;
}

const STATUS_CONFIG: Record<
	string,
	{ color: string; bgColor: string; dotColor: string; pulse?: boolean }
> = {
	CREATED: {
		color: "text-slate-600 dark:text-slate-400",
		bgColor: "bg-slate-100 dark:bg-slate-800",
		dotColor: "text-slate-400",
	},
	DEPLOYING: {
		color: "text-blue-600 dark:text-blue-400",
		bgColor: "bg-blue-50 dark:bg-blue-950",
		dotColor: "text-blue-500",
		pulse: true,
	},
	JOINING_CALL: {
		color: "text-amber-600 dark:text-amber-400",
		bgColor: "bg-amber-50 dark:bg-amber-950",
		dotColor: "text-amber-500",
		pulse: true,
	},
	IN_WAITING_ROOM: {
		color: "text-amber-600 dark:text-amber-400",
		bgColor: "bg-amber-50 dark:bg-amber-950",
		dotColor: "text-amber-500",
		pulse: true,
	},
	IN_CALL: {
		color: "text-green-600 dark:text-green-400",
		bgColor: "bg-green-50 dark:bg-green-950",
		dotColor: "text-green-500",
		pulse: true,
	},
	RECORDING: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950",
		dotColor: "text-red-500",
		pulse: true,
	},
	LEAVING: {
		color: "text-orange-600 dark:text-orange-400",
		bgColor: "bg-orange-50 dark:bg-orange-950",
		dotColor: "text-orange-500",
		pulse: true,
	},
	CALL_ENDED: {
		color: "text-slate-600 dark:text-slate-400",
		bgColor: "bg-slate-100 dark:bg-slate-800",
		dotColor: "text-slate-400",
	},
	DONE: {
		color: "text-slate-600 dark:text-slate-400",
		bgColor: "bg-slate-100 dark:bg-slate-800",
		dotColor: "text-slate-400",
	},
	FATAL: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950",
		dotColor: "text-red-500",
	},
};

function formatStatus(status: string): string {
	return status
		.split("_")
		.map((word) => word.charAt(0) + word.slice(1).toLowerCase())
		.join(" ");
}

const REFRESH_INTERVAL_MS = 5_000; // Auto-refresh every 5 seconds when dialog is open

export function BotDialog({ botId, onClose }: BotDialogProps) {
	const [activeTab, setActiveTab] = useState<
		"details" | "logs" | "screenshots" | "chat" | "platform"
	>("details");

	const {
		data: bot,
		isLoading: isBotLoading,
		error: botError,
		isRefetching: isBotRefetching,
		refetch: refetchBot,
	} = api.bots.getBot.useQuery(
		{ id: String(botId) },
		{
			enabled: !!botId,
			refetchInterval: REFRESH_INTERVAL_MS,
			refetchIntervalInBackground: true,
		},
	);

	const {
		data: events = [],
		isLoading: isEventsLoading,
		error: eventsError,
	} = api.events.getEventsForBot.useQuery(
		{ botId: String(botId) },
		{
			enabled: !!botId,
			refetchInterval: REFRESH_INTERVAL_MS,
			refetchIntervalInBackground: true,
		},
	);

	// ─── Prefetch Logs Tab Data ───────────────────────────────────────────────────
	// Prefetch historical logs to avoid layout shift when switching to logs tab
	// (Live logs use cursor-based fetching which can't be prefetched effectively)
	const isActive = Boolean(
		bot?.status && !["DONE", "FATAL"].includes(bot.status),
	);

	api.bots.logs.getHistorical.useQuery(
		{ botId: String(botId), limit: 500 },
		{ enabled: !!botId && !isActive },
	);

	// ─── Prefetch Platform Tab Data ───────────────────────────────────────────────
	// Prefetch K8s job data to avoid layout shift when switching to platform tab
	api.infrastructure.k8s.getJob.useQuery(
		{ jobName: bot?.platformIdentifier ?? "" },
		{
			enabled:
				!!botId &&
				bot?.deploymentPlatform === "k8s" &&
				!!bot?.platformIdentifier,
		},
	);

	const statusConfig = bot?.status
		? STATUS_CONFIG[bot.status] || STATUS_CONFIG.CREATED
		: STATUS_CONFIG.CREATED;

	const eventColumns: ColumnDef<(typeof events)[number]>[] = [
		{
			accessorKey: "eventTime",
			header: "Time",
			cell: ({ row }) => (
				<span className="text-muted-foreground tabular-nums text-xs">
					{format(new Date(row.original.eventTime), "PPp")}
				</span>
			),
		},
		{
			accessorKey: "eventType",
			header: "Event",
			cell: ({ row }) => {
				const eventType = row.original.eventType;
				const config = STATUS_CONFIG[eventType] || STATUS_CONFIG.CREATED;

				return (
					<Badge
						variant="outline"
						className={cn(
							config.bgColor,
							config.color,
							"border-transparent text-xs font-medium",
						)}
					>
						{formatStatus(eventType)}
					</Badge>
				);
			},
		},
		{
			accessorKey: "data",
			header: "Details",
			cell: ({ row }) => {
				const data = row.original.data;

				const description =
					data && "description" in data ? data.description : null;

				return (
					<span className="text-sm text-muted-foreground truncate max-w-[300px] block">
						{description || "—"}
					</span>
				);
			},
		},
	];

	const hasScreenshots = (bot?.screenshots?.length ?? 0) > 0;

	const hasPlatform = Boolean(bot?.deploymentPlatform);

	const tabs = [
		{ id: "details" as const, label: "Overview", icon: Radio },
		{ id: "logs" as const, label: "Logs", icon: Terminal },
		...(hasPlatform
			? [{ id: "platform" as const, label: "Platform", icon: Server }]
			: []),
		...(hasScreenshots
			? [
					{
						id: "screenshots" as const,
						label: `Screenshots (${bot?.screenshots?.length ?? 0})`,
						icon: Camera,
					},
				]
			: []),
	];

	return (
		<Dialog open={!!botId} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-4xl h-[696px] p-0 gap-0 overflow-hidden border-0 flex flex-col [&>button]:text-white">
				{/* Header */}
				<div className="bg-linear-to-r from-zinc-900 to-zinc-800 px-6 py-5 border-b border-zinc-700">
					<DialogHeader className="space-y-3">
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-4">
								{/* Platform Icon */}
								{isBotLoading ? (
									<Skeleton className="h-12 w-12 rounded-xl bg-zinc-700" />
								) : null}
								{!isBotLoading && bot?.meeting.platform ? (
									<div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
										<Image
											src={`/platform-logos/${bot.meeting.platform}.svg`}
											alt={bot.meeting.platform as string}
											width={28}
											height={28}
										/>
									</div>
								) : null}

								<div className="space-y-1">
									<DialogTitle className="text-white text-lg font-semibold tracking-tight">
										{isBotLoading ? (
											<Skeleton className="h-5 w-48 bg-zinc-700" />
										) : (
											bot?.displayName || "Bot Details"
										)}
									</DialogTitle>
									<DialogDescription className="text-zinc-400 text-sm">
										{isBotLoading ? (
											<Skeleton className="h-4 w-64 bg-zinc-700" />
										) : (
											"Meeting details"
										)}
									</DialogDescription>
								</div>
							</div>
						</div>
					</DialogHeader>

					{/* Tab Navigation */}
					<div className="flex items-stretch mt-4 bg-zinc-800/50 rounded-lg">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									"flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-150 first:rounded-l-lg last:rounded-r-lg",
									activeTab === tab.id
										? "bg-white !text-zinc-900"
										: "text-zinc-400 hover:text-white hover:bg-zinc-700/50",
								)}
							>
								<tab.icon className="h-4 w-4" />
								{tab.label}
							</button>
						))}
					</div>
				</div>

				{/* Tab Content */}
				<div className="flex-1 overflow-y-auto">
					{activeTab === "details" && (
						<div className="p-6 h-full space-y-6">
							{botError ? (
								<ErrorAlert errorMessage={botError.message} />
							) : (
								<>
									<div className="grid grid-cols-2 gap-6">
										{/* Meeting Info Card */}
										<div className="space-y-4">
											<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
												Meeting Information
											</h3>
											<div className="space-y-3">
												<InfoRow
													icon={Calendar}
													label="Scheduled"
													loading={isBotLoading}
												>
													{bot?.startTime
														? format(new Date(bot.startTime), "PPP")
														: "Not scheduled"}
												</InfoRow>

												<InfoRow
													icon={Clock}
													label="Time"
													loading={isBotLoading}
												>
													{bot?.startTime && bot?.endTime
														? `${format(new Date(bot.startTime), "p")} - ${format(new Date(bot.endTime), "p")}`
														: "—"}
												</InfoRow>

												<InfoRow
													icon={Video}
													label="Recording"
													loading={isBotLoading}
												>
													<RecordingStatus
														recording={bot?.recording}
														recordingEnabled={bot?.recordingEnabled}
													/>
												</InfoRow>
											</div>
										</div>

										{/* Bot Status Card */}
										<div className="space-y-4">
											<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
												Bot Status
											</h3>
											<div className="space-y-3">
												<InfoRow
													icon={Radio}
													label="Status"
													loading={isBotLoading}
												>
													{bot?.status ? (
														<Badge
															variant="outline"
															className={cn(
																statusConfig.bgColor,
																statusConfig.color,
																"border-transparent",
															)}
														>
															{formatStatus(bot.status)}
														</Badge>
													) : (
														"—"
													)}
												</InfoRow>

												<InfoRow
													icon={Heart}
													label="Last Heartbeat"
													loading={isBotLoading}
												>
													{bot?.lastHeartbeat ? (
														<span className="tabular-nums">
															{formatDistanceToNow(
																new Date(bot.lastHeartbeat),
																{
																	addSuffix: true,
																},
															)}
														</span>
													) : (
														<span className="text-muted-foreground">
															No heartbeat
														</span>
													)}
												</InfoRow>

												<InfoRow
													icon={Activity}
													label="Events"
													loading={isEventsLoading}
												>
													<span className="tabular-nums">{events.length}</span>
												</InfoRow>

												<InfoRow
													icon={Clock}
													label="Created"
													loading={isBotLoading}
												>
													{bot?.createdAt ? (
														<span className="tabular-nums">
															{formatDistanceToNow(new Date(bot.createdAt), {
																addSuffix: true,
															})}
														</span>
													) : (
														"—"
													)}
												</InfoRow>
											</div>
										</div>
									</div>

									{/* Events Section */}
									<div className="space-y-4">
										<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Events
										</h3>
										<DataTable
											columns={eventColumns}
											data={events}
											isLoading={isBotLoading || isEventsLoading}
											errorMessage={eventsError?.message}
										/>
									</div>
								</>
							)}
						</div>
					)}

					{activeTab === "logs" && botId ? (
						<LogsTab botId={botId} botStatus={bot?.status} />
					) : null}

					{activeTab === "platform" ? (
						<PlatformTab
							deploymentPlatform={
								bot?.deploymentPlatform as
									| "k8s"
									| "coolify"
									| "aws"
									| "local"
									| null
							}
							platformIdentifier={bot?.platformIdentifier ?? null}
							botStatus={bot?.status}
						/>
					) : null}

					{activeTab === "screenshots" && (
						<div className="h-full p-3">
							<ScreenshotViewer
								screenshots={bot?.screenshots ?? []}
								isLoading={isBotLoading}
								isRefetching={isBotRefetching}
								onRefresh={() => refetchBot()}
							/>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

interface InfoRowProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	loading?: boolean;
	children: React.ReactNode;
}

function InfoRow({ icon: Icon, label, loading, children }: InfoRowProps) {
	return (
		<div className="flex items-center gap-3 py-2 border-b border-dashed border-border/50 last:border-0">
			<div className="flex items-center gap-2 min-w-[120px]">
				<Icon className="h-4 w-4 text-muted-foreground/70" />
				<span className="text-sm text-muted-foreground">{label}</span>
			</div>
			<div className="text-sm font-medium">
				{loading ? <Skeleton className="h-4 w-32" /> : children}
			</div>
		</div>
	);
}

interface RecordingStatusProps {
	recording: string | null | undefined;
	recordingEnabled: boolean | undefined;
}

function RecordingStatus({
	recording,
	recordingEnabled,
}: RecordingStatusProps) {
	if (recording) {
		return (
			<Link
				href={recording}
				target="_blank"
				className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 transition-colors"
			>
				View Recording
				<ExternalLink className="h-3 w-3" />
			</Link>
		);
	}

	if (recordingEnabled) {
		return <span className="text-amber-600">Recording enabled</span>;
	}

	return <span className="text-muted-foreground">Disabled</span>;
}
