#!/bin/bash

echo "[entrypoint.sh] Starting Google Meet bot..."

echo "[entrypoint.sh] Setting up XDG_RUNTIME_DIR..."

export XDG_RUNTIME_DIR=/tmp/runtime-$USER

mkdir -p $XDG_RUNTIME_DIR
chmod 700 $XDG_RUNTIME_DIR

echo "[entrypoint.sh] Starting virtual display..."

Xvfb :99 -screen 0 1920x1080x24 &

echo "[entrypoint.sh] Starting window manager..."

fluxbox &

echo "[entrypoint.sh] Starting PulseAudio..."

pulseaudio -D --exit-idle-time=-1

sleep 2

echo "[entrypoint.sh] Starting..."

NODE_PATH=/app/node_modules /app/node_modules/.bin/tsx /app/apps/bots/src/index.ts
