#!/bin/sh
set -e

# Set Node.js environment variable to ignore SSL certificate errors
export NODE_TLS_REJECT_UNAUTHORIZED=0

echo "Set NODE_TLS_REJECT_UNAUTHORIZED=0 to ignore SSL certificate errors"

# Run database migrations
echo "Running database migrations..."

node /app/apps/server/drizzle-migrate.js

# Start the Next.js server
echo "Starting server..."

exec node /app/apps/server/server.js