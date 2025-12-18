import type { AppRouter } from "@meeboter/milo";
import {
	createTRPCProxyClient,
	httpBatchLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

export const trpc = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: process.env.BACKEND_URL || "http://localhost:3000/api/trpc",
			transformer: superjson,
			headers: () => ({
				...(process.env.BOT_AUTH_TOKEN && {
					"x-bot-token": process.env.BOT_AUTH_TOKEN,
				}),
			}),
		}),
	],
}) as TRPCClient<AppRouter>;
