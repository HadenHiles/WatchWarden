# ─── Watch Warden — Worker Dockerfile ────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache openssl && npm install -g pnpm@8.15.1
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/worker/package.json ./apps/worker/
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
RUN pnpm --filter @watchwarden/worker build

# ─── Development target ───────────────────────────────────────────────────────
FROM deps AS development
COPY . .
RUN pnpm --filter @watchwarden/db db:generate
CMD ["pnpm", "--filter", "@watchwarden/worker", "dev"]

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=builder /app/packages/integrations/package.json ./packages/integrations/
COPY --from=builder /app/packages/scoring/dist ./packages/scoring/dist
COPY --from=builder /app/packages/scoring/package.json ./packages/scoring/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
RUN mkdir -p /app/node_modules/@watchwarden \
    && ln -sf /app/packages/config /app/node_modules/@watchwarden/config \
    && ln -sf /app/packages/types /app/node_modules/@watchwarden/types \
    && ln -sf /app/packages/db /app/node_modules/@watchwarden/db \
    && ln -sf /app/packages/integrations /app/node_modules/@watchwarden/integrations \
    && ln -sf /app/packages/scoring /app/node_modules/@watchwarden/scoring
WORKDIR /app/apps/worker
RUN mkdir -p /app/exports
CMD ["node", "dist/index.js"]
