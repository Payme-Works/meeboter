# Use Node.js 20 Alpine as base image
FROM node:20-alpine

ENV \
    # Configure default locale (important for chrome-headless-shell).
    LANG=en_US.UTF-8 \
    # Get meeting platform this file is built for
    DOCKER_MEETING_PLATFORM=zoom

# Install system dependencies required for Chrome/Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install pnpm
RUN npm install -g pnpm

# Create a non-root user
RUN addgroup -g 1001 -S pptruser \
    && adduser -S pptruser -u 1001

# Set working directory
WORKDIR /home/pptruser

# Copy workspace configuration and files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Ensure we're building from monorepo root
RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

COPY apps/bots/package.json ./apps/bots/
COPY packages ./packages
COPY apps/bots/src ./src
COPY apps/bots/providers/zoom/package.json apps/bots/providers/zoom/entrypoint.sh ./providers/zoom/
COPY apps/bots/providers/zoom/src ./providers/zoom/src

# Convert entrypoint.sh to use Unix line endings
RUN sed -i 's/\r$//' ./providers/zoom/entrypoint.sh

# Install dependencies as root with workspace context
RUN pnpm install --no-frozen-lockfile

# Change ownership of all files after installation
RUN chown -R pptruser:pptruser /home/pptruser

# Switch to pptruser for running the application
USER pptruser

# Make entrypoint executable
RUN chmod +x ./providers/zoom/entrypoint.sh

# Command to run the application
CMD ["./providers/zoom/entrypoint.sh"]