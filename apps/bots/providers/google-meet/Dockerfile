# Build stage - Bun + Chromium only (optimized from 6GB to ~2GB)
FROM oven/bun:debian AS base

WORKDIR /app

# Install Chromium dependencies + utilities in single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    ffmpeg \
    x11-utils \
    pulseaudio \
    x11-xserver-utils \
    fluxbox \
    curl \
    unzip \
    # Playwright Chromium dependencies
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libgtk-3-0 \
    libdbus-1-3 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files (milo needed for type resolution during install)
COPY package.json turbo.json bun.lock ./
COPY apps/bots/ ./apps/bots/
COPY apps/milo/package.json ./apps/milo/package.json
COPY apps/milo/src/ ./apps/milo/src/
COPY packages/ ./packages/

# Install deps + Chromium only (not all browsers)
# --ignore-scripts: skip milo's postinstall (tsup build not needed, only types)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN bun install --production --ignore-scripts \
    && bunx playwright install chromium --with-deps

# Runtime stage - Bun slim
FROM oven/bun:debian AS runtime

ENV DOCKER_MEETING_PLATFORM=google-meet
ENV DISPLAY=:99
ENV PLAYWRIGHT_BROWSERS_PATH=/home/meetbot/.cache/ms-playwright

WORKDIR /app

# Runtime deps only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    fluxbox \
    # Chromium runtime deps
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libgtk-3-0 \
    libdbus-1-3 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -ms /bin/bash meetbot

# Copy from build stage
COPY --from=base --chown=meetbot:meetbot /app/node_modules ./node_modules
COPY --from=base --chown=meetbot:meetbot /root/.cache/ms-playwright/chromium* /home/meetbot/.cache/ms-playwright/
COPY --from=base --chown=meetbot:meetbot /app/apps/bots ./apps/bots
COPY --from=base --chown=meetbot:meetbot /app/packages ./packages

# Convert entrypoint to Unix line endings and make executable
RUN sed -i 's/\r$//' /app/apps/bots/providers/google-meet/entrypoint.sh \
    && chown -R meetbot:meetbot /home/meetbot/.cache

USER meetbot

RUN chmod +x /app/apps/bots/providers/google-meet/entrypoint.sh

CMD ["/app/apps/bots/providers/google-meet/entrypoint.sh"]
