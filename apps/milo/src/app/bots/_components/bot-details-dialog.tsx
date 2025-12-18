"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Activity, ExternalLinkIcon, MessageSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import ErrorAlert from "@/components/custom/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { ChatHistoryPanel } from "./chat-history-panel";

interface BotDetailsDialogProps {
	botId: number | null;
	onClose: () => void;
}

export function BotDetailsDialog({ botId, onClose }: BotDetailsDialogProps) {
	const [activeTab, setActiveTab] = useState<"details" | "events" | "chat">(
		"details",
	);

	const {
		data: bot,
		isLoading: botLoading,
		error: botError,
	} = api.bots.getBot.useQuery({ id: String(botId) }, { enabled: !!botId });

	const {
		data: events = [],
		isLoading: eventsLoading,
		error: eventsError,
	} = api.events.getEventsForBot.useQuery(
		{ botId: String(botId) },
		{ enabled: !!botId },
	);

	const eventColumns: ColumnDef<(typeof events)[number]>[] = [
		{
			accessorKey: "eventTime",
			header: "Time",
			cell: ({ row }) => format(new Date(row.original.eventTime), "PPp"),
		},
		{
			accessorKey: "eventType",
			header: "Event Type",
			cell: ({ row }) => {
				const eventType = row.original.eventType;

				return (
					<Badge variant="outline" className="bg-gray-100 text-gray-800">
						{eventType}
					</Badge>
				);
			},
		},
		{
			accessorKey: "description",
			header: "Description",
		},
	];

	return (
		<Dialog open={!!botId} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>Bot Details</DialogTitle>
				</DialogHeader>
				<DialogDescription></DialogDescription>

				{/* Tab Navigation */}
				<div className="flex border-b">
					<Button
						variant={activeTab === "details" ? "default" : "ghost"}
						size="sm"
						onClick={() => setActiveTab("details")}
						className="rounded-b-none"
					>
						Details
					</Button>
					<Button
						variant={activeTab === "events" ? "default" : "ghost"}
						size="sm"
						onClick={() => setActiveTab("events")}
						className="rounded-b-none"
					>
						<Activity className="h-4 w-4 mr-2" />
						Events
					</Button>
					{bot?.chatEnabled && (
						<Button
							variant={activeTab === "chat" ? "default" : "ghost"}
							size="sm"
							onClick={() => setActiveTab("chat")}
							className="rounded-b-none"
						>
							<MessageSquare className="h-4 w-4 mr-2" />
							Chat History
						</Button>
					)}
				</div>

				{/* Tab Content */}
				<div className="overflow-y-auto">
					{activeTab === "details" && (
						<div className="space-y-6 p-4">
							{botError ? (
								<ErrorAlert errorMessage={botError.message} />
							) : (
								<div className="grid grid-cols-2 gap-4">
									<div className="space-y-2">
										<h3 className="font-semibold">Meeting Details</h3>

										<div className="space-y-1 text-sm">
											{botLoading ? (
												<Skeleton className="h-4 w-64" />
											) : (
												<p>
													<span className="font-medium">Title:</span>{" "}
													{bot?.meetingTitle}
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-32" />
											) : (
												<p className="flex items-center gap-2">
													<span className="font-medium">Platform:</span>
													{typeof bot?.meetingInfo.platform === "string" && (
														<Image
															src={`/platform-logos/${bot.meetingInfo.platform}.svg`}
															alt={bot.meetingInfo.platform}
															width={16}
															height={16}
														/>
													)}
													{bot?.meetingInfo.platform as string | undefined}
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-64" />
											) : (
												<p>
													<span className="font-medium">Start:</span>{" "}
													{bot?.startTime
														? format(new Date(bot.startTime), "PPp")
														: "None"}
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-32" />
											) : (
												<p>
													<span className="font-medium">End:</span>{" "}
													{bot?.endTime
														? format(new Date(bot.endTime), "PPp")
														: "None"}
												</p>
											)}
										</div>
									</div>

									<div className="space-y-2">
										<h3 className="font-semibold">Bot Status</h3>
										<div className="space-y-1 text-sm">
											{botLoading ? (
												<Skeleton className="h-4 w-64" />
											) : (
												<p>
													<span className="font-medium">Status:</span>{" "}
													<Badge
														variant="outline"
														className="bg-gray-100 text-gray-800"
													>
														{bot?.status}
													</Badge>
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-32" />
											) : (
												<p>
													<span className="font-medium">Recording:</span>{" "}
													{bot?.recording ? (
														<Link href={bot.recording} target="_blank">
															{bot.recording}{" "}
															<ExternalLinkIcon className="h-4 w-4" />
														</Link>
													) : (
														"Not available"
													)}
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-32" />
											) : (
												<p>
													<span className="font-medium">Chat Enabled:</span>{" "}
													<Badge
														variant={bot?.chatEnabled ? "default" : "secondary"}
													>
														{bot?.chatEnabled ? "Yes" : "No"}
													</Badge>
												</p>
											)}
											{botLoading ? (
												<Skeleton className="h-4 w-64" />
											) : (
												<p>
													<span className="font-medium">Last Heartbeat:</span>{" "}
													{bot?.lastHeartbeat
														? format(new Date(bot.lastHeartbeat), "PPp")
														: "None"}
												</p>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{activeTab === "events" && (
						<div className="space-y-4 p-4">
							<h3 className="font-semibold">Event Log</h3>
							<DataTable
								columns={eventColumns}
								data={events}
								isLoading={botLoading || eventsLoading}
								errorMessage={eventsError?.message}
							/>
						</div>
					)}

					{activeTab === "chat" && botId && bot?.chatEnabled && (
						<div className="p-4">
							<ChatHistoryPanel botId={botId} />
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
