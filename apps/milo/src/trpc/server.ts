import "server-only";

import { createHydrationHelpers } from "@trpc/react-query/rsc";
import { headers } from "next/headers";
import { cache } from "react";

import { type AppRouter, createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createQueryClient } from "./query-client";

/**
 * Creates tRPC context for React Server Component calls
 *
 * Wraps the createTRPCContext helper implementation to provide required context
 * for tRPC API when handling calls from React Server Components
 * Sets the x-trpc-source header to identify RSC origin
 *
 * @returns Promise resolving to tRPC context with RSC-specific headers
 */
const createContext = cache(
	async (): Promise<Awaited<ReturnType<typeof createTRPCContext>>> => {
		const heads = new Headers(await headers());

		heads.set("x-trpc-source", "rsc");

		return createTRPCContext({
			headers: heads,
		});
	},
);

/**
 * Cached query client instance for server-side operations
 * Ensures single instance per request cycle for optimal performance
 */
const getQueryClient = cache(createQueryClient);

/**
 * tRPC caller instance configured with server context
 * Enables direct tRPC procedure calls on the server without HTTP overhead
 */
const caller = createCaller(createContext);

/**
 * Hydration helpers for tRPC integration with React Server Components
 * Provides api client and HydrateClient component for seamless SSR/hydration
 */
type HydrationHelpersType = ReturnType<
	typeof createHydrationHelpers<AppRouter>
>;

const hydrationHelpers: HydrationHelpersType = createHydrationHelpers<AppRouter>(
	caller,
	getQueryClient,
);

export const api: HydrationHelpersType["trpc"] = hydrationHelpers.trpc;
export const HydrateClient: HydrationHelpersType["HydrateClient"] =
	hydrationHelpers.HydrateClient;
