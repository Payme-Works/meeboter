# Use the official Playwright Docker image as the base stage
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS base

# Install XVFB dependencies
RUN apt-get update && apt-get install -y \
    xvfb \
    ffmpeg \
    x11-utils \
    pulseaudio \
    x11-xserver-utils \
    fluxbox \
    && rm -rf /var/lib/apt/lists/*
    # delete the cache of the package manager ^^

# Set the working directory inside the container
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace configuration and dependency files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Ensure we're building from monorepo root
RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)
COPY apps/bots/package.json ./apps/bots/
COPY packages ./packages
COPY apps/bots/providers/meet/package.json apps/bots/providers/meet/entrypoint.sh ./providers/meet/

# Convert entrypoint.sh to use Unix line endings
RUN sed -i 's/\r$//' ./providers/meet/entrypoint.sh

# Install dependencies with workspace context
RUN pnpm install --no-frozen-lockfile

# Install Playwright dependencies
RUN pnpm dlx playwright@1.52.0 install-deps

# Install Playwright browsers
RUN pnpm dlx playwright@1.52.0 install --with-deps

# Ensure the Playwright cache directory has the correct permissions
RUN mkdir -p /root/ms-playwright && chmod -R 777 /root/ms-playwright

# ======================================================
# Runtime stage
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS runtime

# Get meeting platform this file is built for
ENV DOCKER_MEETING_PLATFORM=meet

# Set the working directory inside the container
WORKDIR /app

# Change ownership of all files after installation
RUN useradd -ms /bin/bash meetbot && chown -R meetbot:meetbot /app

# install xvfb, pulseaudio, fluxbox, and xephyr in a single step
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    xserver-xephyr \
    x11-xserver-utils \
    fluxbox \
    pulseaudio \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy from base stage
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /root/ms-playwright /root/ms-playwright
COPY --from=base /app/providers/meet/entrypoint.sh /app/entrypoint.sh

# Copy source files
COPY apps/bots/src ./src
COPY apps/bots/providers/meet/src ./providers/meet/src

# Make all files available to the meetbot user
RUN chown -R meetbot:meetbot /app
RUN chown -R meetbot:meetbot /root/ms-playwright

RUN chown -R meetbot:meetbot ./src
RUN chown -R meetbot:meetbot ./providers/meet/src

# Expose display port
ENV DISPLAY=:99

# Run Command
USER meetbot

RUN chmod +x ./entrypoint.sh

CMD ["./entrypoint.sh"]
