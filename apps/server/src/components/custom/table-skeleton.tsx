import type { ReactNode } from "react";
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
	children: ReactNode;
	rowCount?: number;
}

function TableSkeletonHeaderCell({ children }: { children?: ReactNode }) {
	return <TableHead>{children ?? <Skeleton className="h-4 w-20" />}</TableHead>;
}

function TableSkeletonCell({ children }: { children?: ReactNode }) {
	return <TableCell>{children ?? <Skeleton className="h-4 w-20" />}</TableCell>;
}

function TableSkeletonRow({ children }: { children: ReactNode }) {
	return <TableRow>{children}</TableRow>;
}

function TableSkeleton({ children, rowCount = 5 }: TableSkeletonProps) {
	return (
		<div>
			<div className="border">
				<Table>
					<TableHeader>
						<TableRow>{children}</TableRow>
					</TableHeader>

					<TableBody>
						{Array.from({ length: rowCount }, (_, i) => (
							<TableRow key={i}>{children}</TableRow>
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

export {
	TableSkeleton,
	TableSkeletonHeaderCell,
	TableSkeletonCell,
	TableSkeletonRow,
};
