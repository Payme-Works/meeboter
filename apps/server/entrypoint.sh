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

# Set Node.js heap size dynamically to 80% of container memory
# Try multiple methods to detect container memory, fallback to safe default
if [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
    # cgroups v1
    CONTAINER_MEMORY_BYTES=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
elif [ -f /sys/fs/cgroup/memory.max ]; then
    # cgroups v2
    CONTAINER_MEMORY_BYTES=$(cat /sys/fs/cgroup/memory.max)
elif [ -f /proc/meminfo ] && command -v grep >/dev/null 2>&1; then
    # Fallback to /proc/meminfo with basic grep (should be available in Alpine)
    CONTAINER_MEMORY_KB=$(grep "^MemTotal:" /proc/meminfo | sed 's/[^0-9]//g')
    CONTAINER_MEMORY_BYTES=$((CONTAINER_MEMORY_KB * 1024))
else
    # Safe fallback for development environment (2048MB)
    CONTAINER_MEMORY_BYTES=$((2048 * 1024 * 1024))
fi

# Convert to MB and calculate 80%
CONTAINER_MEMORY_MB=$((CONTAINER_MEMORY_BYTES / 1024 / 1024))
NODE_HEAP_SIZE=$(((CONTAINER_MEMORY_MB * 80) / 100))

exec node --max-old-space-size=${NODE_HEAP_SIZE} /app/apps/server/server.js