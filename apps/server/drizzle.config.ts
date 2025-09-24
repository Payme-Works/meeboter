import "dotenv-flow/config";

import type { Config } from "drizzle-kit";

export default {
	schema: "./src/server/database/schema.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
		ssl:
			process.env.NODE_ENV === "production"
				? {
						rejectUnauthorized: false,
					}
				: false,
	},
	out: "./drizzle",
} satisfies Config;
