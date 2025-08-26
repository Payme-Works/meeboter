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

# Copy dependency files
COPY package.json pnpm-lock.yaml ./
COPY providers/meet/package.json providers/meet/pnpm-lock.yaml providers/meet/entrypoint.sh ./providers/meet/

# Convert entrypoint.sh to use Unix line endings
RUN sed -i 's/\r$//' ./providers/meet/entrypoint.sh

# Install dependencies
RUN pnpm install --filter "@live-boost/bots-meet"

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

# Copy package.json and playwright files from the base stage
COPY --from=base /app/package.json /app/package.json
COPY --from=base /root/ms-playwright /root/ms-playwright

COPY --from=base /app/providers/meet/node_modules /app/providers/meet/node_modules
COPY --from=base /app/providers/meet/pnpm-lock.yaml /app/providers/meet/pnpm-lock.yaml
COPY --from=base /app/providers/meet/package.json /app/providers/meet/package.json
COPY --from=base /app/providers/meet/entrypoint.sh /app/entrypoint.sh

# Copy working files into the container
COPY src ./src
COPY providers/meet/src ./providers/meet/src

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
