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
		max: 50, // Increased to 50 to handle high concurrent bot requests
		idle_timeout: 60, // Increased from 20 to 60 seconds to reduce connection churn
		max_lifetime: 60 * 30, // 30 minutes
		connect_timeout: 30, // Increased from 10 to 30 seconds for slow database connections
		prepare: false, // Disable prepared statements for better connection reuse
		transform: {
			...postgres.toCamel,
			undefined: null, // Handle undefined values properly
		},
		onnotice: env.NODE_ENV === "development" ? console.log : undefined, // Log notices in development
		debug: env.NODE_ENV === "development" ? console.log : false,
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
