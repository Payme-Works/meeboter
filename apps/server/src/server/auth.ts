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

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: usersTable,
			session: sessionsTable,
			account: accountsTable,
			verification: verificationTable,
		},
	}),

	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},

	socialProviders: {
		github: {
			clientId: env.AUTH_GITHUB_ID,
			clientSecret: env.AUTH_GITHUB_SECRET,
		},
	},

	secret: env.AUTH_SECRET,
});
