#!/bin/sh
# Teams Bot Entry Point

echo "[entrypoint.sh] Starting teams bot..."

cd providers/teams && NODE_PATH=/app/node_modules /app/node_modules/.bin/tsx ../../src/index.ts