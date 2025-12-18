import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

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
				// Always log errors (don't expose details to clients, but log them server-side)
				console.error(`❌ tRPC failed on ${path ?? "<no-path>"}:`, {
					message: error.message,
					code: error.code,
					cause: error.cause,
					stack: env.NODE_ENV === "development" ? error.stack : undefined,
				});
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
