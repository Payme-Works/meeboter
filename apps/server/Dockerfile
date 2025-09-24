# Turborepo-optimized Dockerfile for Next.js Server App
# Build from monorepo root: docker build -f apps/server/Dockerfile -t live-boost-server .

FROM node:20-alpine AS base
RUN apk update && apk add --no-cache libc6-compat
RUN npm install -g pnpm@latest

# =============================================================================
# PRUNER: Generate a partial monorepo with pruned dependencies
# =============================================================================
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@latest
COPY . .
RUN turbo prune @live-boost/server --docker

# =============================================================================
# INSTALLER: Install dependencies for build
# =============================================================================
FROM base AS installer
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build the project
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@live-boost/server

# =============================================================================
# RUNNER: Final production image
# =============================================================================
FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/public ./apps/server/public

# Copy node_modules with all dependencies (including dev deps needed for migrations)
COPY --from=installer --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy drizzle migration files and script
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/drizzle ./apps/server/drizzle
COPY --from=installer --chown=nextjs:nodejs /app/apps/server/drizzle-migrate.cjs ./apps/server/drizzle-migrate.cjs

# Copy and make entrypoint script executable
COPY --chown=nextjs:nodejs apps/server/entrypoint.sh ./apps/server/entrypoint.sh
RUN chmod +x ./apps/server/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use entrypoint script that runs migrations before starting the server
CMD ["./apps/server/entrypoint.sh"]