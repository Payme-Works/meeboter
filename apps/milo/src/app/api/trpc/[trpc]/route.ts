import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/unstable-core-do-not-import";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

// Expected client errors that should be logged at info level, not error
const clientErrorCodes = new Set<TRPC_ERROR_CODE_KEY>([
	"BAD_REQUEST",
	"UNAUTHORIZED",
	"FORBIDDEN",
	"NOT_FOUND",
	"PRECONDITION_FAILED",
	"PAYLOAD_TOO_LARGE",
	"PARSE_ERROR",
	"UNPROCESSABLE_CONTENT",
]);

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
	try {
		return await createTRPCContext({
			headers: req.headers,
		});
	} catch (error) {
		// Log context creation errors (these happen before tRPC's error handler)
		console.error("❌ Failed to create tRPC context:", error);

		throw error;
	}
};

const handler = async (req: NextRequest): Promise<Response> => {
	try {
		const response = await fetchRequestHandler({
			endpoint: "/api/trpc",
			req,
			router: appRouter,
			createContext: () => createContext(req),
			onError: ({ path, error }) => {
				// Only log unexpected server errors at error level
				// Expected client errors are logged at info level to reduce noise
				const isClientError = clientErrorCodes.has(error.code);

				if (isClientError) {
					console.log(`[tRPC] Client error on ${path ?? "<no-path>"}:`, {
						code: error.code,
						message: error.message,
					});
				} else {
					console.error(`❌ tRPC server error on ${path ?? "<no-path>"}:`, {
						code: error.code,
						message: error.message,
						cause: error.cause,
						stack: env.NODE_ENV === "development" ? error.stack : undefined,
					});
				}
			},
		});

		return response;
	} catch (error) {
		console.error("❌ tRPC handler error:", error);

		throw error;
	}
};

/**
 * Handle OPTIONS requests for CORS preflight
 */
const handleOptions = async (_req: NextRequest): Promise<Response> => {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": env.NEXT_PUBLIC_APP_ORIGIN_URL,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, Authorization, x-trpc-source",
			"Access-Control-Max-Age": "86400",
		},
	});
};

export { handler as GET, handler as POST, handleOptions as OPTIONS };
