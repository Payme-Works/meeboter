import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

/**
 * Creates a configured QueryClient instance for tRPC integration
 *
 * Sets up React Query client with SSR-optimized defaults and SuperJSON serialization
 * Configures stale time for reduced refetching and proper hydration/dehydration handling
 *
 * @returns Configured QueryClient instance with tRPC-specific settings
 */
export const createQueryClient = (): QueryClient =>
	new QueryClient({
		defaultOptions: {
			queries: {
				// Set stale time above 0 to prevent immediate refetching on client hydration
				// Optimizes SSR performance by reducing unnecessary network requests
				staleTime: 30 * 1000,
			},
			dehydrate: {
				serializeData: SuperJSON.serialize,
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
			},
			hydrate: {
				deserializeData: SuperJSON.deserialize,
			},
		},
	});
