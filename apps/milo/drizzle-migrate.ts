import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
	const databaseUrl = process.env.DATABASE_URL;
	const databaseSsl = process.env.DATABASE_SSL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	// Configure SSL based on DATABASE_SSL env var (default: true for backwards compatibility)
	const sslEnabled = databaseSsl !== "false";
	const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

	console.log(
		`Connecting to database (SSL: ${sslEnabled ? "enabled" : "disabled"})...`,
	);

	const client = new Client({
		connectionString: databaseUrl,
		ssl: sslConfig,
	});

	try {
		await client.connect();

		const db = drizzle(client);

		const migrationsFolder = path.join(__dirname, "drizzle");

		await migrate(db, { migrationsFolder });

		console.log("Migrations completed successfully");
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		await client.end();
	}
}

runMigrations();
