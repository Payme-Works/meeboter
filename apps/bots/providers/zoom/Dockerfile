# Optimized Zoom Bot Dockerfile - Bun + Alpine + Chromium
FROM node:20-alpine AS base

WORKDIR /app

# Install system dependencies in single layer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    curl \
    unzip \
    bash \
    && rm -rf /var/cache/apk/*

# Copy workspace files (milo needed for type resolution during install)
COPY package.json turbo.json bun.lock ./
COPY apps/bots/ ./apps/bots/
COPY apps/milo/package.json ./apps/milo/package.json
COPY apps/milo/src/ ./apps/milo/src/
COPY packages/ ./packages/

# Install bun + dependencies
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV LANG=en_US.UTF-8

RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
    && bun install --production

# Runtime stage
FROM node:20-alpine AS runtime

ENV DOCKER_MEETING_PLATFORM=zoom
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV LANG=en_US.UTF-8

WORKDIR /home/pptruser

# Install runtime deps + create user in single layer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash \
    && rm -rf /var/cache/apk/* \
    && addgroup -g 1001 -S pptruser \
    && adduser -S pptruser -u 1001 \
    && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash

# Copy from build stage
COPY --from=base --chown=pptruser:pptruser /app/node_modules ./node_modules
COPY --from=base --chown=pptruser:pptruser /app/apps/bots ./apps/bots
COPY --from=base --chown=pptruser:pptruser /app/packages ./packages

# Convert entrypoint to Unix line endings
RUN sed -i 's/\r$//' ./apps/bots/providers/zoom/entrypoint.sh

USER pptruser

RUN chmod +x ./apps/bots/providers/zoom/entrypoint.sh

CMD ["./apps/bots/providers/zoom/entrypoint.sh"]
