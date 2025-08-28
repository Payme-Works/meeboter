#!/bin/sh
# Zoom Bot Entry Point

echo "[entrypoint.sh] Starting zoom bot..."

cd providers/zoom && NODE_PATH=/app/node_modules /app/node_modules/.bin/tsx ../../src/index.ts