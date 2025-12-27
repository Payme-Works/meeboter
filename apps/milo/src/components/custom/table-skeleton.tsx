import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
	rows?: number;
}

export default function TableSkeleton({ rows = 10 }: TableSkeletonProps) {
	// Match DataTable height calculation for consistent layout
	const headerHeight = 41;
	const rowHeight = 37;
	const tableHeight = headerHeight + rowHeight * rows;

	return (
		<div>
			<div
				className="border rounded-md overflow-hidden"
				style={{
					height: tableHeight,
					minHeight: tableHeight,
					maxHeight: tableHeight,
				}}
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>
								<Skeleton className="h-4 w-24" />
							</TableHead>
							<TableHead>
								<Skeleton className="h-4 w-32" />
							</TableHead>
							<TableHead>
								<Skeleton className="h-4 w-20" />
							</TableHead>
							<TableHead>
								<Skeleton className="h-4 w-16" />
							</TableHead>
						</TableRow>
					</TableHeader>

					<TableBody>
						{Array.from({ length: rows }, (_, i) => (
							<TableRow key={i}>
								<TableCell>
									<Skeleton className="h-4 w-28" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-36" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-4 w-16" />
								</TableCell>
								<TableCell>
									<Skeleton className="h-8 w-24" />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-end gap-2 py-4">
				<Skeleton className="h-9 w-20" />
				<Skeleton className="h-9 w-16" />
			</div>
		</div>
	);
}
