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

# Set Node.js heap size based on available memory (75% of container memory)
# Container memory: Development=2048MB, Production=4096MB
if [ "${NODE_ENV}" = "production" ]; then
    NODE_HEAP_SIZE=3072  # 75% of 4096MB
else
    NODE_HEAP_SIZE=1536  # 75% of 2048MB
fi

exec node --max-old-space-size=${NODE_HEAP_SIZE} /app/apps/server/server.js