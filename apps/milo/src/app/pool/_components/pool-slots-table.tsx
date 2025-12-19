"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, MoreHorizontal, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	DataTable,
	type RowSelectionState,
} from "@/components/custom/data-table";
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
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";

type PoolSlotStatus = "idle" | "deploying" | "busy" | "error";

interface PoolSlot {
	id: number;
	slotName: string;
	status: PoolSlotStatus;
	assignedBotId: number | null;
	coolifyServiceUuid: string;
	lastUsedAt: Date | null;
	errorMessage: string | null;
	recoveryAttempts: number;
	createdAt: Date;
}

interface PoolSlotsTableProps {
	slots: PoolSlot[] | undefined;
	isLoading: boolean;
	statusFilter: PoolSlotStatus[];
	onStatusFilterChange: (statuses: PoolSlotStatus[]) => void;

	/** Current page index (0-indexed) */
	pageIndex: number;

	/** Page size */
	pageSize: number;

	/** Callback when page index changes */
	onPageIndexChange: (pageIndex: number) => void;

	/** Callback when page size changes */
	onPageSizeChange: (pageSize: number) => void;

	/** Total count for server-side pagination */
	totalCount?: number;

	/** Page count for server-side pagination */
	pageCount?: number;

	/** Has next page */
	hasNextPage?: boolean;

	/** Has previous page */
	hasPreviousPage?: boolean;
}

const STATUS_CONFIG: Record<
	PoolSlotStatus,
	{ badge: string; color: string; bgColor: string }
> = {
	idle: {
		badge: "[IDLE]",
		color: "text-emerald-500",
		bgColor: "bg-emerald-500/10",
	},
	deploying: {
		badge: "[DEPLOYING]",
		color: "text-accent",
		bgColor: "bg-accent/10",
	},
	busy: {
		badge: "[BUSY]",
		color: "text-amber-500",
		bgColor: "bg-amber-500/10",
	},
	error: {
		badge: "[ERROR]",
		color: "text-destructive",
		bgColor: "bg-destructive/10",
	},
};

const ALL_STATUSES: PoolSlotStatus[] = ["idle", "deploying", "busy", "error"];

function StatusBadge({ status }: { status: PoolSlotStatus }) {
	const config = STATUS_CONFIG[status];

	return (
		<span
			className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-wider ${config.bgColor} ${config.color}`}
		>
			{config.badge}
		</span>
	);
}

function truncateUuid(uuid: string): string {
	if (uuid.length <= 12) return uuid;

	return `${uuid.slice(0, 8)}...`;
}

export function PoolSlotsTable({
	slots,
	isLoading,
	statusFilter,
	onStatusFilterChange,
	pageIndex,
	pageSize,
	onPageIndexChange,
	onPageSizeChange,
	totalCount,
	pageCount,
	hasNextPage,
	hasPreviousPage,
}: PoolSlotsTableProps) {
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [slotsToDelete, setSlotsToDelete] = useState<PoolSlot[]>([]);

	const utils = api.useUtils();

	const deleteMutation = api.pool.slots.delete.useMutation({
		onSuccess: (result) => {
			if (result.deletedIds.length > 0) {
				toast.success(
					`Deleted ${result.deletedIds.length} slot${result.deletedIds.length > 1 ? "s" : ""}`,
				);
			}

			if (result.failedIds.length > 0) {
				toast.error(
					`Failed to delete ${result.failedIds.length} slot${result.failedIds.length > 1 ? "s" : ""}`,
					{
						description: result.failedIds
							.map((f) => `Slot ${f.id}: ${f.error}`)
							.join(", "),
					},
				);
			}

			setRowSelection({});
			setSlotsToDelete([]);
			setDeleteDialogOpen(false);

			utils.pool.slots.list.invalidate();
			utils.pool.statistics.getPool.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to delete slots", {
				description: error.message,
			});
		},
	});

	const handleDeleteClick = useCallback((slot: PoolSlot) => {
		setSlotsToDelete([slot]);
		setDeleteDialogOpen(true);
	}, []);

	const handleBulkDeleteClick = () => {
		if (!slots) return;

		const selectedIds = Object.keys(rowSelection);

		const selectedSlots = slots.filter((slot) =>
			selectedIds.includes(String(slot.id)),
		);

		setSlotsToDelete(selectedSlots);
		setDeleteDialogOpen(true);
	};

	const handleConfirmDelete = () => {
		if (slotsToDelete.length === 0) return;

		deleteMutation.mutate({ ids: slotsToDelete.map((s) => s.id) });
	};

	const columns: ColumnDef<PoolSlot>[] = useMemo(
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
				accessorKey: "slotName",
				header: "Slot Name",
				cell: ({ row }) => (
					<span className="font-mono text-sm">{row.original.slotName}</span>
				),
			},
			{
				accessorKey: "status",
				header: "Status",
				cell: ({ row }) => <StatusBadge status={row.original.status} />,
			},
			{
				accessorKey: "assignedBotId",
				header: "Bot",
				cell: ({ row }) => {
					const botId = row.original.assignedBotId;

					if (!botId) {
						return <span className="text-muted-foreground">—</span>;
					}

					return <span className="font-mono text-sm">#{botId}</span>;
				},
			},
			{
				accessorKey: "lastUsedAt",
				header: "Last Used",
				cell: ({ row }) => {
					const lastUsed = row.original.lastUsedAt;

					if (!lastUsed) {
						return <span className="text-muted-foreground">Never</span>;
					}

					return (
						<span className="text-muted-foreground text-sm tabular-nums">
							{formatDistanceToNow(new Date(lastUsed), { addSuffix: true })}
						</span>
					);
				},
			},
			{
				accessorKey: "errorMessage",
				header: "Error",
				cell: ({ row }) => {
					const error = row.original.errorMessage;

					if (!error) {
						return <span className="text-muted-foreground">—</span>;
					}

					return (
						<span
							className="text-destructive text-sm max-w-[200px] truncate block"
							title={error}
						>
							{error}
						</span>
					);
				},
			},
			{
				accessorKey: "recoveryAttempts",
				header: "Recovery",
				cell: ({ row }) => (
					<span className="font-mono text-sm tabular-nums text-muted-foreground">
						{row.original.recoveryAttempts}
					</span>
				),
			},
			{
				accessorKey: "coolifyServiceUuid",
				header: "UUID",
				cell: ({ row }) => (
					<span
						className="font-mono text-xs text-muted-foreground"
						title={row.original.coolifyServiceUuid}
					>
						{truncateUuid(row.original.coolifyServiceUuid)}
					</span>
				),
			},
			{
				accessorKey: "createdAt",
				header: "Created",
				cell: ({ row }) => (
					<span className="text-muted-foreground text-sm tabular-nums">
						{formatDistanceToNow(new Date(row.original.createdAt), {
							addSuffix: true,
						})}
					</span>
				),
			},
			{
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="h-8 w-8 p-0">
								<span className="sr-only">Open menu</span>
								<MoreHorizontal className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => handleDeleteClick(row.original)}
								className="text-destructive focus:text-destructive"
							>
								<Trash2 className="mr-2 h-4 w-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				),
			},
		],
		[handleDeleteClick],
	);

	const toggleStatus = (status: PoolSlotStatus) => {
		if (statusFilter.includes(status)) {
			onStatusFilterChange(statusFilter.filter((s) => s !== status));
		} else {
			onStatusFilterChange([...statusFilter, status]);
		}
	};

	const clearFilters = () => {
		onStatusFilterChange([]);
	};

	const hasFilters = statusFilter.length > 0;
	const selectedCount = Object.keys(rowSelection).length;

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4 }}
			className="space-y-4"
		>
			{/* Header with filter */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Pool Slots</h2>

				<div className="flex items-center gap-2">
					{selectedCount > 0 ? (
						<Button
							variant="destructive"
							size="sm"
							onClick={handleBulkDeleteClick}
							className="h-8"
						>
							<Trash2 className="h-3 w-3 mr-1" />
							Delete ({selectedCount})
						</Button>
					) : null}

					{hasFilters ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearFilters}
							className="h-8 px-2 text-xs"
						>
							<X className="h-3 w-3 mr-1" />
							Clear
						</Button>
					) : null}

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm" className="h-8">
								<span className="font-mono text-xs">Status Filter</span>
								{hasFilters ? (
									<Badge
										variant="secondary"
										className="ml-2 h-5 px-1.5 font-mono text-[10px]"
									>
										{statusFilter.length}
									</Badge>
								) : null}
								<ChevronDown className="ml-2 h-3 w-3" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							{ALL_STATUSES.map((status) => {
								const config = STATUS_CONFIG[status];

								return (
									<DropdownMenuCheckboxItem
										key={status}
										checked={statusFilter.includes(status)}
										onCheckedChange={() => toggleStatus(status)}
									>
										<span
											className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-wider ${config.bgColor} ${config.color}`}
										>
											{config.badge}
										</span>
									</DropdownMenuCheckboxItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* Table */}
			<DataTable
				columns={columns}
				data={slots}
				isLoading={isLoading}
				enableRowSelection
				rowSelection={rowSelection}
				onRowSelectionChange={setRowSelection}
				getRowId={(row) => String(row.id)}
				pageIndex={pageIndex}
				pageSize={pageSize}
				onPageIndexChange={onPageIndexChange}
				onPageSizeChange={onPageSizeChange}
				totalCount={totalCount}
				pageCount={pageCount}
				hasNextPage={hasNextPage}
				hasPreviousPage={hasPreviousPage}
			/>

			{/* Delete confirmation dialog */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Delete pool slot{slotsToDelete.length > 1 ? "s" : ""}
						</DialogTitle>
						<DialogDescription>
							{slotsToDelete.length === 1 ? (
								<>
									Are you sure you want to delete slot{" "}
									<span className="font-mono font-medium">
										{slotsToDelete[0]?.slotName}
									</span>
									? This will stop the container and remove it from Coolify.
								</>
							) : (
								<>
									Are you sure you want to delete {slotsToDelete.length} slots?
									This will stop all containers and remove them from Coolify.
								</>
							)}
						</DialogDescription>
					</DialogHeader>

					{slotsToDelete.length > 1 ? (
						<div className="max-h-32 overflow-y-auto border rounded-md p-2">
							<ul className="space-y-1">
								{slotsToDelete.map((slot) => (
									<li key={slot.id} className="flex items-center gap-2 text-sm">
										<span className="font-mono">{slot.slotName}</span>
										<StatusBadge status={slot.status} />
									</li>
								))}
							</ul>
						</div>
					) : null}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
							disabled={deleteMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleConfirmDelete}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</motion.div>
	);
}
