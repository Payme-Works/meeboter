##### DEPENDENCIES

FROM --platform=linux/amd64 node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies based on the preferred package manager

# Copy workspace configuration and all package.json files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Ensure we're building from monorepo root
RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

COPY apps/server/package.json ./apps/server/
COPY packages ./packages

# Install pnpm and dependencies
RUN npm install -g pnpm && pnpm install --no-frozen-lockfile

##### BUILDER

FROM --platform=linux/amd64 node:20-alpine AS builder

ARG AUTH_SECRET
ARG AUTH_GITHUB_ID
ARG AUTH_GITHUB_SECRET
ARG DATABASE_URL
ARG GITHUB_TOKEN
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

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages ./packages
COPY apps/server ./apps/server

# ENV NEXT_TELEMETRY_DISABLED 1

# Build the server app using pnpm workspace filtering
RUN npm install -g pnpm && SKIP_ENV_VALIDATION=1 pnpm --filter @live-boost/server build

##### RUNNER

FROM --platform=linux/amd64 node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# ENV NEXT_TELEMETRY_DISABLED 1

COPY --from=builder /app/apps/server/.next/standalone ./
COPY --from=builder /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder /app/apps/server/public ./apps/server/public

# Copy node_modules for drizzle-kit and migration files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=builder /app/apps/server/drizzle.config.ts ./apps/server/drizzle.config.ts

# Copy entrypoint script
COPY apps/server/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 3000
ENV PORT 3000

CMD ["/app/entrypoint.sh"]