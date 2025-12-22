import {
	boolean,
	integer,
	json,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { pgTable } from "../helpers/columns";
import { usersTable } from "./users";

/**
 * Enum defining available subscription types for users
 */
export const subscriptionEnum = z.enum(["PRO", "PAY_AS_YOU_GO", "CUSTOM"]);
export type Subscription = z.infer<typeof subscriptionEnum>;

/**
 * Database implementation for user subscriptions
 * Stores subscription information including type, status, and duration
 */
export const subscriptionsTable = pgTable("subscription", {
	/** Unique identifier for the subscription */
	id: serial("id").primaryKey(),

	/** Reference to the user who owns this subscription */
	userId: text("user_id")
		.references(() => usersTable.id, { onDelete: "cascade" })
		.notNull(),

	/** Type of subscription (PRO, PAY_AS_YOU_GO, CUSTOM) */
	type: varchar("type", { length: 50 }).$type<Subscription>().notNull(),
	/** Whether the subscription is currently active */
	isActive: boolean("is_active").notNull().default(true),

	/** When the subscription started */
	startDate: timestamp("start_date").notNull().defaultNow(),
	/** When the subscription ends (null for indefinite) */
	endDate: timestamp("end_date"),

	/** When this subscription record was created */
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Validation schema for creating new subscriptions
 */
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);

/**
 * Validation schema for subscription selection queries
 */
export const selectSubscriptionSchema = createSelectSchema(subscriptionsTable);

/**
 * Database implementation for user API keys
 * Stores API keys that users can generate to access the platform programmatically
 */
export const apiKeysTable = pgTable("api_keys", {
	/** Unique identifier for the API key */
	id: serial("id").primaryKey(),
	/** Reference to the user who owns this API key */
	userId: text("user_id")
		.references(() => usersTable.id)
		.notNull(),
	/** The actual API key value (hashed) */
	key: varchar("key", { length: 64 }).notNull().unique(),
	/** User-friendly name for the API key */
	name: varchar("name", { length: 255 }).notNull(),
	/** When this API key was created */
	createdAt: timestamp("created_at").defaultNow(),
	/** When this API key was last used */
	lastUsedAt: timestamp("last_used_at"),
	/** When this API key expires (null for no expiration) */
	expiresAt: timestamp("expires_at"),
	/** Whether this API key has been revoked */
	isRevoked: boolean("is_revoked").default(false),
});

/**
 * Validation schema for creating new API keys
 * Only includes user-provided fields
 */
export const insertApiKeySchema = createInsertSchema(apiKeysTable).pick({
	name: true,
	expiresAt: true,
});

/**
 * Validation schema for API key selection queries
 */
export const selectApiKeySchema = createSelectSchema(apiKeysTable);

/**
 * Database implementation for API request logging
 * Tracks all API requests for monitoring, debugging, and usage analytics
 */
export const apiRequestLogsTable = pgTable("api_request_logs", {
	/** Unique identifier for this request log */
	id: serial("id").primaryKey(),
	/** Reference to the API key used for this request */
	apiKeyId: integer("api_key_id")
		.references(() => apiKeysTable.id)
		.notNull(),
	/** Reference to the user who made this request */
	userId: text("user_id")
		.references(() => usersTable.id)
		.notNull(),
	/** HTTP method used for the request */
	method: varchar("method", { length: 10 }).notNull(),
	/** API endpoint path that was called */
	path: varchar("path", { length: 255 }).notNull(),
	/** HTTP status code returned */
	statusCode: integer("status_code").notNull(),
	/** JSON body of the request */
	requestBody: json("request_body").$type<Record<string, unknown> | null>(),
	/** JSON body of the response */
	responseBody: json("response_body").$type<Record<string, unknown> | null>(),
	/** Error message if the request failed */
	error: varchar("error", { length: 1024 }),
	/** Request duration in milliseconds */
	duration: integer("duration").notNull(),
	/** When this request was made */
	createdAt: timestamp("created_at").defaultNow(),
});

/**
 * Validation schema for creating new API request logs
 * Excludes auto-generated fields
 */
export const insertApiRequestLogSchema = createInsertSchema(
	apiRequestLogsTable,
).omit({
	id: true,
	createdAt: true,
});

/**
 * Validation schema for API request log selection queries
 * Includes custom validation for JSON fields
 */
export const selectApiRequestLogSchema = createSelectSchema(
	apiRequestLogsTable,
	{
		requestBody: z.any(),
		responseBody: z.any(),
	},
);
