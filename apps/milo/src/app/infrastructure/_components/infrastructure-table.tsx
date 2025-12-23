"use client";

import { keepPreviousData } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { Container, Filter, Loader2, Square } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { BotDialog } from "@/app/bots/_components/bot-dialog";
import { DataTable } from "@/components/custom/data-table";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/trpc/react";

import {
	getInfrastructureColumns,
	type InfrastructureItem,
	type InfrastructureTableMeta,
	type Platform,
} from "./infrastructure-columns";

// ─── Constants ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 5000;

const PLATFORM_STATUSES: Record<Platform, string[]> = {
	k8s: ["PENDING", "ACTIVE", "SUCCEEDED", "FAILED"],
	coolify: ["IDLE", "DEPLOYING", "HEALTHY", "ERROR"],
	aws: ["PROVISIONING", "RUNNING", "STOPPED", "FAILED"],
};

// ─── Status Filter Component ──────────────────────────────────────────────────

function StatusFilter({
	platform,
	selectedStatuses,
	onStatusChange,
}: {
	platform: Platform;
	selectedStatuses: string[];
	onStatusChange: (statuses: string[]) => void;
}) {
	const statuses = PLATFORM_STATUSES[platform];
	const hasSelection = selectedStatuses.length > 0;

	const toggleStatus = (status: string) => {
		if (selectedStatuses.includes(status)) {
			onStatusChange(selectedStatuses.filter((s) => s !== status));
		} else {
			onStatusChange([...selectedStatuses, status]);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="h-8 gap-2">
					<Filter className="h-4 w-4" />
					Status
					{hasSelection ? (
						<span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
							{selectedStatuses.length}
						</span>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{statuses.map((status) => (
					<DropdownMenuCheckboxItem
						key={status}
						checked={selectedStatuses.includes(status)}
						onCheckedChange={() => toggleStatus(status)}
					>
						{status}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ─── Empty State Component ────────────────────────────────────────────────────

function EmptyState({ platform }: { platform: Platform }) {
	const labels: Record<Platform, { title: string; description: string }> = {
		k8s: {
			title: "No Kubernetes jobs",
			description: "Jobs will appear here when bots are deployed",
		},
		coolify: {
			title: "No pool slots",
			description: "Slots will appear here when the pool is configured",
		},
		aws: {
			title: "No ECS tasks",
			description: "Tasks will appear here when bots are deployed",
		},
	};

	const { title, description } = labels[platform];

	return (
		<div className="bg-card border border-border p-8 text-center">
			<Container className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
			<p className="text-muted-foreground font-mono text-sm">{title}</p>
			<p className="text-muted-foreground/70 text-xs mt-1">{description}</p>
		</div>
	);
}

// ─── K8s Table ────────────────────────────────────────────────────────────────

function K8sTable() {
	const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

	const [queryState, setQueryState] = useQueryStates({
		status: parseAsArrayOf(parseAsString).withDefault([]),
		sort: parseAsString.withDefault("age.desc"),
	});

	const utils = api.useUtils();

	const deleteJobMutation = api.infrastructure.k8s.deleteJob.useMutation({
		onSuccess: () => {
			toast.success("Job stopped successfully");
			void utils.infrastructure.k8s.getJobs.invalidate();
			void utils.infrastructure.k8s.getStats.invalidate();
		},
		onError: (error) => {
			toast.error(`Failed to stop job: ${error.message}`);
		},
	});

	const deleteJobsMutation = api.infrastructure.k8s.deleteJobs.useMutation({
		onSuccess: (result) => {
			if (result.failed > 0) {
				toast.warning(
					`Stopped ${result.succeeded} jobs, ${result.failed} failed`,
				);
			} else {
				toast.success(`Stopped ${result.succeeded} jobs`);
			}

			setRowSelection({});
			void utils.infrastructure.k8s.getJobs.invalidate();
			void utils.infrastructure.k8s.getStats.invalidate();
		},
		onError: (error) => {
			toast.error(`Failed to stop jobs: ${error.message}`);
		},
	});

	const { data, isLoading, error } = api.infrastructure.k8s.getJobs.useQuery(
		{
			status:
				queryState.status.length > 0
					? (queryState.status as Array<
							"PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED"
						>)
					: undefined,
			sort: queryState.sort,
		},
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	const currentSort = useMemo(() => {
		const [field, direction] = queryState.sort.split(".");

		return {
			field: field ?? "age",
			direction: (direction ?? "desc") as "asc" | "desc",
		};
	}, [queryState.sort]);

	const handleSort = useCallback(
		(field: string) => {
			const newDirection =
				currentSort.field === field && currentSort.direction === "desc"
					? "asc"
					: "desc";

			void setQueryState({ sort: `${field}.${newDirection}` });
		},
		[currentSort, setQueryState],
	);

	const handleStatusChange = useCallback(
		(statuses: string[]) => {
			void setQueryState({ status: statuses });
		},
		[setQueryState],
	);

	const handleStop = useCallback(
		(jobName: string) => {
			deleteJobMutation.mutate({ jobName });
		},
		[deleteJobMutation],
	);

	const columns = useMemo(
		() =>
			getInfrastructureColumns("k8s", handleSort, currentSort, {
				enableRowSelection: true,
			}),
		[currentSort, handleSort],
	);

	const items: InfrastructureItem[] = useMemo(
		() =>
			(data ?? []).map((job) => ({
				id: job.id,
				botId: job.botId,
				name: job.botName,
				status: job.status,
				platformId: job.jobName,
				createdAt: job.createdAt,
			})),
		[data],
	);

	const tableMeta: InfrastructureTableMeta = useMemo(
		() => ({
			onView: (botId: number) => setSelectedBotId(botId),
			onStop: handleStop,
		}),
		[handleStop],
	);

	// Build a map of item ID to item for quick lookup
	const itemsById = useMemo(() => {
		return new Map(items.map((item) => [String(item.id), item]));
	}, [items]);

	// Get selected items
	const selectedItems = useMemo(() => {
		return Object.keys(rowSelection)
			.filter((key) => rowSelection[key])
			.map((id) => itemsById.get(id))
			.filter((item): item is InfrastructureItem => !!item);
	}, [rowSelection, itemsById]);

	// Filter to only stoppable jobs (ACTIVE or PENDING)
	const stoppableSelectedJobs = useMemo(() => {
		return selectedItems
			.filter((item) => item.status === "ACTIVE" || item.status === "PENDING")
			.map((item) => item.platformId);
	}, [selectedItems]);

	const handleBulkStop = useCallback(() => {
		if (stoppableSelectedJobs.length === 0) return;

		deleteJobsMutation.mutate({ jobNames: stoppableSelectedJobs });
	}, [stoppableSelectedJobs, deleteJobsMutation]);

	if (!isLoading && items.length === 0 && queryState.status.length === 0) {
		return <EmptyState platform="k8s" />;
	}

	const isDeleting =
		deleteJobMutation.isPending || deleteJobsMutation.isPending;

	return (
		<>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold">Active Jobs</h2>
						{items.length > 0 ? (
							<span className="font-mono text-xs px-2 py-0.5 bg-green-500/10 text-green-500 tabular-nums">
								{items.length} total
							</span>
						) : null}
					</div>
					<div className="flex items-center gap-2">
						{selectedItems.length > 0 ? (
							<Button
								variant="destructive"
								size="sm"
								className="h-8 gap-2"
								onClick={handleBulkStop}
								disabled={isDeleting || stoppableSelectedJobs.length === 0}
							>
								{isDeleting ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Square className="h-4 w-4" />
								)}
								Stop {stoppableSelectedJobs.length} job
								{stoppableSelectedJobs.length !== 1 ? "s" : ""}
							</Button>
						) : null}
						<StatusFilter
							platform="k8s"
							selectedStatuses={queryState.status}
							onStatusChange={handleStatusChange}
						/>
					</div>
				</div>
				<DataTable
					columns={columns}
					data={items}
					isLoading={isLoading}
					errorMessage={error?.message}
					meta={tableMeta}
					enableRowSelection
					rowSelection={rowSelection}
					onRowSelectionChange={setRowSelection}
					getRowId={(row) => String(row.id)}
				/>
			</div>

			<BotDialog botId={selectedBotId} onClose={() => setSelectedBotId(null)} />
		</>
	);
}

// ─── Coolify Table ────────────────────────────────────────────────────────────

function CoolifyTable() {
	const [selectedBotId, setSelectedBotId] = useState<number | null>(null);

	const [queryState, setQueryState] = useQueryStates({
		status: parseAsArrayOf(parseAsString).withDefault([]),
		sort: parseAsString.withDefault("age.desc"),
	});

	const { data, isLoading, error } =
		api.infrastructure.coolify.getSlots.useQuery(
			{
				status:
					queryState.status.length > 0
						? (queryState.status as Array<
								"IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR"
							>)
						: undefined,
				sort: queryState.sort,
			},
			{
				refetchInterval: REFRESH_INTERVAL,
				refetchOnWindowFocus: true,
				placeholderData: keepPreviousData,
			},
		);

	const currentSort = useMemo(() => {
		const [field, direction] = queryState.sort.split(".");

		return {
			field: field ?? "age",
			direction: (direction ?? "desc") as "asc" | "desc",
		};
	}, [queryState.sort]);

	const handleSort = useCallback(
		(field: string) => {
			const newDirection =
				currentSort.field === field && currentSort.direction === "desc"
					? "asc"
					: "desc";

			void setQueryState({ sort: `${field}.${newDirection}` });
		},
		[currentSort, setQueryState],
	);

	const handleStatusChange = useCallback(
		(statuses: string[]) => {
			void setQueryState({ status: statuses });
		},
		[setQueryState],
	);

	const columns = useMemo(
		() => getInfrastructureColumns("coolify", handleSort, currentSort),
		[currentSort, handleSort],
	);

	const items: InfrastructureItem[] = useMemo(
		() =>
			(data ?? []).map((slot) => ({
				id: slot.id,
				botId: slot.assignedBotId,
				name: slot.botName,
				status: slot.status,
				platformId: slot.slotName,
				createdAt: slot.createdAt,
			})),
		[data],
	);

	const tableMeta: InfrastructureTableMeta = useMemo(
		() => ({
			onView: (botId: number) => setSelectedBotId(botId),
		}),
		[],
	);

	if (!isLoading && items.length === 0 && queryState.status.length === 0) {
		return <EmptyState platform="coolify" />;
	}

	return (
		<>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold">Pool Slots</h2>
						{items.length > 0 ? (
							<span className="font-mono text-xs px-2 py-0.5 bg-green-500/10 text-green-500 tabular-nums">
								{items.length} total
							</span>
						) : null}
					</div>
					<StatusFilter
						platform="coolify"
						selectedStatuses={queryState.status}
						onStatusChange={handleStatusChange}
					/>
				</div>
				<DataTable
					columns={columns}
					data={items}
					isLoading={isLoading}
					errorMessage={error?.message}
					meta={tableMeta}
				/>
			</div>

			<BotDialog botId={selectedBotId} onClose={() => setSelectedBotId(null)} />
		</>
	);
}

// ─── AWS Table ────────────────────────────────────────────────────────────────

function AWSTable() {
	const [selectedBotId, setSelectedBotId] = useState<number | null>(null);

	const [queryState, setQueryState] = useQueryStates({
		status: parseAsArrayOf(parseAsString).withDefault([]),
		sort: parseAsString.withDefault("age.desc"),
	});

	const { data, isLoading, error } = api.infrastructure.aws.getTasks.useQuery(
		{
			status:
				queryState.status.length > 0
					? (queryState.status as Array<
							"PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED"
						>)
					: undefined,
			sort: queryState.sort,
		},
		{
			refetchInterval: REFRESH_INTERVAL,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		},
	);

	const currentSort = useMemo(() => {
		const [field, direction] = queryState.sort.split(".");

		return {
			field: field ?? "age",
			direction: (direction ?? "desc") as "asc" | "desc",
		};
	}, [queryState.sort]);

	const handleSort = useCallback(
		(field: string) => {
			const newDirection =
				currentSort.field === field && currentSort.direction === "desc"
					? "asc"
					: "desc";

			void setQueryState({ sort: `${field}.${newDirection}` });
		},
		[currentSort, setQueryState],
	);

	const handleStatusChange = useCallback(
		(statuses: string[]) => {
			void setQueryState({ status: statuses });
		},
		[setQueryState],
	);

	const columns = useMemo(
		() => getInfrastructureColumns("aws", handleSort, currentSort),
		[currentSort, handleSort],
	);

	const items: InfrastructureItem[] = useMemo(
		() =>
			(data ?? []).map((task) => ({
				id: task.id,
				botId: task.botId,
				name: task.botName,
				status: task.status,
				platformId: task.taskArn,
				createdAt: task.createdAt,
			})),
		[data],
	);

	const tableMeta: InfrastructureTableMeta = useMemo(
		() => ({
			onView: (botId: number) => setSelectedBotId(botId),
		}),
		[],
	);

	if (!isLoading && items.length === 0 && queryState.status.length === 0) {
		return <EmptyState platform="aws" />;
	}

	return (
		<>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<h2 className="text-lg font-semibold">ECS Tasks</h2>
						{items.length > 0 ? (
							<span className="font-mono text-xs px-2 py-0.5 bg-green-500/10 text-green-500 tabular-nums">
								{items.length} total
							</span>
						) : null}
					</div>
					<StatusFilter
						platform="aws"
						selectedStatuses={queryState.status}
						onStatusChange={handleStatusChange}
					/>
				</div>
				<DataTable
					columns={columns}
					data={items}
					isLoading={isLoading}
					errorMessage={error?.message}
					meta={tableMeta}
				/>
			</div>

			<BotDialog botId={selectedBotId} onClose={() => setSelectedBotId(null)} />
		</>
	);
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function InfrastructureTable({
	platform,
}: {
	platform: Platform | undefined;
}) {
	switch (platform) {
		case "k8s":
			return <K8sTable />;
		case "coolify":
			return <CoolifyTable />;
		case "aws":
			return <AWSTable />;
		default:
			return null;
	}
}
