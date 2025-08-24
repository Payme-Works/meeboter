# Use Node.js 20 Alpine as base image
FROM --platform=linux/amd64 node:20-alpine

ENV \
    # Configure default locale (important for chrome-headless-shell).
    LANG=en_US.UTF-8 \
    # Get meeting platform this file is built for
    DOCKER_MEETING_PLATFORM=teams

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

# Copy files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY teams/package.json teams/pnpm-lock.yaml ./teams/

# Install dependencies as root
RUN pnpm install --filter "@bots/teams" --filter "bots"

# Change ownership of all files after installation
RUN chown -R pptruser:pptruser /home/pptruser

#  Copy the rest of the application last
COPY src ./src
COPY teams/src ./teams/src

# Change ownership of working files after installation
RUN chown -R pptruser:pptruser /home/pptruser/src && chmod -R 755 /home/pptruser/src
RUN chown -R pptruser:pptruser /home/pptruser/teams/src && chmod -R 755 /home/pptruser/teams/src


# Switch to pptruser for running the application
USER pptruser

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD ["pnpm", "run", "dev"]