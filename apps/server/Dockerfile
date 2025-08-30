# Dependencies

FROM --platform=linux/amd64 node:20-alpine AS deps

RUN echo "Use Node.js 20 Alpine as the base stage"

RUN echo "Install npm and pnpm"

RUN npm install -g npm@latest
RUN npm install -g pnpm@latest

RUN echo "Install system dependencies"

RUN apk add --no-cache libc6-compat openssl

RUN echo "Set working directory"

WORKDIR /app

RUN echo "Copy workspace configuration and files"

COPY ./package.json /app/
COPY ./turbo.json /app/
COPY ./pnpm-workspace.yaml /app/
COPY ./pnpm-lock.yaml /app/

RUN echo "Ensure we're building from monorepo root"

RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

RUN echo "Copy essential package.json files for dependency resolution"

COPY ./apps/server/package.json /app/apps/server/
COPY ./packages/config-typescript/package.json /app/packages/config-typescript/

RUN echo "Fetch dependencies to pnpm store"

RUN --mount=type=cache,target=/app/.pnpm-store pnpm config set store-dir /app/.pnpm-store
RUN --mount=type=cache,target=/app/.pnpm-store pnpm fetch

RUN echo "Install dependencies from cache (skip postinstall scripts)"

RUN --mount=type=cache,target=/app/.pnpm-store pnpm install --frozen-lockfile --offline --ignore-scripts

RUN echo "Copy scripts"

COPY ./scripts/ /app/scripts/

RUN echo "Copy server app and packages source code"

COPY ./apps/server/ /app/apps/server/
COPY ./packages/ /app/packages/


# Builder

FROM --platform=linux/amd64 node:20-alpine AS builder

RUN echo "Use Node.js 20 Alpine as the builder stage"

RUN echo "Install npm and pnpm"

RUN npm install -g npm@latest
RUN npm install -g pnpm@latest

RUN echo "Install system dependencies"

RUN apk add --no-cache libc6-compat openssl

RUN echo "Set environment variables"

ARG AUTH_SECRET
ARG AUTH_GITHUB_ID
ARG AUTH_GITHUB_SECRET
ARG DATABASE_URL
ARG AWS_ACCESS_KEY_ID
ARG AWS_SECRET_ACCESS_KEY
ARG AWS_BUCKET_NAME
ARG AWS_REGION
ARG ECS_TASK_DEFINITION_MEET
ARG ECS_TASK_DEFINITION_TEAMS
ARG ECS_TASK_DEFINITION_ZOOM
ARG ECS_CLUSTER_NAME
ARG ECS_SUBNETS
ARG ECS_SECURITY_GROUPS

RUN echo "Set working directory"

WORKDIR /app

RUN echo "Copy node_modules"

COPY --from=deps /app/node_modules/ /app/node_modules/

RUN echo "Copy workspace configuration and files"

COPY --from=deps /app/package.json /app/
COPY --from=deps /app/turbo.json /app/
COPY --from=deps /app/pnpm-workspace.yaml /app/
COPY --from=deps /app/pnpm-lock.yaml /app/

RUN echo "Copy scripts"

COPY --from=deps /app/scripts/ /app/scripts/

RUN echo "Copy server app and packages source code"

COPY --from=deps /app/apps/server/ /app/apps/server/
COPY --from=deps /app/packages/ /app/packages/

RUN echo "Build the server app using pnpm workspace filtering"

ENV SKIP_ENV_VALIDATION=1

RUN pnpm turbos server build


# Runner

FROM --platform=linux/amd64 node:20-alpine AS runner

RUN echo "Use Node.js 20 Alpine as the runner stage"

RUN echo "Install npm and pnpm"

RUN npm install -g npm@latest
RUN npm install -g pnpm@latest

RUN echo "Set working directory"

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

RUN echo "Copy dependencies"

COPY --from=builder /app/node_modules/ /app/node_modules/

RUN echo "Copy server app"

COPY --from=builder /app/apps/server/ /app/apps/server/
COPY --from=builder /app/apps/server/.next/standalone/apps/server/ /app/apps/server/

RUN echo "Copy drizzle"

COPY --from=builder /app/apps/server/drizzle/ /app/apps/server/drizzle/
COPY --from=builder /app/apps/server/drizzle.config.ts /app/apps/server/
COPY --from=builder /app/apps/server/drizzle-migrate.js /app/apps/server/

RUN echo "Copy entrypoint"

COPY apps/server/entrypoint.sh /app/apps/server/entrypoint.sh

RUN echo "Make entrypoint executable"

RUN chmod +x /app/apps/server/entrypoint.sh

RUN echo "Expose port"

EXPOSE 3000

RUN echo "Command to run the application"

CMD ["/app/apps/server/entrypoint.sh"]