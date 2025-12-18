import type { AppRouter } from "@meeboter/milo";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

/**
 * tRPC client configured with MILO_URL env var.
 * Used for all API calls to the Milo backend.
 */
export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${process.env.MILO_URL || "http://localhost:3000"}/api/trpc`,
			transformer: superjson,
			headers: () => ({
				...(process.env.MILO_AUTH_TOKEN && {
					"X-Milo-Token": process.env.MILO_AUTH_TOKEN,
				}),
			}),
		}),
	],
});
