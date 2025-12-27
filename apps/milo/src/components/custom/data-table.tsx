"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	type PaginationState,
	type RowData,
	type RowSelectionState,
	type TableMeta,
	type Table as TanstackTable,
	useReactTable,
} from "@tanstack/react-table";

// Re-export types for consumers
export type { RowSelectionState };

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

	/** Total page count (for server-side pagination) */
	pageCount?: number;

	/** Total item count (enables server-side pagination when provided) */
	totalCount?: number;

	/** Has next page (server-side pagination) */
	hasNextPage?: boolean;

	/** Has previous page (server-side pagination) */
	hasPreviousPage?: boolean;

	/** Callback when a row is clicked (ignored for interactive elements) */
	onRowClick?: (row: TData) => void;

	/** Table meta object for passing custom data/callbacks to columns */
	meta?: TableMeta<TData>;
};

export function DataTable<TData extends RowData, TValue>({
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
	totalCount,
	hasNextPage,
	hasPreviousPage,
	onRowClick,
	meta,
}: DataTableProps<TData, TValue>) {
	// Server-side pagination is enabled when totalCount is provided
	const isServerSidePagination = totalCount !== undefined;

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

	// Calculate page count for server-side pagination
	const serverPageCount =
		isServerSidePagination && totalCount !== undefined
			? Math.ceil(totalCount / pagination.pageSize)
			: undefined;

	const table = useReactTable({
		data: data ?? [],
		columns: columns ?? [],
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		enableRowSelection: enableRowSelection ?? false,
		onRowSelectionChange: handleRowSelectionChange,
		onPaginationChange: handlePaginationChange,
		manualPagination:
			isServerSidePagination ||
			(isExternalPagination && controlledPageCount !== undefined),
		pageCount: controlledPageCount ?? serverPageCount,
		autoResetPageIndex: false,
		state: {
			rowSelection,
			pagination,
		},
		getRowId,
		meta,
	});

	// Expose table instance to parent
	useEffect(() => {
		if (onTableReady) {
			onTableReady(table);
		}
	}, [table, onTableReady]);

	// Fixed height: h-12 (48px) for rows, h-10 (40px) for header (matches TableRow/TableHead CSS)
	const headerHeight = 40;
	const rowHeight = 48;
	const tableMinHeight = headerHeight + rowHeight * pagination.pageSize;

	return (
		<div>
			{isLoading ? (
				<TableSkeleton rows={pagination.pageSize} />
			) : errorMessage ? (
				<ErrorAlert errorMessage={errorMessage} />
			) : (
				<>
					<div
						className="border rounded-md overflow-hidden"
						style={{
							height: tableMinHeight,
							minHeight: tableMinHeight,
							maxHeight: tableMinHeight,
						}}
					>
						<div className="overflow-x-auto overflow-y-hidden h-full">
							<Table className="min-w-[640px]">
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
												className={
													onRowClick
														? "cursor-pointer hover:bg-muted/50 transition-colors"
														: undefined
												}
												onClick={(e) => {
													if (!onRowClick) return;

													const target = e.target as HTMLElement;

													const interactiveElements =
														"button, a, input, [role=checkbox], [role=button], [data-no-row-click]";

													if (target.closest(interactiveElements)) return;

													onRowClick(row.original);
												}}
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
					</div>
					<div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
						<div className="text-sm text-muted-foreground">
							{enableRowSelection ? (
								<span>
									{table.getFilteredSelectedRowModel().rows.length} of{" "}
									{table.getFilteredRowModel().rows.length} row(s) selected
								</span>
							) : null}
						</div>
						<div className="flex items-center justify-between gap-2 sm:justify-end">
							<span className="text-sm text-muted-foreground whitespace-nowrap">
								Page {table.getState().pagination.pageIndex + 1} of{" "}
								{table.getPageCount()}
							</span>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => table?.previousPage()}
									disabled={
										isServerSidePagination
											? hasPreviousPage === false
											: !table?.getCanPreviousPage() || !table
									}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => table?.nextPage()}
									disabled={
										isServerSidePagination
											? hasNextPage === false
											: !table?.getCanNextPage() || !table
									}
								>
									Next
								</Button>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
