#!/bin/sh
# Zoom Bot Entry Point

echo "[entrypoint.sh] Starting zoom bot..."

cd providers/zoom && NODE_PATH=./node_modules ./node_modules/.bin/tsx ../../src/index.ts