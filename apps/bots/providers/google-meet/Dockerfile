# syntax=docker/dockerfile:1
# Google Meet Bot - Optimized with shared base image
# Build time: ~30s (system deps pre-installed in base image)

ARG BASE_IMAGE=ghcr.io/payme-works/meeboter-bot-base:latest

# ─── Installer Stage ──────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS installer

WORKDIR /app

# Copy workspace files (milo needed for type resolution during install)
COPY package.json turbo.json bun.lock ./
COPY apps/bots/ ./apps/bots/
COPY apps/milo/package.json ./apps/milo/package.json
COPY apps/milo/src/ ./apps/milo/src/
COPY packages/ ./packages/

# Install dependencies with BuildKit cache mount for faster rebuilds
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --production --ignore-scripts

# ─── Runtime Stage ────────────────────────────────────────────────────────────
FROM ${BASE_IMAGE} AS runtime

ENV DOCKER_MEETING_PLATFORM=google-meet

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S meetbot \
    && adduser -S meetbot -u 1001

# Copy from installer stage
COPY --from=installer --chown=meetbot:meetbot /app/node_modules ./node_modules
COPY --from=installer --chown=meetbot:meetbot /app/apps/bots ./apps/bots
COPY --from=installer --chown=meetbot:meetbot /app/packages ./packages

# Setup entrypoint
RUN sed -i 's/\r$//' ./apps/bots/providers/google-meet/entrypoint.sh

USER meetbot

RUN chmod +x ./apps/bots/providers/google-meet/entrypoint.sh

CMD ["./apps/bots/providers/google-meet/entrypoint.sh"]
