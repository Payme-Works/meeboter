import type { Config } from "drizzle-kit";

export default {
  schema: "./src/server/database/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    ssl: {
      rejectUnauthorized: false,
    },
  },
  tablesFilter: ["server_*"],
} satisfies Config;
