"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import ErrorAlert from "@/components/custom/error-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type DataTableProps<TData, TValue> = {
	isLoading?: boolean;
	errorMessage?: string;
	columns?: ColumnDef<TData, TValue>[];
	data?: TData[];
	skeleton?: ReactNode;
};

function DefaultTableSkeleton({ columnCount = 4 }: { columnCount?: number }) {
	return (
		<div>
			<div className="border">
				<Table>
					<TableHeader>
						<TableRow>
							{Array.from({ length: columnCount }, (_, i) => (
								<TableHead key={i}>
									<Skeleton className="h-4 w-20" />
								</TableHead>
							))}
						</TableRow>
					</TableHeader>

					<TableBody>
						{Array.from({ length: 5 }, (_, rowIndex) => (
							<TableRow key={rowIndex}>
								{Array.from({ length: columnCount }, (_, colIndex) => (
									<TableCell key={colIndex}>
										<Skeleton className="h-4 w-20" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-end space-x-2 py-4">
				<Skeleton className="h-9 w-20" />
				<Skeleton className="h-9 w-14" />
			</div>
		</div>
	);
}

export function DataTable<TData, TValue>({
	columns,
	data,
	isLoading,
	errorMessage,
	skeleton,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data: data ?? [],
		columns: columns ?? [],
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<div>
			{isLoading ? (
				(skeleton ?? <DefaultTableSkeleton columnCount={columns?.length} />)
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
					<div className="flex items-center justify-end space-x-2 py-4">
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
				</>
			)}
		</div>
	);
}
