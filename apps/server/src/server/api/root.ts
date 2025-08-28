import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { apiKeysRouter } from "./routers/api-keys";
import { botsRouter } from "./routers/bots";
import { eventsRouter } from "./routers/events";
import { usageRouter } from "./routers/usage";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	bots: botsRouter,
	events: eventsRouter,
	apiKeys: apiKeysRouter,
	usage: usageRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
