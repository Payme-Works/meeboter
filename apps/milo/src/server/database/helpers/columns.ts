import { pgTableCreator, timestamp } from "drizzle-orm/pg-core";

/**
 * Creates database tables with consistent naming convention
 */
export const pgTable = pgTableCreator((name) => name);

/**
 * Shared timestamp columns for tables that track creation and updates
 */
export const timestamps = {
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

/**
 * Optional timestamp columns (nullable)
 */
export const optionalTimestamps = {
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
};
