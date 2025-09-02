import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema";

/**
 * Global cache for database client to avoid creating multiple instances
 *
 * Cache the database client in development to prevent creating a new client
 * on every hot module reload (HMR) update
 */
const globalForDb = globalThis as unknown as {
	client: postgres.Sql | undefined;
};

/**
 * PostgreSQL database client instance
 *
 * Creates a postgres client with SSL configuration based on environment
 * Uses cached client in development to optimize hot reloading performance
 */
const client: postgres.Sql =
	globalForDb.client ??
	postgres(env.DATABASE_URL, {
		ssl:
			env.NODE_ENV === "production"
				? {
						rejectUnauthorized: false,
					}
				: false,
		max: 1,
	});

// Cache client in development environment to avoid recreation on HMR updates
if (env.NODE_ENV !== "production") {
	globalForDb.client = client;
}

/**
 * Drizzle ORM database instance
 *
 * Main database connection using Drizzle ORM with PostgreSQL client
 * Includes the complete database schema for type-safe queries
 */
export const db = drizzle(client, { schema });
