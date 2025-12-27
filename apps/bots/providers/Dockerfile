# Shared Base Image for Meeting Bots
# Contains: Bun runtime + Chromium + media tools + all system dependencies
# Bot images extend this to add only node_modules and code (~30s builds)
FROM oven/bun:alpine

# All system dependencies needed by any bot
# chromium: browser automation
# xvfb: virtual display for headless browser
# ffmpeg: media processing/recording
# pulseaudio: audio capture
# fluxbox: minimal window manager
RUN apk add --no-cache \
    chromium \
    xvfb \
    ffmpeg \
    pulseaudio \
    pulseaudio-utils \
    fluxbox \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash \
    && rm -rf /var/cache/apk/*

# Common environment variables
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DISPLAY=:99
ENV LANG=en_US.UTF-8

WORKDIR /app
