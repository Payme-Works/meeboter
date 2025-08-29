import type { AppRouter } from "@live-boost/server";
import {
	createTRPCProxyClient,
	httpBatchLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: process.env.BACKEND_URL || "http://localhost:3001/api/trpc",
			transformer: superjson,
		}),
	],
}) as TRPCClient<AppRouter>;
