#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

// Dynamic module resolution for bun workspace
function resolveBunModule(moduleName) {
	const nodeModulesDir = "/app/node_modules";
	const modulePath = path.join(nodeModulesDir, moduleName);
	try {
		if (fs.existsSync(modulePath)) {
			return modulePath;
		}
	} catch (error) {
		// Fallback to regular node_modules
		console.error("Error resolving bun module:", error);
	}
	return moduleName;
}

// Resolve modules dynamically
const drizzlePath = resolveBunModule("drizzle-orm");
const pgPath = resolveBunModule("pg");

const { drizzle } = require(path.join(drizzlePath, "node-postgres"));
const { migrate } = require(path.join(drizzlePath, "node-postgres/migrator"));
const { Client } = require(pgPath);

async function runMigrations() {
	const databaseUrl = process.env.DATABASE_URL;
	const databaseSsl = process.env.DATABASE_SSL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not set");
	}

	// Configure SSL based on DATABASE_SSL env var (default: true for backwards compatibility)
	const sslEnabled = databaseSsl !== "false";
	const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

	console.log(`Connecting to database (SSL: ${sslEnabled ? "enabled" : "disabled"})...`);

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
