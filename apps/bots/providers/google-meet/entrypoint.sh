#!/bin/bash

echo "[entrypoint.sh] Starting Google Meet bot..."

echo "[entrypoint.sh] Setting up XDG_RUNTIME_DIR..."

export XDG_RUNTIME_DIR=/tmp/runtime-$USER

mkdir -p $XDG_RUNTIME_DIR
chmod 700 $XDG_RUNTIME_DIR

echo "[entrypoint.sh] Starting virtual display..."

# Clean up stale X server lock files and processes from previous runs
rm -f /tmp/.X99-lock 2>/dev/null
pkill -9 Xvfb 2>/dev/null || true
pkill -9 fluxbox 2>/dev/null || true

Xvfb :99 -screen 0 1920x1080x24 &
sleep 1

echo "[entrypoint.sh] Starting window manager..."

fluxbox &
sleep 1

echo "[entrypoint.sh] Starting PulseAudio..."

pulseaudio -D --exit-idle-time=-1

sleep 1

echo "[entrypoint.sh] Starting..."

bun /app/apps/bots/src/index.ts
