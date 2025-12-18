# Turborepo-optimized Dockerfile for Next.js Server App
# Build from monorepo root: docker build -f apps/milo/Dockerfile -t meeboter-server .

FROM oven/bun:1-alpine AS base
RUN apk update && apk add --no-cache libc6-compat

# =============================================================================
# PRUNER: Generate a partial monorepo with pruned dependencies
# =============================================================================
FROM base AS pruner
WORKDIR /app
RUN bun add -g turbo
COPY . .
RUN turbo prune @meeboter/milo --docker

# =============================================================================
# INSTALLER: Install dependencies for build
# =============================================================================
FROM base AS installer
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=pruner /app/out/json/ .
# Copy lockfile directory temporarily to check for bun.lock
COPY --from=pruner /app/out /tmp/pruner-out
# Copy lockfile if it exists, then install dependencies
RUN if [ -f /tmp/pruner-out/bun.lock ]; then \
        cp /tmp/pruner-out/bun.lock ./bun.lock && \
        bun install --frozen-lockfile --ignore-scripts; \
    else \
        bun install --ignore-scripts; \
    fi && \
    rm -rf /tmp/pruner-out

# Build the project
COPY --from=pruner /app/out/full/ .
# Skip env validation during build - secrets are injected at runtime
ENV SKIP_ENV_VALIDATION=1
RUN SKIP_ENV_VALIDATION=1 bun turbo build --filter=@meeboter/milo

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
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/.next/static ./apps/milo/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/public ./apps/milo/public

# Copy node_modules with all dependencies (including dev deps needed for migrations)
COPY --from=installer --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy drizzle migration files and script
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/drizzle ./apps/milo/drizzle
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/drizzle-migrate.cjs ./apps/milo/drizzle-migrate.cjs

# Copy and make entrypoint script executable
COPY --chown=nextjs:nodejs apps/milo/entrypoint.sh ./apps/milo/entrypoint.sh
RUN chmod +x ./apps/milo/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Use entrypoint script that runs migrations before starting the server
CMD ["./apps/milo/entrypoint.sh"]