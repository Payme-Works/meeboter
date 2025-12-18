import type { AppRouter } from "@meeboter/milo";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "./env";

/**
 * tRPC client configured with MILO_URL env var.
 * Used for all API calls to the Milo backend.
 */
export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.MILO_URL}/api/trpc`,
			transformer: superjson,
			headers: () => ({
				"X-Milo-Token": env.MILO_AUTH_TOKEN,
			}),
		}),
	],
});
