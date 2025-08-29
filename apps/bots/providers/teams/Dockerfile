# Use Node.js 20 Alpine as the base stage

FROM node:20-alpine

# Create a non-root user
RUN addgroup -g 1001 -S pptruser \
    && adduser -S pptruser -u 1001

WORKDIR /home/pptruser/

# Copy workspace configuration and files
COPY ./pnpm-workspace.yaml ./
COPY ./package.json ./
COPY ./pnpm-lock.yaml ./

# Ensure we're building from monorepo root
RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

# Configure default locale (important for chrome-headless-shell)
ENV LANG=en_US.UTF-8

# Get meeting platform this file is built for
ENV DOCKER_MEETING_PLATFORM=teams

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

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm install -g pnpm

COPY ./apps/bots/ ./apps/bots/
COPY ./packages/ ./packages/

# Convert entrypoint.sh to use Unix line endings
RUN sed -i 's/\r$//' ./apps/bots/providers/teams/entrypoint.sh

# Install dependencies as root with workspace context
RUN pnpm install --frozen-lockfile

# Change ownership of all files after installation
RUN chown -R pptruser:pptruser /home/pptruser

# Change ownership of working files after installation
RUN chown -R pptruser:pptruser /home/pptruser/src && chmod -R 755 /home/pptruser/src
RUN chown -R pptruser:pptruser /home/pptruser/providers/teams/src && chmod -R 755 /home/pptruser/providers/teams/src

# Switch to pptruser for running the application
USER pptruser

# Make entrypoint executable
RUN chmod +x ./apps/bots/providers/teams/entrypoint.sh

# Command to run the application
CMD ["/apps/bots/providers/teams/entrypoint.sh"]