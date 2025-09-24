#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Dynamic module resolution for pnpm workspace
function resolvePnpmModule(moduleName) {
  const pnpmDir = '/app/node_modules/.pnpm';
  try {
    const dirs = fs.readdirSync(pnpmDir).filter(dir => dir.startsWith(`${moduleName}@`));
    if (dirs.length > 0) {
      return path.join(pnpmDir, dirs[0], 'node_modules', moduleName);
    }
  } catch (error) {
    // Fallback to regular node_modules
  }
  return moduleName;
}

// Resolve modules dynamically
const drizzlePath = resolvePnpmModule('drizzle-orm');
const pgPath = resolvePnpmModule('pg');

const { drizzle } = require(path.join(drizzlePath, 'node-postgres'));
const { migrate } = require(path.join(drizzlePath, 'node-postgres/migrator'));
const { Client } = require(pgPath);

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({
    connectionString: databaseUrl,
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
