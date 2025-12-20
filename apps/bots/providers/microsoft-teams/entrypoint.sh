#!/bin/sh

echo "[entrypoint.sh] Starting Microsoft Teams bot..."

echo "[entrypoint.sh] Starting..."

NODE_PATH=/app/node_modules /app/node_modules/.bin/tsx /app/apps/bots/src/index.ts