#!/bin/sh

echo "[entrypoint.sh] Starting Zoom bot..."

NODE_PATH=/app/node_modules /app/node_modules/.bin/tsx /app/apps/bots/src/index.ts