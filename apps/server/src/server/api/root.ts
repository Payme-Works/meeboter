import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { apiKeysRouter } from "./routers/api-keys";
import { botsRouter } from "./routers/bots";
import { eventsRouter } from "./routers/events";
import { usageRouter } from "./routers/usage";

/**
 * Primary router for the tRPC server implementation
 *
 * All routers added in /api/routers should be manually added here
 *
 * @returns The main application router with all sub-routers
 */
export const appRouter = createTRPCRouter({
	bots: botsRouter,
	events: eventsRouter,
	apiKeys: apiKeysRouter,
	usage: usageRouter,
});

/**
 * Type definition of the complete API for client-side usage
 */
export type AppRouter = typeof appRouter;

/**
 * Creates a server-side caller for the tRPC API implementation
 *
 * @example
 * ```typescript
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 * //    ^? Post[]
 * ```
 *
 * @param context - The tRPC context to use for the caller
 * @returns Server-side caller for the tRPC API
 */
export const createCaller = createCallerFactory(appRouter);
