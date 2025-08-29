# Dependencies

FROM --platform=linux/amd64 node:20-alpine AS deps

RUN npm install -g npm@latest

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY ./package.json /app/
COPY ./turbo.json /app/
COPY ./pnpm-workspace.yaml /app/
COPY ./pnpm-lock.yaml /app/

RUN test -f pnpm-workspace.yaml || (echo "ERROR: Must build from monorepo root directory" && exit 1)

COPY ./scripts/ /app/scripts/

COPY ./apps/server/ /app/apps/server/
COPY ./packages/ /app/packages/

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

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

COPY --from=deps /app/node_modules/ /app/node_modules/

COPY --from=deps /app/package.json /app/
COPY --from=deps /app/turbo.json /app/
COPY --from=deps /app/pnpm-workspace.yaml /app/
COPY --from=deps /app/pnpm-lock.yaml /app/

COPY --from=deps /app/scripts/ /app/scripts/

COPY --from=deps /app/apps/server/ /app/apps/server/
COPY --from=deps /app/packages/ /app/packages/

# Build the server app using pnpm workspace filtering
RUN npm install -g pnpm

ENV SKIP_ENV_VALIDATION=1

RUN pnpm turbos server build

# Runner

FROM --platform=linux/amd64 node:20-alpine AS runner

RUN npm install -g npm@latest

WORKDIR /app

ENV NODE_ENV production
ENV PORT 3000

COPY --from=builder /app/node_modules/ /app/node_modules/

COPY --from=builder /app/apps/server/ /app/apps/server/
COPY --from=builder /app/apps/server/.next/standalone/apps/server/ /app/apps/server/

COPY --from=builder /app/apps/server/drizzle/ /app/apps/server/drizzle/
COPY --from=builder /app/apps/server/drizzle.config.ts /app/apps/server/
COPY --from=builder /app/apps/server/drizzle-migrate.js /app/apps/server/

COPY apps/server/entrypoint.sh /app/apps/server/entrypoint.sh

RUN chmod +x /app/apps/server/entrypoint.sh

EXPOSE 3000

CMD ["/app/apps/server/entrypoint.sh"]