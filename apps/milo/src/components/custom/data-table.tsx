"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	type PaginationState,
	type RowSelectionState,
	type Table as TanstackTable,
	useReactTable,
} from "@tanstack/react-table";

// Re-export types for consumers
export type { RowSelectionState, TanstackTable };

import { useEffect, useState } from "react";
import ErrorAlert from "@/components/custom/error-alert";

import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import TableSkeleton from "./table-skeleton";

type DataTableProps<TData, TValue> = {
	isLoading?: boolean;
	errorMessage?: string;
	columns?: ColumnDef<TData, TValue>[];
	data?: TData[];

	/** Enable row selection with checkboxes */
	enableRowSelection?: boolean;

	/** Controlled row selection state */
	rowSelection?: RowSelectionState;

	/** Callback when row selection changes */
	onRowSelectionChange?: (selection: RowSelectionState) => void;

	/** Function to get unique row ID (required for row selection) */
	getRowId?: (row: TData) => string;

	/** Callback to expose the table instance */
	onTableReady?: (table: TanstackTable<TData>) => void;

	/** External pagination control: current page index (0-indexed) */
	pageIndex?: number;

	/** External pagination control: page size */
	pageSize?: number;

	/** Callback when page index changes */
	onPageIndexChange?: (pageIndex: number) => void;

	/** Callback when page size changes */
	onPageSizeChange?: (pageSize: number) => void;

	/** Total page count (for external pagination display) */
	pageCount?: number;
};

export function DataTable<TData, TValue>({
	columns,
	data,
	isLoading,
	errorMessage,
	enableRowSelection,
	rowSelection: controlledRowSelection,
	onRowSelectionChange,
	getRowId,
	onTableReady,
	pageIndex: controlledPageIndex,
	pageSize: controlledPageSize,
	onPageIndexChange,
	onPageSizeChange,
	pageCount: controlledPageCount,
}: DataTableProps<TData, TValue>) {
	const [internalRowSelection, setInternalRowSelection] =
		useState<RowSelectionState>({});

	// Use controlled selection if provided, otherwise use internal state
	const rowSelection = controlledRowSelection ?? internalRowSelection;

	const handleRowSelectionChange = (
		updater:
			| RowSelectionState
			| ((prev: RowSelectionState) => RowSelectionState),
	) => {
		const newSelection =
			typeof updater === "function" ? updater(rowSelection) : updater;

		if (onRowSelectionChange) {
			onRowSelectionChange(newSelection);
		} else {
			setInternalRowSelection(newSelection);
		}
	};

	// Determine if pagination is externally controlled
	const isExternalPagination =
		controlledPageIndex !== undefined && onPageIndexChange !== undefined;

	// Track pagination state internally to preserve it across data changes
	const [internalPagination, setInternalPagination] = useState<PaginationState>(
		{
			pageIndex: controlledPageIndex ?? 0,
			pageSize: controlledPageSize ?? 10,
		},
	);

	// Use controlled pagination if provided, otherwise use internal state
	const pagination: PaginationState = isExternalPagination
		? {
				pageIndex: controlledPageIndex,
				pageSize: controlledPageSize ?? 10,
			}
		: internalPagination;

	const handlePaginationChange = (
		updater: PaginationState | ((prev: PaginationState) => PaginationState),
	) => {
		const newPagination =
			typeof updater === "function" ? updater(pagination) : updater;

		if (isExternalPagination) {
			if (newPagination.pageIndex !== pagination.pageIndex) {
				onPageIndexChange(newPagination.pageIndex);
			}

			if (onPageSizeChange && newPagination.pageSize !== pagination.pageSize) {
				onPageSizeChange(newPagination.pageSize);
			}
		} else {
			setInternalPagination(newPagination);
		}
	};

	// Reset to first page if current page would be empty after data changes (only for internal pagination)
	useEffect(() => {
		if (!isExternalPagination && data) {
			const maxPageIndex = Math.max(
				0,
				Math.ceil(data.length / pagination.pageSize) - 1,
			);

			if (pagination.pageIndex > maxPageIndex) {
				setInternalPagination((prev) => ({
					...prev,
					pageIndex: maxPageIndex,
				}));
			}
		}
	}, [data, pagination.pageSize, pagination.pageIndex, isExternalPagination]);

	const table = useReactTable({
		data: data ?? [],
		columns: columns ?? [],
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		enableRowSelection: enableRowSelection ?? false,
		onRowSelectionChange: handleRowSelectionChange,
		onPaginationChange: handlePaginationChange,
		manualPagination: isExternalPagination && controlledPageCount !== undefined,
		pageCount: controlledPageCount,
		state: {
			rowSelection,
			pagination,
		},
		getRowId,
	});

	// Expose table instance to parent
	useEffect(() => {
		if (onTableReady) {
			onTableReady(table);
		}
	}, [table, onTableReady]);

	return (
		<div>
			{isLoading ? (
				<TableSkeleton />
			) : errorMessage ? (
				<ErrorAlert errorMessage={errorMessage} />
			) : (
				<>
					<div className="border">
						<Table>
							<TableHeader>
								{table &&
									columns &&
									table.getHeaderGroups().map((headerGroup) => (
										<TableRow key={headerGroup.id}>
											{headerGroup.headers.map((header) => {
												return (
													<TableHead key={header.id}>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext(),
																)}
													</TableHead>
												);
											})}
										</TableRow>
									))}
							</TableHeader>
							<TableBody>
								{table && columns && table.getRowModel().rows?.length ? (
									table.getRowModel().rows.map((row) => (
										<TableRow
											key={row.id}
											data-state={row.getIsSelected() && "selected"}
										>
											{row.getVisibleCells().map((cell) => (
												<TableCell key={cell.id}>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											))}
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={columns?.length ?? 1}
											className="h-24 text-center"
										>
											No records found.
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
					<div className="flex items-center justify-between py-4">
						<div className="flex-1 text-sm text-muted-foreground">
							{enableRowSelection ? (
								<span>
									{table.getFilteredSelectedRowModel().rows.length} of{" "}
									{table.getFilteredRowModel().rows.length} row(s) selected
								</span>
							) : null}
						</div>
						<div className="flex items-center space-x-2">
							<span className="text-sm text-muted-foreground">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => table?.previousPage()}
								disabled={!table?.getCanPreviousPage() || !table}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => table?.nextPage()}
								disabled={!table?.getCanNextPage() || !table}
							>
								Next
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
