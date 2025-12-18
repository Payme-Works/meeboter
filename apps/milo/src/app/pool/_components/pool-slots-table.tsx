"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, X } from "lucide-react";
import { motion } from "motion/react";
import { DataTable } from "@/components/custom/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}: PoolSlotsTableProps) {
	const columns: ColumnDef<PoolSlot>[] = [
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
	];

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
			<DataTable columns={columns} data={slots} isLoading={isLoading} />
		</motion.div>
	);
}
