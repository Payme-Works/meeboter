# Turborepo-optimized Dockerfile for Next.js Server App
# Build from monorepo root: docker build -f apps/milo/Dockerfile -t meeboter-milo .

FROM oven/bun:1-alpine AS base
RUN apk update && apk add --no-cache libc6-compat

# ─── Pruner: Generate a partial monorepo with pruned dependencies ───

FROM base AS pruner
WORKDIR /app
RUN bun add -g turbo
COPY . .
RUN turbo prune @meeboter/milo --docker

# ─── Installer: Install dependencies for build ──────────────────────

FROM base AS installer
WORKDIR /app

# First install dependencies (as they change less often)
COPY --from=pruner /app/out/json/ .
# Copy the original lockfile from monorepo root as a reference
COPY --from=pruner /app/bun.lock ./bun.lock
# Install dependencies (no --frozen-lockfile since pruned workspace differs from full monorepo)
RUN bun install --ignore-scripts

# Build the project and bundle migration script
COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_ vars must be available at build time for Next.js to inline them
# Production deploys bots to Kubernetes
ARG NEXT_PUBLIC_DEPLOYMENT_PLATFORM=k8s
ENV NEXT_PUBLIC_DEPLOYMENT_PLATFORM=$NEXT_PUBLIC_DEPLOYMENT_PLATFORM

RUN bun turbo build --filter=@meeboter/milo && \
    bun build apps/milo/drizzle-migrate.ts --outfile apps/milo/drizzle-migrate.js --target bun

# ─── Runner: Final production image ─────────────────────────────────

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy Next.js standalone output
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/.next/static ./apps/milo/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/public ./apps/milo/public

# Copy bundled migration script and SQL files
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/drizzle ./apps/milo/drizzle
COPY --from=installer --chown=nextjs:nodejs /app/apps/milo/drizzle-migrate.js ./apps/milo/drizzle-migrate.js
COPY --chown=nextjs:nodejs apps/milo/entrypoint.sh ./apps/milo/entrypoint.sh
RUN chmod +x ./apps/milo/entrypoint.sh

USER nextjs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Use entrypoint script that runs migrations before starting the server
CMD ["./apps/milo/entrypoint.sh"]