# ─── Watch Warden — All-in-One Dockerfile ─────────────────────────────────────
# Bundles the API, background Worker, Next.js Web UI, and PostgreSQL into a
# single container image suitable for Docker Hub distribution.
#
# Exposed ports:
#   3000  — Web UI (Next.js)
#   4000  — REST API
#
# Required environment variables at runtime:
#   POSTGRES_PASSWORD    — strong password for the internal database user
#   SESSION_SECRET       — ≥32 character secret for session signing
#   API_SECRET           — ≥32 character secret for API auth
#   NEXTAUTH_SECRET      — secret for NextAuth
#   NEXTAUTH_URL         — public URL of the web UI (e.g. http://myserver:3000)
#   ADMIN_USERNAME       — initial admin username  (default: admin)
#   ADMIN_PASSWORD_HASH  — bcrypt hash of the admin password
#
# Persistent volumes (mount to preserve data between restarts):
#   /var/lib/postgresql/data   — PostgreSQL data
#   /app/exports               — JSON export output
# ─────────────────────────────────────────────────────────────────────────────

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@8.15.1

WORKDIR /app

# Copy manifests + lockfile first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json              ./apps/api/
COPY apps/worker/package.json           ./apps/worker/
COPY apps/web/package.json              ./apps/web/
COPY packages/config/package.json       ./packages/config/
COPY packages/types/package.json        ./packages/types/
COPY packages/db/package.json           ./packages/db/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/scoring/package.json      ./packages/scoring/

RUN pnpm install --frozen-lockfile

# Copy all source
COPY . .

# Build in dependency order.
# integrations and scoring tsconfigs use paths→src so they compile cleanly
# even when pnpm creates per-package node_modules for workspace packages.
RUN pnpm --filter @watchwarden/config build
RUN pnpm --filter @watchwarden/types build
RUN pnpm --filter @watchwarden/db db:generate
RUN pnpm --filter @watchwarden/db build
RUN pnpm --filter @watchwarden/integrations build
RUN pnpm --filter @watchwarden/scoring build
RUN pnpm --filter @watchwarden/api build
RUN pnpm --filter @watchwarden/worker build
RUN NEXT_TELEMETRY_DISABLED=1 pnpm --filter @watchwarden/web build

# ─── Production image ─────────────────────────────────────────────────────────
FROM node:20-slim AS production

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install PostgreSQL, supervisord, and curl (for healthchecks)
RUN apt-get update && apt-get install -y \
    postgresql \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Node modules ──────────────────────────────────────────────────────────────
COPY --from=builder /app/node_modules         ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# ── API ───────────────────────────────────────────────────────────────────────
COPY --from=builder /app/apps/api/dist        ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# ── Worker ────────────────────────────────────────────────────────────────────
COPY --from=builder /app/apps/worker/dist        ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/

# ── Web (Next.js standalone) ──────────────────────────────────────────────────
# The standalone output from a monorepo mirrors the original directory structure
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static      ./apps/web/.next/static
COPY --from=builder /app/apps/web/public            ./apps/web/public

# ── Shared packages ────────────────────────────────────────────────────────────
# package.json files are required so Node can resolve the `main` entry point
# when following pnpm's workspace symlinks (node_modules/@watchwarden/* →
# ../../packages/*). Without them the API and Worker crash on startup.
COPY --from=builder /app/packages/config/dist        ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/types/dist         ./packages/types/dist
COPY --from=builder /app/packages/types/package.json  ./packages/types/
COPY --from=builder /app/packages/db/dist            ./packages/db/dist
COPY --from=builder /app/packages/db/package.json     ./packages/db/
COPY --from=builder /app/packages/db/prisma          ./packages/db/prisma
COPY --from=builder /app/packages/integrations/dist  ./packages/integrations/dist
COPY --from=builder /app/packages/integrations/package.json ./packages/integrations/
COPY --from=builder /app/packages/scoring/dist       ./packages/scoring/dist
COPY --from=builder /app/packages/scoring/package.json ./packages/scoring/

# ── @watchwarden workspace symlinks ───────────────────────────────────────────
# pnpm workspace symlinks (node_modules/@watchwarden/* → ../../packages/*) are
# dropped by Docker COPY. Recreate them explicitly so the API and Worker can
# resolve require('@watchwarden/config') etc. at runtime.
RUN mkdir -p /app/node_modules/@watchwarden \
 && ln -sf /app/packages/config       /app/node_modules/@watchwarden/config \
 && ln -sf /app/packages/types        /app/node_modules/@watchwarden/types \
 && ln -sf /app/packages/db           /app/node_modules/@watchwarden/db \
 && ln -sf /app/packages/integrations /app/node_modules/@watchwarden/integrations \
 && ln -sf /app/packages/scoring      /app/node_modules/@watchwarden/scoring

# ── Runtime config ─────────────────────────────────────────────────────────────
COPY docker/supervisord.conf /etc/supervisor/conf.d/watchwarden.conf
COPY docker/entrypoint.sh    /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/exports /var/log/postgresql
RUN chown postgres:postgres /var/log/postgresql

EXPOSE 3000 4000

VOLUME ["/var/lib/postgresql/data", "/app/exports"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4000/health && curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
