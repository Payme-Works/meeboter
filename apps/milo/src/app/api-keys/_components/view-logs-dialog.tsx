"use client";

import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { DataTable } from "@/components/custom/data-table";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/trpc/react";

interface ViewLogsDialogProps {
	selectedViewLogsKeyId: number | null;
	setSelectedViewLogsKeyId: (id: number | null) => void;
}

export function ViewLogsDialog({
	selectedViewLogsKeyId,
	setSelectedViewLogsKeyId,
}: ViewLogsDialogProps) {
	const {
		data: logsData,
		isLoading,
		error,
	} = api.apiKeys.getApiKeyLogs.useQuery(
		{
			id: String(selectedViewLogsKeyId),
			limit: "10",
			offset: "0",
		},
		{
			enabled: selectedViewLogsKeyId !== null,
		},
	);

	const logs = logsData?.logs ?? [];

	type Log = (typeof logs)[number];

	const logColumns: ColumnDef<Log>[] = [
		{
			accessorKey: "method",
			header: "Method",
			cell: ({ row }) => {
				const method = row.getValue<string>("method");

				return <span className="font-mono">{method}</span>;
			},
		},
		{
			accessorKey: "path",
			header: "Path",
			cell: ({ row }) => {
				const path = row.getValue<string>("path");

				return <span className="font-mono">{path}</span>;
			},
		},
		{
			accessorKey: "statusCode",
			header: "Status",
			cell: ({ row }) => {
				const status = row.getValue<number>("statusCode");

				function getStatusColor() {
					if (status >= 200 && status < 300) return "text-green-600";

					if (status >= 400) return "text-red-600";

					return "text-yellow-600";
				}

				return (
					<span className={`font-mono ${getStatusColor()}`}>{status}</span>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: "Time",
			cell: ({ row }) => {
				const date = row.getValue<Date | null>("createdAt");

				return date ? dayjs(date).format("MMM D, YYYY HH:mm:ss") : "-";
			},
		},
	];

	return (
		<Dialog
			open={selectedViewLogsKeyId !== null}
			onOpenChange={() => setSelectedViewLogsKeyId(null)}
		>
			<DialogContent className="max-w-4xl" aria-description="API Key Logs">
				<DialogHeader>
					<DialogTitle>API Key Logs</DialogTitle>
				</DialogHeader>
				<DataTable
					columns={logColumns}
					data={logs}
					isLoading={isLoading}
					errorMessage={error?.message}
				/>
			</DialogContent>
		</Dialog>
	);
}
