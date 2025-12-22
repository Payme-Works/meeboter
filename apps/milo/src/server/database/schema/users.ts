import { boolean, integer, text, timestamp } from "drizzle-orm/pg-core";

import { pgTable } from "../helpers/columns";

/**
 * Database implementation for application users
 * Stores user profile information and account settings
 */
export const usersTable = pgTable("user", {
	/** Unique identifier for the user */
	id: text("id").primaryKey(),

	/** User's display name */
	name: text("name").notNull(),
	/** User's email address (unique across all users) */
	email: text("email").notNull().unique(),
	/** Whether the user's email has been verified */
	emailVerified: boolean("email_verified").notNull().default(false),

	/** URL to user's profile image */
	image: text("image"),

	/** Custom daily bot limit for this user (overrides default limits) */
	customDailyBotLimit: integer("custom_daily_bot_limit"),

	/** When this user account was created */
	createdAt: timestamp("created_at").notNull().defaultNow(),
	/** When this user account was last updated */
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Database implementation for user authentication sessions
 * Stores session tokens and metadata for logged-in users
 */
export const sessionsTable = pgTable("session", {
	/** Unique identifier for the session */
	id: text("id").primaryKey(),

	/** When this session expires */
	expiresAt: timestamp("expires_at").notNull(),
	/** Session token (unique across all sessions) */
	token: text("token").notNull().unique(),

	/** IP address where the session was created */
	ipAddress: text("ip_address"),
	/** User agent string from the client */
	userAgent: text("user_agent"),

	/** Reference to the user who owns this session */
	userId: text("user_id")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	/** When this session was created */
	createdAt: timestamp("created_at").notNull().defaultNow(),
	/** When this session was last updated */
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Database implementation for OAuth provider accounts
 * Links users to their external authentication providers (Google, GitHub, etc.)
 */
export const accountsTable = pgTable("account", {
	/** Unique identifier for this account link */
	id: text("id").primaryKey(),

	/** Account ID from the external provider */
	accountId: text("account_id").notNull(),
	/** Identifier of the OAuth provider */
	providerId: text("provider_id").notNull(),

	/** Reference to the user who owns this account */
	userId: text("user_id")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	/** OAuth access token for API calls */
	accessToken: text("access_token"),
	/** OAuth refresh token for renewing access */
	refreshToken: text("refresh_token"),
	/** OpenID Connect ID token */
	idToken: text("id_token"),

	/** When the access token expires */
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	/** When the refresh token expires */
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),

	/** OAuth scope permissions granted */
	scope: text("scope"),
	/** Hashed password for local authentication */
	password: text("password"),

	/** When this account was linked */
	createdAt: timestamp("created_at").notNull().defaultNow(),
	/** When this account was last updated */
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Database implementation for email verification tokens
 * Stores temporary tokens for email verification and password reset flows
 */
export const verificationTable = pgTable("verification", {
	/** Unique identifier for this verification token */
	id: text("id").primaryKey(),
	/** Email address or identifier being verified */
	identifier: text("identifier").notNull(),
	/** Verification token value */
	value: text("value").notNull(),
	/** When this verification token expires */
	expiresAt: timestamp("expires_at").notNull(),
	/** When this verification token was created */
	createdAt: timestamp("created_at").defaultNow(),
	/** When this verification token was last updated */
	updatedAt: timestamp("updated_at").defaultNow(),
});
