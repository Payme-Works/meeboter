# Base

FROM node:20-alpine

RUN echo "Use Node.js 20 Alpine as the base stage"

RUN echo "Create a non-root user"

RUN addgroup -g 1001 -S pptruser \
    && adduser -S pptruser -u 1001

WORKDIR /home/pptruser/

RUN echo "Copy workspace configuration and files"

COPY ./pnpm-workspace.yaml ./
COPY ./turbo.json ./
COPY ./package.json ./
COPY ./pnpm-lock.yaml ./

RUN echo "Ensure we're building from monorepo root"

RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

RUN echo "Copy node_modules if they exist"

COPY ./node_modules* /app/node_modules

RUN echo "Copy workspace configuration and files"

COPY ./apps/bots/ ./apps/bots/
COPY ./packages/ ./packages/

RUN echo "Configure default locale (important for chrome-headless-shell)"

ENV LANG=en_US.UTF-8

RUN echo "Get meeting platform this file is built for"

ENV DOCKER_MEETING_PLATFORM=teams

RUN echo "Install system dependencies required for Chrome/Puppeteer"

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

RUN echo "Tell Puppeteer to skip installing Chrome. We'll be using the installed package"

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser


RUN echo "Install npm and pnpm"

RUN npm install -g npm@latest
RUN npm install -g pnpm@latest

RUN echo "Convert entrypoint.sh to use Unix line endings"

RUN sed -i 's/\r$//' ./apps/bots/providers/teams/entrypoint.sh

RUN echo "Install dependencies as root with workspace context"

RUN pnpm install --frozen-lockfile

RUN echo "Change ownership of all files after installation"

RUN chown -R pptruser:pptruser /home/pptruser

RUN echo "Change ownership of working files after installation"

RUN chown -R pptruser:pptruser /home/pptruser/apps
RUN chmod -R 755 /home/pptruser/apps

RUN echo "Switch to pptruser for running the application"

USER pptruser

RUN echo "Make entrypoint executable"

RUN chmod +x ./apps/bots/providers/teams/entrypoint.sh

RUN echo "Command to run the application"

CMD ["/apps/bots/providers/teams/entrypoint.sh"]