# Dependencies

FROM --platform=linux/amd64 node:20-alpine AS deps

RUN npm install -g npm@latest

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

COPY apps/server/package.json ./apps/server/
COPY packages ./packages

RUN npm install -g pnpm && pnpm install --no-frozen-lockfile

# Builder

FROM --platform=linux/amd64 node:20-alpine AS builder

RUN npm install -g npm@latest

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

# Build the server app using pnpm workspace filtering
RUN npm install -g pnpm

ENV SKIP_ENV_VALIDATION=1

RUN pnpm --filter @live-boost/server build

# Runner

FROM --platform=linux/amd64 node:20-alpine AS runner

RUN npm install -g npm@latest

WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/apps/server/.next/standalone ./
COPY --from=builder /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder /app/apps/server/public ./apps/server/public

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=builder /app/apps/server/drizzle.config.ts ./apps/server/drizzle.config.ts

COPY apps/server/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

EXPOSE 3000

ENV PORT 3000

CMD ["/app/entrypoint.sh"]