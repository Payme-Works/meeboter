import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/src/server/api/root";

export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: process.env.BACKEND_URL || "http://localhost:3001/api/trpc",
			transformer: superjson,
		}),
	],
});
