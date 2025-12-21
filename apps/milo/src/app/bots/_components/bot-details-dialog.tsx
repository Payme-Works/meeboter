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
	MessageSquare,
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
import { ChatHistoryPanel } from "./chat-history-panel";
import { LogsTab } from "./logs-tab";
import { ScreenshotViewer } from "./screenshot-viewer";

interface BotDetailsDialogProps {
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

const SCREENSHOT_REFRESH_INTERVAL_MS = 5_000; // Refresh every 5 seconds when viewing screenshots

export function BotDetailsDialog({ botId, onClose }: BotDetailsDialogProps) {
	const [activeTab, setActiveTab] = useState<
		"details" | "events" | "logs" | "screenshots" | "chat"
	>("details");

	// Auto-refresh when viewing screenshots tab
	const isScreenshotsTabActive = activeTab === "screenshots";

	const {
		data: bot,
		isLoading: botLoading,
		error: botError,
		isRefetching: botRefetching,
		refetch: refetchBot,
	} = api.bots.getBot.useQuery(
		{ id: String(botId) },
		{
			enabled: !!botId,
			refetchInterval: isScreenshotsTabActive
				? SCREENSHOT_REFRESH_INTERVAL_MS
				: false,
			refetchIntervalInBackground: true, // Keep refreshing even when browser tab is not focused
		},
	);

	const {
		data: events = [],
		isLoading: eventsLoading,
		error: eventsError,
	} = api.events.getEventsForBot.useQuery(
		{ botId: String(botId) },
		{ enabled: !!botId },
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

	const tabs = [
		{ id: "details" as const, label: "Overview", icon: Radio },
		{ id: "events" as const, label: "Events", icon: Activity },
		{ id: "logs" as const, label: "Logs", icon: Terminal },
		...(hasScreenshots
			? [
					{
						id: "screenshots" as const,
						label: `Screenshots (${bot?.screenshots?.length ?? 0})`,
						icon: Camera,
					},
				]
			: []),
		...(bot?.chatEnabled
			? [{ id: "chat" as const, label: "Chat", icon: MessageSquare }]
			: []),
	];

	return (
		<Dialog open={!!botId} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-3xl p-0 gap-0 overflow-hidden border-0 [&>button]:text-white">
				{/* Header */}
				<div className="bg-linear-to-r from-zinc-900 to-zinc-800 px-6 py-5 border-b border-zinc-700">
					<DialogHeader className="space-y-3">
						<div className="flex items-start justify-between">
							<div className="flex items-center gap-4">
								{/* Platform Icon */}
								{botLoading ? (
									<Skeleton className="h-12 w-12 rounded-xl bg-zinc-700" />
								) : null}
								{!botLoading && bot?.meetingInfo.platform ? (
									<div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
										<Image
											src={`/platform-logos/${bot.meetingInfo.platform}.svg`}
											alt={bot.meetingInfo.platform as string}
											width={28}
											height={28}
										/>
									</div>
								) : null}

								<div className="space-y-1">
									<DialogTitle className="text-white text-lg font-semibold tracking-tight">
										{botLoading ? (
											<Skeleton className="h-5 w-48 bg-zinc-700" />
										) : (
											bot?.botDisplayName || "Bot Details"
										)}
									</DialogTitle>
									<DialogDescription className="text-zinc-400 text-sm">
										{botLoading ? (
											<Skeleton className="h-4 w-64 bg-zinc-700" />
										) : (
											bot?.meetingTitle || "Meeting details"
										)}
									</DialogDescription>
								</div>
							</div>
						</div>
					</DialogHeader>

					{/* Tab Navigation */}
					<div className="flex items-stretch mt-4 bg-zinc-800/50 rounded-lg w-fit">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={cn(
									"flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-150 first:rounded-l-lg last:rounded-r-lg",
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
				<div className="max-h-[60vh] overflow-y-auto">
					{activeTab === "details" && (
						<div className="p-6">
							{botError ? (
								<ErrorAlert errorMessage={botError.message} />
							) : (
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
												loading={botLoading}
											>
												{bot?.startTime
													? format(new Date(bot.startTime), "PPP")
													: "Not scheduled"}
											</InfoRow>

											<InfoRow icon={Clock} label="Time" loading={botLoading}>
												{bot?.startTime && bot?.endTime
													? `${format(new Date(bot.startTime), "p")} - ${format(new Date(bot.endTime), "p")}`
													: "—"}
											</InfoRow>

											<InfoRow
												icon={Video}
												label="Recording"
												loading={botLoading}
											>
												<RecordingStatus
													recording={bot?.recording}
													recordingEnabled={bot?.recordingEnabled}
												/>
											</InfoRow>

											<InfoRow
												icon={MessageSquare}
												label="Chat"
												loading={botLoading}
											>
												<Badge
													variant="outline"
													className={cn(
														"text-xs",
														bot?.chatEnabled
															? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
															: "bg-muted text-muted-foreground",
													)}
												>
													{bot?.chatEnabled ? "Enabled" : "Disabled"}
												</Badge>
											</InfoRow>
										</div>
									</div>

									{/* Bot Status Card */}
									<div className="space-y-4">
										<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Bot Status
										</h3>
										<div className="space-y-3">
											<InfoRow icon={Radio} label="Status" loading={botLoading}>
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
												icon={Server}
												label="Pool Slot"
												loading={botLoading}
											>
												{bot?.poolSlotName ? (
													<span className="font-mono text-xs">
														{bot.poolSlotName}
													</span>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</InfoRow>

											<InfoRow
												icon={Heart}
												label="Last Heartbeat"
												loading={botLoading}
											>
												{bot?.lastHeartbeat ? (
													<span className="tabular-nums">
														{formatDistanceToNow(new Date(bot.lastHeartbeat), {
															addSuffix: true,
														})}
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
												loading={eventsLoading}
											>
												<span className="tabular-nums">{events.length}</span>
											</InfoRow>

											<InfoRow
												icon={Clock}
												label="Created"
												loading={botLoading}
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
							)}
						</div>
					)}

					{activeTab === "events" && (
						<div className="p-6">
							<DataTable
								columns={eventColumns}
								data={events}
								isLoading={botLoading || eventsLoading}
								errorMessage={eventsError?.message}
							/>
						</div>
					)}

					{activeTab === "logs" && botId ? (
						<LogsTab botId={botId} botStatus={bot?.status} />
					) : null}

					{activeTab === "screenshots" && (
						<div className="p-6">
							<ScreenshotViewer
								screenshots={bot?.screenshots ?? []}
								isLoading={botLoading}
								isRefetching={botRefetching}
								onRefresh={() => refetchBot()}
							/>
						</div>
					)}

					{activeTab === "chat" && botId && bot?.chatEnabled && (
						<div className="p-6">
							<ChatHistoryPanel botId={botId} />
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
