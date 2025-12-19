"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	Circle,
	ExternalLink,
	MessageSquare,
	Rocket,
	Video,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { BotActionsDropdown } from "./_components/bot-actions-dropdown";
import { BotDetailsDialog } from "./_components/bot-details-dialog";
import { BroadcastCenterDialog } from "./_components/broadcast-center-dialog";
import { CancelDeploymentDialog } from "./_components/cancel-deployment-dialog";
import { MultiBotJoinDialog } from "./_components/multi-bot-join-dialog";
import { RemoveFromCallDialog } from "./_components/remove-from-call-dialog";

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

export default function BotsPage() {
	const [selectedBot, setSelectedBot] = useState<number | null>(null);
	const [multiBotDialogOpen, setMultiBotDialogOpen] = useState(false);
	const [broadcastCenterOpen, setBroadcastCenterOpen] = useState(false);

	const [botToRemove, setBotToRemove] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const [botToCancel, setBotToCancel] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const { data: session } = useSession();

	const { data: bots = [], isLoading, error } = api.bots.getBots.useQuery();

	type Bot = (typeof bots)[number];

	const columns: ColumnDef<Bot>[] = [
		{
			accessorKey: "botDisplayName",
			header: "Bot Name",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.botDisplayName}</span>
			),
		},
		{
			accessorKey: "meetingInfo.platform",
			header: "Platform",
			cell: ({ row }) => {
				const platform = row.original.meetingInfo.platform;

				return (
					<div className="flex items-center gap-2">
						{typeof platform === "string" && (
							<Image
								src={`/platform-logos/${platform}.svg`}
								alt={`${platform} logo`}
								width={20}
								height={20}
							/>
						)}
						<span className="text-muted-foreground">
							{typeof platform === "string"
								? platform.charAt(0).toUpperCase() + platform.slice(1)
								: "Unknown"}
						</span>
					</div>
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => {
				const status = row.original.status;
				const config = STATUS_CONFIG[status] || STATUS_CONFIG.CREATED;

				return (
					<Badge
						variant="outline"
						className={cn(
							config.bgColor,
							config.color,
							"border-transparent transition-all duration-200",
						)}
					>
						<span className="relative flex h-2 w-2 mr-1.5">
							{config.pulse ? (
								<span
									className={cn(
										"absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
										config.dotColor,
										"bg-current",
									)}
								/>
							) : null}
							<Circle
								className={cn("relative h-2 w-2 fill-current", config.dotColor)}
							/>
						</span>
						{formatStatus(status)}
					</Badge>
				);
			},
		},
		{
			accessorKey: "recording",
			header: "Recording",
			cell: ({ row }) => {
				const recording = row.original.recording;

				if (!recording) {
					return <span className="text-muted-foreground/50">—</span>;
				}

				return (
					<Link
						href={recording}
						target="_blank"
						className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
					>
						<Video className="h-3.5 w-3.5" />
						View
						<ExternalLink className="h-3 w-3 opacity-50" />
					</Link>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => {
				const createdAt = row.original.createdAt;

				return (
					<span className="text-muted-foreground tabular-nums">
						{createdAt
							? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
							: "—"}
					</span>
				);
			},
		},
		{
			id: "actions",
			header: () => <span className="sr-only">Actions</span>,
			cell: ({ row }) => {
				return (
					<div className="flex items-center justify-end">
						<BotActionsDropdown
							botId={row.original.id}
							botName={row.original.botDisplayName}
							status={row.original.status}
							recording={row.original.recording}
							onViewDetails={() => setSelectedBot(row.original.id)}
							onRemoveFromCall={() =>
								setBotToRemove({
									id: row.original.id,
									name: row.original.botDisplayName,
								})
							}
							onCancelDeployment={() =>
								setBotToCancel({
									id: row.original.id,
									name: row.original.botDisplayName,
								})
							}
						/>
					</div>
				);
			},
		},
	];

	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Bots</PageHeaderTitle>
					<PageHeaderDescription>
						View and manage all deployed engagement bots
					</PageHeaderDescription>
				</PageHeaderContent>

				<PageHeaderActions>
					<Button
						variant="outline"
						onClick={() => setBroadcastCenterOpen(true)}
						disabled={!session?.user}
					>
						<MessageSquare className="h-4 w-4" />
						Broadcast
					</Button>
					<Button
						onClick={() => setMultiBotDialogOpen(true)}
						disabled={!session?.user}
					>
						<Rocket className="h-4 w-4" />
						Deploy Bots
					</Button>
				</PageHeaderActions>
			</PageHeader>

			<DataTable
				columns={columns}
				data={bots}
				isLoading={isLoading}
				errorMessage={error?.message}
			/>

			<BotDetailsDialog
				botId={selectedBot}
				onClose={() => setSelectedBot(null)}
			/>

			<MultiBotJoinDialog
				open={multiBotDialogOpen}
				onClose={() => setMultiBotDialogOpen(false)}
			/>

			<BroadcastCenterDialog
				open={broadcastCenterOpen}
				onClose={() => setBroadcastCenterOpen(false)}
				bots={bots}
			/>

			<RemoveFromCallDialog
				botId={botToRemove?.id ?? null}
				botName={botToRemove?.name ?? ""}
				open={!!botToRemove}
				onOpenChange={(open) => {
					if (!open) setBotToRemove(null);
				}}
			/>

			<CancelDeploymentDialog
				botId={botToCancel?.id ?? null}
				botName={botToCancel?.name ?? ""}
				open={!!botToCancel}
				onOpenChange={(open) => {
					if (!open) setBotToCancel(null);
				}}
			/>
		</div>
	);
}
