#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

// Dynamic module resolution for bun workspace
// Bun stores modules in .bun/<package>@<version>+<hash>/node_modules/<package>
function resolveBunModule(moduleName) {
	const nodeModulesDir = "/app/node_modules";

	// First try direct path (for non-bun environments)
	const directPath = path.join(nodeModulesDir, moduleName);
	if (fs.existsSync(directPath)) {
		return directPath;
	}

	// Try bun's .bun directory structure
	const bunDir = path.join(nodeModulesDir, ".bun");
	if (fs.existsSync(bunDir)) {
		try {
			const entries = fs.readdirSync(bunDir);
			// Find the package directory (e.g., "drizzle-orm@0.44.7+hash")
			const packageDir = entries.find((entry) =>
				entry.startsWith(moduleName + "@"),
			);
			if (packageDir) {
				const bunModulePath = path.join(
					bunDir,
					packageDir,
					"node_modules",
					moduleName,
				);
				if (fs.existsSync(bunModulePath)) {
					return bunModulePath;
				}
			}
		} catch (error) {
			console.error("Error resolving bun module:", error);
		}
	}

	// Fallback to require.resolve
	try {
		const resolved = require.resolve(moduleName);
		return path.dirname(resolved);
	} catch {
		return moduleName;
	}
}

// Resolve modules dynamically
const drizzlePath = resolveBunModule("drizzle-orm");
const pgPath = resolveBunModule("pg");

console.log(`Resolved drizzle-orm at: ${drizzlePath}`);
console.log(`Resolved pg at: ${pgPath}`);

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
