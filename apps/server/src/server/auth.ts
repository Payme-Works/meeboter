import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "@/env";
import { db } from "./database/db";
import {
	accountsTable,
	sessionsTable,
	usersTable,
	verificationTable,
} from "./database/schema";

/**
 * Authentication configuration and setup using better-auth library.
 *
 * This implementation configures authentication with:
 * - Drizzle ORM database adapter with PostgreSQL
 * - Email and password authentication
 * - GitHub OAuth social provider
 * - Database schema mapping for users, sessions, accounts, and verification
 *
 * @remarks
 * The authentication system uses better-auth as the core authentication library
 * with Drizzle adapter for database operations. Email verification is currently
 * disabled for email/password authentication.
 *
 * @example
 * ```typescript
 * import { auth } from './auth';
 *
 * // Use in API routes or middleware
 * const session = await auth.api.getSession({ headers: request.headers });
 * ```
 */
export const auth = betterAuth({
	/**
	 * Database adapter configuration using Drizzle ORM.
	 * Maps authentication tables to the corresponding database schema.
	 */
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: usersTable,
			session: sessionsTable,
			account: accountsTable,
			verification: verificationTable,
		},
	}),

	/**
	 * Email and password authentication configuration.
	 * Currently configured with email verification disabled.
	 */
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},

	/**
	 * Social authentication providers configuration.
	 * Currently supports GitHub OAuth authentication.
	 */
	socialProviders: {
		github: {
			clientId: env.AUTH_GITHUB_ID,
			clientSecret: env.AUTH_GITHUB_SECRET,
		},
	},

	/**
	 * Secret key used for signing tokens and encrypting sensitive data.
	 * Retrieved from environment variables for security.
	 */
	secret: env.AUTH_SECRET,
});
