#!/bin/sh
set -e

echo "Running database migrations..."

# Set Node.js environment variable to ignore SSL certificate errors
export NODE_TLS_REJECT_UNAUTHORIZED=0
echo "Set NODE_TLS_REJECT_UNAUTHORIZED=0 to ignore SSL certificate errors"

# Run database migrations
cd /app/apps/server && npx drizzle-kit migrate

echo "Starting server..."

# Start the Next.js server
cd /app && exec node app/server.js