"use client";

import type { ColumnDef, RowData } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpDown, Eye, MoreHorizontal, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Table Meta Type ─────────────────────────────────────────────────────────

export interface InfrastructureTableMeta {
	onView: (botId: number) => void;
	onStop?: (platformId: string) => void;
}

declare module "@tanstack/react-table" {
	// biome-ignore lint/correctness/noUnusedVariables: Required by TanStack Table module augmentation - TData must match original interface
	interface TableMeta<TData extends RowData> extends InfrastructureTableMeta {}
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Platform = "k8s" | "aws" | "coolify";

/**
 * Common infrastructure item type for table display
 * Normalized from K8s jobs, Coolify slots, and AWS tasks
 */
export type InfrastructureItem = {
	id: number;
	botId: number | null;
	name: string | null;
	status: string;
	platformId: string;
	createdAt: Date;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bgColor: string }> = {
	// K8s statuses
	PENDING: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
	ACTIVE: { color: "text-green-500", bgColor: "bg-green-500/10" },
	SUCCEEDED: { color: "text-muted-foreground", bgColor: "bg-muted" },
	FAILED: { color: "text-destructive", bgColor: "bg-destructive/10" },
	// Coolify statuses
	IDLE: { color: "text-muted-foreground", bgColor: "bg-muted" },
	DEPLOYING: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
	HEALTHY: { color: "text-green-500", bgColor: "bg-green-500/10" },
	ERROR: { color: "text-destructive", bgColor: "bg-destructive/10" },
	// AWS statuses
	PROVISIONING: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
	RUNNING: { color: "text-green-500", bgColor: "bg-green-500/10" },
	STOPPED: { color: "text-muted-foreground", bgColor: "bg-muted" },
};

function StatusBadge({ status }: { status: string }) {
	const config = STATUS_CONFIG[status] ?? {
		color: "text-muted-foreground",
		bgColor: "bg-muted",
	};

	return (
		<span
			className={`font-mono text-[10px] px-1.5 py-0.5 uppercase tracking-wider ${config.bgColor} ${config.color}`}
		>
			{status}
		</span>
	);
}

// ─── Platform ID Labels ───────────────────────────────────────────────────────

const PLATFORM_ID_LABELS: Record<Platform, string> = {
	k8s: "Job Name",
	aws: "Task ARN",
	coolify: "Slot ID",
};

// ─── Column Definitions ───────────────────────────────────────────────────────

export function getInfrastructureColumns(
	platform: Platform,
	onSort: (field: string) => void,
	currentSort: { field: string; direction: "asc" | "desc" },
	options?: { enableRowSelection?: boolean },
): ColumnDef<InfrastructureItem>[] {
	const columns: ColumnDef<InfrastructureItem>[] = [];

	// Add row selection column if enabled
	if (options?.enableRowSelection) {
		columns.push({
			id: "select",
			header: ({ table }) => (
				<Checkbox
					checked={
						table.getIsAllPageRowsSelected() ||
						(table.getIsSomePageRowsSelected() && "indeterminate")
					}
					onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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
		});
	}

	// Bot ID column
	columns.push({
		accessorKey: "botId",
		header: () => {
			const isActive = currentSort.field === "botId";

			return (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-3 h-8"
					onClick={() => onSort("botId")}
				>
					Bot ID
					<ArrowUpDown
						className={`ml-2 h-4 w-4 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
					/>
				</Button>
			);
		},
		cell: ({ row }) => {
			const botId = row.original.botId;

			return (
				<span className="font-mono text-sm">{botId ? `#${botId}` : "—"}</span>
			);
		},
	});

	// Status column
	columns.push({
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
	});

	// Name column
	columns.push({
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => (
			<span className="text-sm truncate max-w-[200px] block">
				{row.original.name ?? "—"}
			</span>
		),
	});

	// Platform ID column
	columns.push({
		accessorKey: "platformId",
		header: PLATFORM_ID_LABELS[platform],
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground truncate max-w-[200px] block">
				{row.original.platformId}
			</span>
		),
	});

	// Age column
	columns.push({
		accessorKey: "createdAt",
		header: () => {
			const isActive = currentSort.field === "age";

			return (
				<Button
					variant="ghost"
					size="sm"
					className="-ml-3 h-8"
					onClick={() => onSort("age")}
				>
					Age
					<ArrowUpDown
						className={`ml-2 h-4 w-4 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
					/>
				</Button>
			);
		},
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
				{formatDistanceToNow(new Date(row.original.createdAt), {
					addSuffix: true,
				})}
			</span>
		),
	});

	// Actions column
	columns.push({
		id: "actions",
		header: "",
		cell: ({ row, table }) => {
			const { botId, platformId, status } = row.original;
			const canStop = status === "ACTIVE" || status === "PENDING";

			return (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 hover:bg-muted/80 hover:text-foreground data-[state=open]:bg-muted"
						>
							<MoreHorizontal className="h-4 w-4" />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						{botId ? (
							<>
								<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
									Bot #{botId}
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={() => table.options.meta?.onView(botId)}
								>
									<Eye className="h-4 w-4" />
									View details
								</DropdownMenuItem>
							</>
						) : null}
						{canStop && table.options.meta?.onStop ? (
							<>
								{botId ? <DropdownMenuSeparator /> : null}
								<DropdownMenuItem
									onClick={() => table.options.meta?.onStop?.(platformId)}
									className="text-destructive focus:text-destructive"
								>
									<Square className="h-4 w-4" />
									Stop job
								</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			);
		},
	});

	return columns;
}
