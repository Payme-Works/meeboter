#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'pg';

async function runMigrations() {
  const databaseUrl =
    process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString: databaseUrl,
   });

  try {
    await client.connect();

    const db = drizzle(client);
    
    // Get current directory in ES modules
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const migrationsFolder = path.join(__dirname, 'drizzle');

    await migrate(db, { migrationsFolder });

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();