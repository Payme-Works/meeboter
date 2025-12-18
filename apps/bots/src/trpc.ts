import type { AppRouter } from "@meeboter/milo";
import {
	createTRPCProxyClient,
	httpBatchLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

/**
 * Creates a tRPC client configured for the given Milo URL
 */
export function createTrpcClient(miloUrl: string): TRPCClient<AppRouter> {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${miloUrl}/api/trpc`,
				transformer: superjson,
				headers: () => ({
					...(process.env.MILO_AUTH_TOKEN && {
						"X-Milo-Token": process.env.MILO_AUTH_TOKEN,
					}),
				}),
			}),
		],
	}) as TRPCClient<AppRouter>;
}

/**
 * Bootstrap tRPC client using MILO_URL env var.
 * Used only for the initial getPoolSlot call to fetch config.
 */
const bootstrapTrpc = createTrpcClient(
	process.env.MILO_URL || "http://localhost:3000",
);

/**
 * Module-level tRPC client instance.
 * Initially uses MILO_URL for bootstrap, then reconfigured with miloUrl from config.
 */
let _trpc: TRPCClient<AppRouter> = bootstrapTrpc;

/**
 * Get the current tRPC client.
 * Returns the bootstrap client until configureTrpc() is called with miloUrl.
 */
export function getTrpc(): TRPCClient<AppRouter> {
	return _trpc;
}

/**
 * Configure the tRPC client with the miloUrl from bot config.
 * Must be called after fetching bot config via getPoolSlot.
 * @param miloUrl - The Milo API base URL from bot config
 */
export function configureTrpc(miloUrl: string): void {
	console.log(`[trpc] Configuring tRPC client with miloUrl: ${miloUrl}`);
	_trpc = createTrpcClient(miloUrl);
}

/**
 * @deprecated Use getTrpc() for runtime access, configureTrpc() after config is loaded.
 * This export is kept for backwards compatibility.
 */
export const trpc = bootstrapTrpc;
