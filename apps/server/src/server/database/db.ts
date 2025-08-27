import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

/**
 * Cache the database client in development. This avoids creating a new client on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
	client: postgres.Sql | undefined;
};

const client =
	globalForDb.client ??
	postgres(env.DATABASE_URL, {
		ssl: {
			rejectUnauthorized: false,
		},
		max: 1,
	});
if (env.NODE_ENV !== "production") {
	globalForDb.client = client;
}

export const db = drizzle(client, { schema });
