"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	Circle,
	ExternalLink,
	MessageSquare,
	PhoneOff,
	Plus,
	XCircle,
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
import { api } from "@/trpc/react";
import { BotDetailsDialog } from "./_components/bot-details-dialog";
import { CancelDeploymentDialog } from "./_components/cancel-deployment-dialog";
import { MultiBotChatDialog } from "./_components/multi-bot-chat-dialog";
import { MultiBotJoinDialog } from "./_components/multi-bot-join-dialog";
import { RemoveFromCallDialog } from "./_components/remove-from-call-dialog";

const STATUS_CONFIG: Record<
	string,
	{ color: string; bgColor: string; dotColor: string }
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
	},
	JOINING_CALL: {
		color: "text-amber-600 dark:text-amber-400",
		bgColor: "bg-amber-50 dark:bg-amber-950",
		dotColor: "text-amber-500",
	},
	IN_CALL: {
		color: "text-green-600 dark:text-green-400",
		bgColor: "bg-green-50 dark:bg-green-950",
		dotColor: "text-green-500",
	},
	RECORDING: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950",
		dotColor: "text-red-500",
	},
	LEAVING: {
		color: "text-orange-600 dark:text-orange-400",
		bgColor: "bg-orange-50 dark:bg-orange-950",
		dotColor: "text-orange-500",
	},
	CALL_ENDED: {
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

const ACTIVE_CALL_STATUSES = ["IN_WAITING_ROOM", "IN_CALL", "RECORDING"];

export default function BotsPage() {
	const [selectedBot, setSelectedBot] = useState<number | null>(null);
	const [multiBotDialogOpen, setMultiBotDialogOpen] = useState(false);
	const [multiBotChatDialogOpen, setMultiBotChatDialogOpen] = useState(false);

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
						className={`${config.bgColor} ${config.color} border-transparent`}
					>
						<Circle
							className={`h-2 w-2 fill-current ${config.dotColor} mr-1.5`}
						/>
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
					return <span className="text-muted-foreground">—</span>;
				}

				return (
					<Link
						href={recording}
						target="_blank"
						className="flex items-center gap-1 text-accent hover:underline"
					>
						View
						<ExternalLink className="h-3 w-3" />
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
			cell: ({ row }) => {
				const isInActiveCall = ACTIVE_CALL_STATUSES.includes(
					row.original.status,
				);

				const isDeploying = row.original.status === "DEPLOYING";

				return (
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setSelectedBot(row.original.id)}
						>
							Details
						</Button>
						{isInActiveCall ? (
							<Button
								variant="destructive"
								size="sm"
								onClick={() =>
									setBotToRemove({
										id: row.original.id,
										name: row.original.botDisplayName,
									})
								}
							>
								<PhoneOff className="h-4 w-4" />
								Remove from Call
							</Button>
						) : null}
						{isDeploying ? (
							<Button
								variant="secondary"
								size="sm"
								onClick={() =>
									setBotToCancel({
										id: row.original.id,
										name: row.original.botDisplayName,
									})
								}
							>
								<XCircle className="h-4 w-4" />
								Cancel
							</Button>
						) : null}
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
						onClick={() => setMultiBotChatDialogOpen(true)}
						disabled={!session?.user}
					>
						<MessageSquare className="h-4 w-4" />
						Multi-Bot Chat
					</Button>
					<Button
						onClick={() => setMultiBotDialogOpen(true)}
						disabled={!session?.user}
					>
						<Plus className="h-4 w-4" />
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

			<MultiBotChatDialog
				open={multiBotChatDialogOpen}
				onClose={() => setMultiBotChatDialogOpen(false)}
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
