import { z } from "zod";

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	pageCount: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	nextCursor: string | null;
}

export const paginationInput = z.object({
	page: z.number().min(1).default(1),
	pageSize: z.number().min(1).max(100).default(10),
});

export type PaginationInput = z.infer<typeof paginationInput>;

export function buildPaginatedResponse<T>(
	data: T[],
	total: number,
	page: number,
	pageSize: number,
	getCursor: (item: T) => string,
): PaginatedResponse<T> {
	return {
		data,
		total,
		pageCount: Math.ceil(total / pageSize),
		hasNextPage: page * pageSize < total,
		hasPreviousPage: page > 1,
		nextCursor: data.length > 0 ? getCursor(data[data.length - 1]) : null,
	};
}
