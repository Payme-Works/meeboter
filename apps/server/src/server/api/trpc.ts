/**
 * tRPC server configuration and initialization
 *
 * This file sets up the tRPC server, context creation, middleware, and procedures.
 * You probably don't need to edit this file unless:
 * 1. You want to modify request context (see Part 1)
 * 2. You want to create a new middleware or type of procedure (see Part 3)
 *
 * TL;DR - This is where all the tRPC server configuration is created and plugged in.
 * The pieces you will need to use are documented accordingly near the end
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import superjson from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import { ZodError } from "zod";
import { auth } from "@/server/auth";
import { db } from "@/server/database/db";
import {
	apiKeysTable,
	apiRequestLogsTable,
	usersTable,
} from "@/server/database/schema";

/**
 * User session type definition for authentication
 */
type Session = {
	user: {
		id: string;
		name: string | null;
		email: string;
		image?: string | null;
	};
	expires: string;
};

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provide the required context
 *
 * @see https://trpc.io/docs/server/context
 */

/**
 * Creates the tRPC context with database, session, and request headers
 *
 * @param opts - Options containing request headers
 * @param opts.headers - HTTP request headers for authentication
 * @returns Context object containing database instance, session, and headers
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
	const session = await auth.api.getSession({
		headers: opts.headers,
	});

	return {
		db,
		session,
		...opts,
	};
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get type safety on the frontend if your procedure fails due to validation
 * errors on the backend
 */

/**
 * The main tRPC instance with context, transformer, and error formatting
 */
const t = initTRPC
	.meta<OpenApiMeta>()
	.context<typeof createTRPCContext>()
	.create({
		transformer: superjson,
		errorFormatter({ shape, error }) {
			// Enhanced logging for better debugging
			console.error("tRPC Error Details:", {
				code: error.code,
				message: error.message,
				cause: error.cause,
				stack: error.stack,
			});

			return {
				...shape,
				data: {
					...shape.data,
					zodError:
						error.cause instanceof ZodError ? error.cause.flatten() : null,
				},
			};
		},
	});

/**
 * Factory for creating server-side callers
 *
 * @see https://trpc.io/docs/server/server-side-calls
 * @returns Factory function for creating tRPC callers
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory
 */

/**
 * Router factory for creating new routers and sub-routers in your tRPC API
 *
 * @see https://trpc.io/docs/router
 * @returns Router factory function
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution with performance monitoring
 *
 * Provides performance monitoring for TRPC procedures and reduces log spam
 *
 * @param next - The next middleware/procedure in the chain
 * @param path - The tRPC procedure path being executed
 * @returns The result of the next middleware/procedure
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();

	if (t._config.isDev) {
		// Artificial delay in dev
		const waitMs = Math.floor(Math.random() * 400) + 100;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	const result = await next();

	const duration = Date.now() - start;

	// Only log slow operations (> 1 second) or errors to reduce log spam
	if (duration > 1000) {
		console.warn(`[TRPC] ${path} took ${duration}ms to execute (SLOW)`);
	}

	return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in
 *
 * @returns Public procedure with timing middleware
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Maps tRPC error codes to HTTP status codes for API logging
 *
 * @param e - The error to map to a status code
 * @returns HTTP status code corresponding to the error
 */
const getStatusCode = (e: unknown): number => {
	return e instanceof TRPCError
		? ({
				BAD_REQUEST: 400,
				PARSE_ERROR: 400,
				UNAUTHORIZED: 401,
				FORBIDDEN: 403,
				NOT_FOUND: 404,
				METHOD_NOT_SUPPORTED: 405,
				TIMEOUT: 408,
				CONFLICT: 409,
				PRECONDITION_FAILED: 412,
				PRECONDITION_REQUIRED: 428,
				PAYLOAD_TOO_LARGE: 413,
				UNPROCESSABLE_CONTENT: 422,
				TOO_MANY_REQUESTS: 429,
				CLIENT_CLOSED_REQUEST: 499,
				INTERNAL_SERVER_ERROR: 500,
				NOT_IMPLEMENTED: 501,
				BAD_GATEWAY: 502,
				SERVICE_UNAVAILABLE: 503,
				GATEWAY_TIMEOUT: 504,
				UNSUPPORTED_MEDIA_TYPE: 415,
				PAYMENT_REQUIRED: 402,
			}[e.code] ?? 500)
		: 500;
};

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null
 *
 * @see https://trpc.io/docs/procedures
 * @returns Protected procedure with authentication middleware
 */
export const protectedProcedure = t.procedure
	.use(timingMiddleware)
	.use(async ({ ctx, next, path, type }) => {
		if (ctx.session?.user) {
			return next({
				ctx: {
					// Infers the `session` as non-nullable
					session: { ...ctx.session, user: ctx.session.user },
				},
			});
		}

		// Try to authenticate using API key
		const apiKey = ctx.headers.get("x-api-key");

		if (apiKey) {
			console.log("Authenticated using API Key ", apiKey);

			let error = null;
			let statusCode = 200;
			const startTime = Date.now();

			const apiKeyResult = await ctx.db
				.select()
				.from(apiKeysTable)
				.where(
					and(
						eq(apiKeysTable.key, apiKey),
						eq(apiKeysTable.isRevoked, false),
						gt(apiKeysTable.expiresAt, new Date()),
					),
				);

			if (apiKeyResult[0]) {
				const apiKey = apiKeyResult[0];

				try {
					await ctx.db
						.update(apiKeysTable)
						.set({ lastUsedAt: new Date() })
						.where(eq(apiKeysTable.id, apiKey.id));

					const dbUser = await ctx.db
						.select()
						.from(usersTable)
						.where(eq(usersTable.id, apiKey.userId));

					if (!dbUser[0]) {
						throw new TRPCError({ code: "UNAUTHORIZED" });
					}

					const session: Session = {
						user: {
							id: dbUser[0].id,
							name: dbUser[0].name,
							email: dbUser[0].email,
						},
						expires: apiKey.expiresAt
							? apiKey.expiresAt.toISOString()
							: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
					};

					return next({
						ctx: {
							...ctx,
							session,
						},
					});
				} catch (e) {
					error = e instanceof Error ? e.message : "Unknown error";
					statusCode = getStatusCode(e);

					throw e;
				} finally {
					if (apiKey) {
						const duration = Date.now() - startTime;

						await ctx.db.insert(apiRequestLogsTable).values({
							apiKeyId: apiKey.id,
							userId: apiKey.userId,
							method: type,
							path,
							statusCode,
							requestBody: null,
							responseBody: null, // We don't log response bodies for privacy/security
							error,
							duration,
						});
					}
				}
			}
		}

		// Try to authenticate using bot token
		const botToken = ctx.headers.get("x-bot-token");

		if (
			botToken &&
			process.env.BOT_AUTH_TOKEN &&
			botToken === process.env.BOT_AUTH_TOKEN
		) {
			console.log("Authenticated using Bot Token");

			// Create a minimal session for bot operations
			const botSession: Session = {
				user: {
					id: "bot-system",
					name: "Bot System",
					email: "bot@system.local",
				},
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
			};

			return next({
				ctx: {
					...ctx,
					session: botSession,
				},
			});
		}

		throw new TRPCError({ code: "UNAUTHORIZED" });
	});
