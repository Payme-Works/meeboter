#!/bin/sh
# Teams Bot Entry Point

echo "[entrypoint.sh] Starting teams bot..."

cd providers/teams && NODE_PATH=./node_modules ./node_modules/.bin/tsx ../../src/index.ts