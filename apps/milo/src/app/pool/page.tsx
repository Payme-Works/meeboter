"use client";

import { RefreshCw, RefreshCwOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LiveIndicator } from "@/components/live-indicator";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { api } from "@/trpc/react";
import { PoolQueueSection } from "./_components/pool-queue-section";
import { PoolSlotsTable } from "./_components/pool-slots-table";
import { PoolStatsCards } from "./_components/pool-stats-cards";

/** Refresh interval in milliseconds (5 seconds) */
const REFRESH_INTERVAL = 5000;

type PoolSlotStatus = "idle" | "deploying" | "busy" | "error";

export default function PoolPage() {
	const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
	const [statusFilter, setStatusFilter] = useState<PoolSlotStatus[]>([]);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);

	// Pool statistics query
	const poolStats = api.pool.statistics.getPool.useQuery(undefined, {
		refetchInterval: REFRESH_INTERVAL,
		refetchOnWindowFocus: true,
	});

	// Queue statistics query
	const queueStats = api.pool.statistics.getQueue.useQuery(undefined, {
		refetchInterval: REFRESH_INTERVAL,
		refetchOnWindowFocus: true,
	});

	// Slots list query with filtering
	const slots = api.pool.slots.list.useQuery(
		statusFilter.length > 0 ? { status: statusFilter } : undefined,
		{ refetchInterval: REFRESH_INTERVAL, refetchOnWindowFocus: true },
	);

	// Queue entries query
	const queueEntries = api.pool.queue.list.useQuery(undefined, {
		refetchInterval: REFRESH_INTERVAL,
		refetchOnWindowFocus: true,
	});

	// Sync mutation for manual pool synchronization
	const syncMutation = api.pool.sync.useMutation({
		onSuccess: (result) => {
			const totalDeleted =
				result.coolifyOrphansDeleted + result.databaseOrphansDeleted;

			if (totalDeleted === 0) {
				toast.success("Pool is in sync", {
					description: `${result.totalCoolifyApps} Coolify apps, ${result.totalDatabaseSlots} database slots`,
				});
			} else {
				toast.success("Pool synchronized", {
					description: `Deleted ${result.coolifyOrphansDeleted} Coolify orphans, ${result.databaseOrphansDeleted} database orphans`,
				});
			}

			// Refresh data after sync
			void poolStats.refetch();
			void slots.refetch();
		},
		onError: (error) => {
			toast.error("Sync failed", {
				description: error.message,
			});
		},
	});

	// Update last updated timestamp when data changes
	useEffect(() => {
		if (poolStats.data || slots.data) {
			setLastUpdated(new Date());
		}
	}, [poolStats.data, slots.data]);

	const handleManualRefresh = async () => {
		setIsManualRefreshing(true);

		try {
			await Promise.all([
				poolStats.refetch(),
				queueStats.refetch(),
				slots.refetch(),
				queueEntries.refetch(),
			]);

			setLastUpdated(new Date());
		} finally {
			setIsManualRefreshing(false);
		}
	};

	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Pool</PageHeaderTitle>
					<PageHeaderDescription>
						Monitor bot pool capacity and deployment queue
					</PageHeaderDescription>
				</PageHeaderContent>

				<PageHeaderActions>
					<LiveIndicator lastUpdated={lastUpdated} />
					<Button
						variant="outline"
						size="sm"
						onClick={() => syncMutation.mutate()}
						disabled={syncMutation.isPending}
					>
						<RefreshCwOff
							className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
						/>
						Sync
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={handleManualRefresh}
						disabled={isManualRefreshing}
					>
						<RefreshCw
							className={`h-4 w-4 ${isManualRefreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
				</PageHeaderActions>
			</PageHeader>

			{/* Stats cards */}
			<PoolStatsCards stats={poolStats.data} isLoading={poolStats.isLoading} />

			{/* Queue section (only shown if queue has entries) */}
			<PoolQueueSection
				entries={queueEntries.data}
				isLoading={queueEntries.isLoading}
			/>

			{/* Slots table */}
			<PoolSlotsTable
				slots={slots.data}
				isLoading={slots.isLoading}
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
			/>
		</div>
	);
}
