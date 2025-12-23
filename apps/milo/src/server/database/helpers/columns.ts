import { pgTableCreator } from "drizzle-orm/pg-core";

/**
 * Creates database tables with consistent naming convention
 */
export const pgTable = pgTableCreator((name) => name);
