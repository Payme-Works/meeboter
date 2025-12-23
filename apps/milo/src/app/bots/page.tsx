"use client";

import { keepPreviousData } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	Ban,
	Circle,
	ExternalLink,
	MessageSquare,
	PhoneOff,
	RefreshCw,
	Rocket,
	Video,
	X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPlatformName } from "@/utils/platform";
import { parseAsInteger, useQueryState } from "nuqs";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	DataTable,
	type RowSelectionState,
} from "@/components/custom/data-table";
import { LiveIndicator } from "@/components/live-indicator";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { BotActionsDropdown } from "./_components/bot-actions-dropdown";
import { BotDialog } from "./_components/bot-dialog";
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

/** Refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL = 5000;

export default function BotsPage() {
	const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

	const [pageSize, setPageSize] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);

	const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);
	const [selectedBot, setSelectedBot] = useState<number | null>(null);
	const [multiBotDialogOpen, setMultiBotDialogOpen] = useState(false);
	const [broadcastCenterOpen, setBroadcastCenterOpen] = useState(false);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const [cancelDeploymentsDialogOpen, setCancelDeploymentsDialogOpen] =
		useState(false);

	const [removeFromCallDialogOpen, setRemoveFromCallDialogOpen] =
		useState(false);

	// Track selected bot metadata across pages (id -> status mapping)
	const [selectedBotMetadata, setSelectedBotMetadata] = useState<
		Map<number, { status: string }>
	>(new Map());

	const [botToRemove, setBotToRemove] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const [botToCancel, setBotToCancel] = useState<{
		id: number;
		name: string;
	} | null>(null);

	const { data: session } = useSession();
	const utils = api.useUtils();

	const {
		data: botsResponse,
		isLoading,
		error,
		refetch,
	} = api.bots.getBots.useQuery(
		{ page, pageSize },
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	const bots = botsResponse?.data ?? [];

	const cancelDeploymentsMutation = api.bots.cancelDeployments.useMutation({
		onSuccess: (data) => {
			if (data.cancelled > 0) {
				toast.success(`Successfully cancelled ${data.cancelled} deployment(s)`);
			}

			if (data.failed > 0) {
				toast.error(`Failed to cancel ${data.failed} deployment(s)`);
			}

			setRowSelection({});
			setSelectedBotMetadata(new Map());
			utils.bots.getBots.invalidate();
		},
		onError: (error) => {
			toast.error(`Failed to cancel deployments: ${error.message}`);
		},
	});

	const removeFromCallMutation = api.bots.removeBotsFromCall.useMutation({
		onSuccess: (data) => {
			if (data.removed > 0) {
				toast.success(`Successfully removed ${data.removed} bot(s) from call`);
			}

			if (data.failed > 0) {
				toast.error(`Failed to remove ${data.failed} bot(s) from call`);
			}

			setRowSelection({});
			setSelectedBotMetadata(new Map());
			utils.bots.getBots.invalidate();
		},
		onError: (error) => {
			toast.error(`Failed to remove bots from call: ${error.message}`);
		},
	});

	// Update last updated timestamp when data changes
	useEffect(() => {
		if (bots.length > 0 || !isLoading) {
			setLastUpdated(new Date());
		}
	}, [bots, isLoading]);

	const handleManualRefresh = async () => {
		setIsManualRefreshing(true);

		try {
			await refetch();
			setLastUpdated(new Date());
		} finally {
			setIsManualRefreshing(false);
		}
	};

	type Bot = (typeof bots)[number];

	// Clear both selection state and metadata
	const clearSelection = () => {
		setRowSelection({});
		setSelectedBotMetadata(new Map());
	};

	// Handle row selection changes and sync metadata
	const handleRowSelectionChange = (newSelection: RowSelectionState) => {
		setRowSelection(newSelection);

		// Update metadata for newly selected bots from current page
		setSelectedBotMetadata((prevMetadata) => {
			const newMetadata = new Map(prevMetadata);

			// Add metadata for newly selected bots
			for (const id of Object.keys(newSelection)) {
				if (newSelection[id]) {
					const numericId = Number.parseInt(id, 10);
					const bot = bots.find((b) => b.id === numericId);

					if (bot && !newMetadata.has(numericId)) {
						newMetadata.set(numericId, { status: bot.status });
					}
				}
			}

			// Remove metadata for deselected bots
			for (const id of Array.from(newMetadata.keys())) {
				if (!newSelection[id.toString()]) {
					newMetadata.delete(id);
				}
			}

			return newMetadata;
		});
	};

	// Get selected bot IDs from row selection
	const selectedBotIds = Object.keys(rowSelection)
		.filter((key) => rowSelection[key])
		.map((id) => Number.parseInt(id, 10));

	// Determine which bots can be cancelled (deploying) vs removed from call
	// Use persisted metadata to count across all pages
	const deployingStatuses = ["DEPLOYING", "JOINING_CALL"];

	const inCallStatuses = ["IN_WAITING_ROOM", "IN_CALL"];

	const deployingBotIds = selectedBotIds.filter((id) => {
		const metadata = selectedBotMetadata.get(id);

		return metadata && deployingStatuses.includes(metadata.status);
	});

	const inCallBotIds = selectedBotIds.filter((id) => {
		const metadata = selectedBotMetadata.get(id);

		return metadata && inCallStatuses.includes(metadata.status);
	});

	const handleCancelDeployments = () => {
		if (deployingBotIds.length === 0) return;

		cancelDeploymentsMutation.mutate({ ids: deployingBotIds });
		setCancelDeploymentsDialogOpen(false);
	};

	const handleRemoveFromCall = () => {
		if (inCallBotIds.length === 0) return;

		removeFromCallMutation.mutate({ ids: inCallBotIds });
		setRemoveFromCallDialogOpen(false);
	};

	const columns: ColumnDef<Bot>[] = useMemo(
		() => [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						checked={
							table.getIsAllPageRowsSelected() ||
							(table.getIsSomePageRowsSelected() && "indeterminate")
						}
						onCheckedChange={(value) =>
							table.toggleAllPageRowsSelected(!!value)
						}
						aria-label="Select all"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
					/>
				),
				enableSorting: false,
				enableHiding: false,
			},
			{
				accessorKey: "displayName",
				header: "Bot Name",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.displayName}</span>
				),
			},
			{
				accessorKey: "meeting.platform",
				header: "Platform",
				cell: ({ row }) => {
					const platform = row.original.meeting.platform;

					return (
						<div className="flex items-center gap-2">
							{typeof platform === "string" ? (
								<Image
									src={`/platform-logos/${platform}.svg`}
									alt={`${platform} logo`}
									width={20}
									height={20}
								/>
							) : null}
							<span className="text-muted-foreground">
								{formatPlatformName(platform)}
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
									className={cn(
										"relative h-2 w-2 fill-current",
										config.dotColor,
									)}
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
							<ExternalLink className="size-3! opacity-50" />
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
								botName={row.original.displayName}
								status={row.original.status}
								recording={row.original.recording}
								onView={() => setSelectedBot(row.original.id)}
								onRemoveFromCall={() =>
									setBotToRemove({
										id: row.original.id,
										name: row.original.displayName,
									})
								}
								onCancelDeployment={() =>
									setBotToCancel({
										id: row.original.id,
										name: row.original.displayName,
									})
								}
							/>
						</div>
					);
				},
			},
		],
		[],
	);

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
					<LiveIndicator lastUpdated={lastUpdated} />

					<Button
						variant="outline"
						size="sm"
						onClick={handleManualRefresh}
						disabled={isManualRefreshing}
					>
						<RefreshCw
							className={`size-3! ${isManualRefreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>

					<Button
						variant="outline"
						size="sm"
						onClick={() => setBroadcastCenterOpen(true)}
						disabled={!session?.user}
					>
						<MessageSquare className="size-3!" />
						Broadcast
					</Button>

					<Button
						size="sm"
						onClick={() => setMultiBotDialogOpen(true)}
						disabled={!session?.user}
					>
						<Rocket className="size-3!" />
						Deploy Bots
					</Button>
				</PageHeaderActions>
			</PageHeader>

			{/* Bulk Action Toolbar */}
			{selectedBotIds.length > 0 ? (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/50 px-3 py-3 sm:px-4">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">
							{selectedBotIds.length} bot(s) selected
						</span>
						<Button variant="ghost" size="sm" onClick={clearSelection}>
							<X className="size-3!" />
							Clear
						</Button>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{deployingBotIds.length > 0 ? (
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setCancelDeploymentsDialogOpen(true)}
								disabled={cancelDeploymentsMutation.isPending}
							>
								<Ban className="size-3!" />
								<span className="hidden sm:inline">Cancel Deployments</span>
								<span className="sm:hidden">Cancel</span>
								<span>({deployingBotIds.length})</span>
							</Button>
						) : null}
						{inCallBotIds.length > 0 ? (
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setRemoveFromCallDialogOpen(true)}
								disabled={removeFromCallMutation.isPending}
							>
								<PhoneOff className="size-3!" />
								<span className="hidden sm:inline">Remove from Call</span>
								<span className="sm:hidden">Remove</span>
								<span>({inCallBotIds.length})</span>
							</Button>
						) : null}
					</div>
				</div>
			) : null}

			<DataTable
				columns={columns}
				data={bots}
				isLoading={isLoading}
				errorMessage={error?.message}
				enableRowSelection
				rowSelection={rowSelection}
				onRowSelectionChange={handleRowSelectionChange}
				getRowId={(row) => row.id.toString()}
				pageIndex={page - 1}
				pageSize={pageSize}
				onPageIndexChange={(idx) => setPage(idx + 1)}
				onPageSizeChange={setPageSize}
				totalCount={botsResponse?.total}
				pageCount={botsResponse?.pageCount}
				hasNextPage={botsResponse?.hasNextPage}
				hasPreviousPage={botsResponse?.hasPreviousPage}
				onRowClick={(row) => setSelectedBot(row.id)}
			/>

			<BotDialog botId={selectedBot} onClose={() => setSelectedBot(null)} />

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

			{/* Bulk Cancel Deployments Dialog */}
			<Dialog
				open={cancelDeploymentsDialogOpen}
				onOpenChange={setCancelDeploymentsDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Cancel {deployingBotIds.length} deployment(s)?
						</DialogTitle>
						<DialogDescription>
							This will cancel the selected bot deployments. Bots that haven't
							joined a call yet will be stopped.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCancelDeploymentsDialogOpen(false)}
						>
							Go Back
						</Button>
						<Button
							variant="destructive"
							onClick={handleCancelDeployments}
							disabled={cancelDeploymentsMutation.isPending}
						>
							{cancelDeploymentsMutation.isPending
								? "Cancelling..."
								: "Cancel Deployments"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Bulk Remove from Call Dialog */}
			<Dialog
				open={removeFromCallDialogOpen}
				onOpenChange={setRemoveFromCallDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Remove {inCallBotIds.length} bot(s) from call?
						</DialogTitle>
						<DialogDescription>
							This will gracefully remove the selected bots from their active
							calls.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRemoveFromCallDialogOpen(false)}
						>
							Go Back
						</Button>
						<Button
							variant="destructive"
							onClick={handleRemoveFromCall}
							disabled={removeFromCallMutation.isPending}
						>
							{removeFromCallMutation.isPending
								? "Removing..."
								: "Remove from Call"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
