import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
	buildPaginatedResponse,
	type PaginatedResponse,
	paginationInput,
} from "@/lib/pagination";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	apiKeysTable,
	apiRequestLogsTable,
	insertApiKeySchema,
	selectApiKeySchema,
	selectApiRequestLogSchema,
} from "@/server/database/schema";
import { extractCount } from "@/server/utils/database";

export const apiKeysRouter = createTRPCRouter({
	/**
	 * Creates a new API key for the authenticated user
	 * Generates a secure random key and stores it with expiration date
	 * @param {object} input - Input parameters
	 * @param {string} input.name - Name for the API key
	 * @param {Date} input.expiresAt - Expiration date (defaults to 6 months from creation)
	 * @returns {Promise<object>} Created API key with generated key value
	 */
	createApiKey: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/api-keys",
				description: "Create a new API key for the specified user",
			},
		})
		.input(
			insertApiKeySchema.extend({
				expiresAt: z
					.date()
					.optional()
					.default(new Date(Date.now() + 1000 * 60 * 60 * 24 * 180)), // 6 months from now
			}),
		)
		.output(
			selectApiKeySchema.extend({
				key: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Generate a random API key
			const key = randomBytes(32).toString("hex");

			const result = await ctx.db
				.insert(apiKeysTable)
				.values({
					userId: ctx.session.user.id,
					expiresAt: input.expiresAt,
					key,
					name: input.name,
				})
				.returning();

			if (!result[0]) {
				throw new Error("Failed to create API key");
			}

			return result[0];
		}),

	/**
	 * Retrieves paginated API keys owned by the authenticated user
	 * Returns list of API keys without exposing the actual key values
	 * @param input - Pagination parameters (page, pageSize)
	 * @returns {Promise<PaginatedResponse<object>>} Paginated API keys
	 */
	listApiKeys: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/api-keys",
				description: "List paginated API keys for the specified user",
			},
		})
		.input(paginationInput)
		.query(
			async ({
				ctx,
				input,
			}): Promise<PaginatedResponse<typeof selectApiKeySchema._output>> => {
				const { page, pageSize } = input;
				const offset = (page - 1) * pageSize;

				const [data, countResult] = await Promise.all([
					ctx.db
						.select()
						.from(apiKeysTable)
						.where(eq(apiKeysTable.userId, ctx.session.user.id))
						.orderBy(desc(apiKeysTable.createdAt))
						.limit(pageSize)
						.offset(offset),
					ctx.db
						.select({ count: sql<number>`count(*)` })
						.from(apiKeysTable)
						.where(eq(apiKeysTable.userId, ctx.session.user.id)),
				]);

				const total = Number(countResult[0]?.count ?? 0);

				return buildPaginatedResponse(data, total, page, pageSize, (item) =>
					String(item.id),
				);
			},
		),

	/**
	 * Revokes an API key by setting its revoked status to true
	 * Only the owner of the API key can revoke it
	 * @param {object} input - Input parameters
	 * @param {string} input.id - ID of the API key to revoke
	 * @returns {Promise<object>} Updated API key with revoked status
	 */
	revokeApiKey: protectedProcedure
		.meta({
			openapi: {
				method: "POST",
				path: "/api-keys/{id}/revoke",
				description: "Revoke an API key",
			},
		})
		.input(z.object({ id: z.string().transform((val) => Number(val)) }))
		.output(selectApiKeySchema)
		.mutation(async ({ input, ctx }) => {
			// Check if the API key belongs to the user
			const apiKey = await ctx.db
				.select()
				.from(apiKeysTable)
				.where(
					and(
						eq(apiKeysTable.id, input.id),
						eq(apiKeysTable.userId, ctx.session.user.id),
					),
				);

			if (!apiKey[0] || apiKey[0].userId !== ctx.session.user.id) {
				throw new Error("API key not found");
			}

			const result = await ctx.db
				.update(apiKeysTable)
				.set({ isRevoked: true })
				.where(
					and(
						eq(apiKeysTable.id, input.id),
						eq(apiKeysTable.userId, ctx.session.user.id),
					),
				)
				.returning();

			if (!result[0]) {
				throw new Error("API key not found");
			}

			return result[0];
		}),

	/**
	 * Retrieves usage logs for a specific API key with pagination
	 * Only the owner of the API key can view its logs
	 * @param {object} input - Input parameters
	 * @param {string} input.id - ID of the API key
	 * @param {number} input.limit - Maximum number of logs to return (1-100, default 50)
	 * @param {number} input.offset - Number of logs to skip (default 0)
	 * @returns {Promise<object>} Object containing logs array and total count
	 */
	getApiKeyLogs: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/api-keys/{id}/logs",
				description: "Get usage logs for a specific API key",
			},
		})
		.input(
			z.object({
				id: z.string().transform((val) => Number(val)),
				limit: z
					.string()
					.transform((val) => Number(val))
					.pipe(z.number().min(1).max(100))
					.default(50),
				offset: z
					.string()
					.transform((val) => Number(val))
					.pipe(z.number().min(0))
					.default(0),
			}),
		)
		.output(
			z.object({
				logs: z.array(selectApiRequestLogSchema),
				total: z.number(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Check if the API key belongs to the user
			const apiKey = await ctx.db
				.select()
				.from(apiKeysTable)
				.where(
					and(
						eq(apiKeysTable.id, input.id),
						eq(apiKeysTable.userId, ctx.session.user.id),
					),
				);

			if (!apiKey[0] || apiKey[0].userId !== ctx.session.user.id) {
				throw new Error("API key not found");
			}

			// Get logs with pagination
			const logs = await ctx.db
				.select()
				.from(apiRequestLogsTable)
				.where(
					and(
						eq(apiRequestLogsTable.apiKeyId, input.id),
						eq(apiRequestLogsTable.userId, ctx.session.user.id),
					),
				)
				.orderBy(desc(apiRequestLogsTable.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			// Get total count
			const countResult = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(apiRequestLogsTable)
				.where(
					and(
						eq(apiRequestLogsTable.apiKeyId, input.id),
						eq(apiRequestLogsTable.userId, ctx.session.user.id),
					),
				);

			return {
				logs,
				total: extractCount(countResult),
			};
		}),

	/**
	 * Retrieves usage logs for all API keys owned by the authenticated user
	 * Provides pagination support for large result sets
	 * @param {object} input - Input parameters
	 * @param {number} input.limit - Maximum number of logs to return (1-100, default 50)
	 * @param {number} input.offset - Number of logs to skip (default 0)
	 * @returns {Promise<object>} Object containing logs array and total count
	 */
	getAllApiKeyLogs: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/api-keys/logs",
				description: "Get usage logs for all API keys owned by the user",
			},
		})
		.input(
			z.object({
				limit: z
					.string()
					.transform((val) => Number(val))
					.pipe(z.number().min(1).max(100))
					.default(50),
				offset: z
					.string()
					.transform((val) => Number(val))
					.pipe(z.number().min(0))
					.default(0),
			}),
		)
		.output(
			z.object({
				logs: z.array(selectApiRequestLogSchema),
				total: z.number(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Get all API key IDs for the user
			const userApiKeys = await ctx.db
				.select()
				.from(apiKeysTable)
				.where(eq(apiKeysTable.userId, ctx.session.user.id));

			const apiKeyIds = userApiKeys.map((key) => key.id);

			if (apiKeyIds.length === 0) {
				return {
					logs: [],
					total: 0,
				};
			}

			// Get logs with pagination
			const logs = await ctx.db
				.select()
				.from(apiRequestLogsTable)
				.where(
					and(
						inArray(apiRequestLogsTable.apiKeyId, apiKeyIds),
						eq(apiRequestLogsTable.userId, ctx.session.user.id),
					),
				)
				.orderBy(desc(apiRequestLogsTable.createdAt))
				.limit(input.limit)
				.offset(input.offset);

			// Get total count
			const countResult = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(apiRequestLogsTable)
				.where(
					and(
						inArray(apiRequestLogsTable.apiKeyId, apiKeyIds),
						eq(apiRequestLogsTable.userId, ctx.session.user.id),
					),
				);

			return {
				logs,
				total: extractCount(countResult),
			};
		}),

	/**
	 * Retrieves the total count of non-expired API keys owned by the authenticated user
	 * Useful for displaying statistics or enforcing limits
	 * @returns {Promise<object>} Object containing the count of active API keys
	 */
	getApiKeyCount: protectedProcedure
		.meta({
			openapi: {
				method: "GET",
				path: "/api-keys/count",
				description:
					"Get the total count of non-expired API keys owned by the user",
			},
		})
		.input(z.void())
		.output(z.object({ count: z.number() }))
		.query(async ({ ctx }) => {
			const countResult = await ctx.db
				.select({ count: sql<number>`count(*)` })
				.from(apiKeysTable)
				.where(
					and(
						eq(apiKeysTable.userId, ctx.session.user.id),
						sql`${apiKeysTable.expiresAt} > NOW()`,
					),
				);

			return { count: extractCount(countResult) };
		}),
});
