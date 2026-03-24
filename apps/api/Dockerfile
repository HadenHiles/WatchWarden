# ─── Watch Warden — API Dockerfile ──────────────────────────────────────────
FROM node:20-alpine AS base
RUN npm install -g pnpm@8.15.1
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/scoring/package.json ./packages/scoring/
RUN pnpm install --frozen-lockfile

# ─── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN pnpm --filter @watchwarden/config build
RUN pnpm --filter @watchwarden/types build
RUN pnpm --filter @watchwarden/db db:generate
RUN pnpm --filter @watchwarden/db build
RUN pnpm --filter @watchwarden/integrations build
RUN pnpm --filter @watchwarden/scoring build
RUN pnpm --filter @watchwarden/api build

# ─── Development target ────────────────────────────────────────────────────────
FROM deps AS development
COPY . .
RUN pnpm --filter @watchwarden/db db:generate
CMD ["pnpm", "--filter", "@watchwarden/api", "dev"]

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=builder /app/packages/scoring/dist ./packages/scoring/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
WORKDIR /app/apps/api
RUN mkdir -p /app/exports
CMD ["node", "dist/index.js"]
