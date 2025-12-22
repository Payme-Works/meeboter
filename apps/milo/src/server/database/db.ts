import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";

import * as schema from "./schema/index";

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
		ssl: env.DATABASE_SSL
			? {
					rejectUnauthorized: false,
				}
			: false,
		max: 30, // Reduce from 50 to leave headroom for database max_connections
		idle_timeout: 30, // Reduce from 60 to recycle connections faster
		max_lifetime: 60 * 10, // Reduce from 30 to 10 minutes
		connect_timeout: 10, // Reduce from 30 to fail fast
		prepare: true, // Enable prepared statements for better performance
		transform: {
			...postgres.toCamel,
			undefined: null, // Handle undefined values properly
		},
		connection: {
			application_name: "meeboter-milo",
		},
		onnotice: env.NODE_ENV === "development" ? console.log : undefined, // Log notices in development
		debug: false, // Disable debug in all environments for performance
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

export type Db = typeof db;
