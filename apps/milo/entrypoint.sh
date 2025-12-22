#!/bin/sh
set -e

# Set Node.js environment variable to ignore SSL certificate errors
export NODE_TLS_REJECT_UNAUTHORIZED=0

echo "Set NODE_TLS_REJECT_UNAUTHORIZED=0 to ignore SSL certificate errors"

# Run database migrations
echo "Running database migrations..."

bun /app/apps/milo/drizzle-migrate.js

# Start the Next.js server
echo "Starting server..."

# Set Node.js heap size dynamically to 80% of container memory
# ECS sets task memory limits which should be detected properly
CONTAINER_MEMORY_BYTES=0

# Try ECS-specific detection methods
if [ -f /proc/meminfo ] && command -v grep >/dev/null 2>&1; then
    # Use /proc/meminfo which should reflect the container's memory limit in ECS
    CONTAINER_MEMORY_KB=$(grep "^MemAvailable:" /proc/meminfo | sed 's/[^0-9]//g' 2>/dev/null || grep "^MemTotal:" /proc/meminfo | sed 's/[^0-9]//g')
    if [ -n "$CONTAINER_MEMORY_KB" ] && [ "$CONTAINER_MEMORY_KB" -gt 0 ]; then
        CONTAINER_MEMORY_BYTES=$((CONTAINER_MEMORY_KB * 1024))
    fi
fi

# Validate memory detection - if unrealistic, use ECS task definition values
CONTAINER_MEMORY_MB=$((CONTAINER_MEMORY_BYTES / 1024 / 1024))

# Sanity check: if detected memory is unrealistic (>50GB or <512MB), use known ECS values
if [ "$CONTAINER_MEMORY_MB" -gt 51200 ] || [ "$CONTAINER_MEMORY_MB" -lt 512 ]; then
    # ECS task definitions: production=4096MB, development=2048MB
    # Check for production indicators (more CPU, typical production memory ranges)
    if [ -f /proc/cpuinfo ] && [ "$(grep -c "^processor" /proc/cpuinfo 2>/dev/null || echo "0")" -gt 1 ]; then
        CONTAINER_MEMORY_MB=4096  # Production
    else
        CONTAINER_MEMORY_MB=2048  # Development
    fi
fi

# Calculate 80% heap size
NODE_HEAP_SIZE=$(((CONTAINER_MEMORY_MB * 80) / 100))

echo "Container memory: ${CONTAINER_MEMORY_MB}MB"
echo "Node.js heap size: ${NODE_HEAP_SIZE}MB"

exec node --max-old-space-size=${NODE_HEAP_SIZE} /app/apps/milo/server.js