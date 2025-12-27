# Optimized Google Meet Bot Dockerfile - Bun + Alpine + System Chromium
# Uses system Chromium instead of Playwright download for faster builds
FROM oven/bun:alpine AS base

WORKDIR /app

# Install system dependencies in single layer
# chromium: browser, xvfb-run: virtual display, ffmpeg: media processing
RUN apk add --no-cache \
    chromium \
    xvfb \
    ffmpeg \
    pulseaudio \
    fluxbox \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash \
    && rm -rf /var/cache/apk/*

# Copy workspace files (milo needed for type resolution during install)
COPY package.json turbo.json bun.lock ./
COPY apps/bots/ ./apps/bots/
COPY apps/milo/package.json ./apps/milo/package.json
COPY apps/milo/src/ ./apps/milo/src/
COPY packages/ ./packages/

# Skip Playwright/Puppeteer browser downloads - using system Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# --ignore-scripts: skip milo's postinstall (tsup build not needed, only types)
RUN bun install --production --ignore-scripts

# Runtime stage
FROM oven/bun:alpine AS runtime

ENV DOCKER_MEETING_PLATFORM=google-meet
ENV DISPLAY=:99
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Install runtime deps + create user in single layer
RUN apk add --no-cache \
    chromium \
    xvfb \
    ffmpeg \
    pulseaudio \
    fluxbox \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash \
    && rm -rf /var/cache/apk/* \
    && addgroup -g 1001 -S meetbot \
    && adduser -S meetbot -u 1001

# Copy from build stage
COPY --from=base --chown=meetbot:meetbot /app/node_modules ./node_modules
COPY --from=base --chown=meetbot:meetbot /app/apps/bots ./apps/bots
COPY --from=base --chown=meetbot:meetbot /app/packages ./packages

# Convert entrypoint to Unix line endings
RUN sed -i 's/\r$//' ./apps/bots/providers/google-meet/entrypoint.sh

USER meetbot

RUN chmod +x ./apps/bots/providers/google-meet/entrypoint.sh

CMD ["./apps/bots/providers/google-meet/entrypoint.sh"]
