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

const handler = (req: NextRequest) =>
	fetchRequestHandler({
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

export { handler as GET, handler as POST };
