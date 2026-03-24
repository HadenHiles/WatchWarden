# Watch Warden

A production-ready, self-hosted Docker application for orchestrating home media server requests. Watch Warden helps a Plex/Jellyseerr admin curate trending TV and movie requests using external trend sources, local family watch behavior from Tautulli, approval/rejection workflows, Jellyseerr request automation, Kometa export for Plex collections, and lifecycle/cleanup policy modeling for Maintainerr.

## Architecture Overview

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  apps/web   │────▶│  apps/api   │────▶│  apps/worker│
│  Next.js 14 │     │  Express.js │     │  node-cron  │
│  Port 3000  │     │  Port 4000  │     │  Background │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                    ┌──────▼───────────────────▼──────┐
                    │         PostgreSQL 16            │
                    │     (via Prisma ORM 5.8)         │
                    └─────────────────────────────────┘

External integrations:
  ├── Tautulli      — local watch history (family engagement signals)
  ├── Jellyseerr    — media request automation
  ├── TMDB API      — trending movies/shows (external trend source)
  └── Trakt.tv API  — trending movies/shows (external trend source)

Export targets:
  ├── Kometa        — Plex collection YAML/JSON
  └── Maintainerr  — cleanup policy enforcement
```

### Monorepo Structure

```text
WatchWarden/
├── apps/
│   ├── api/         Express.js REST API
│   ├── worker/      Background job scheduler (node-cron)
│   └── web/         Next.js 14 admin dashboard
├── packages/
│   ├── config/      Environment validation (Zod) + structured logging (Winston)
│   ├── db/          Prisma schema, client singleton, seed script
│   ├── integrations/ Tautulli, Jellyseerr, TMDB, Trakt clients
│   ├── scoring/     Scoring engine + lifecycle state machine
│   └── types/       Shared TypeScript types
├── exports/
│   └── samples/     Sample Kometa export files
├── docker-compose.yml
└── docker-compose.dev.yml
```

## Quick Start

### Prerequisites

- Docker & Docker Compose v2
- API keys: TMDB (free) and/or Trakt.tv (free)
- Running Tautulli and Jellyseerr instances (optional but recommended)

### 1. Clone and configure

```bash
git clone <repo> watchwarden
cd watchwarden
cp .env.example .env
```

Edit `.env` with your values — at minimum set:

- `POSTGRES_PASSWORD` — any secure random string
- `API_SECRET` — random 32+ char string
- `ADMIN_PASSWORD_HASH` — bcrypt hash of your chosen admin password
- `SESSION_SECRET` — random 32+ char string

Generate an admin password hash:

```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('yourpassword', 12).then(console.log)"
```

### 2. Start

```bash
docker compose up -d
```

Services:

- Web UI: <http://localhost:3000>
- API: <http://localhost:4000>
- PostgreSQL: localhost:5432

### 3. Run migrations and seed (first time)

```bash
docker compose exec api pnpm db:migrate
docker compose exec api pnpm db:seed
```

## Development Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure only
docker compose -f docker-compose.dev.yml up postgres -d

# Start all services in dev mode
pnpm dev
```

Individual services:

```bash
pnpm --filter @watchwarden/api dev      # API on :4000
pnpm --filter @watchwarden/worker dev   # Worker (polls every 30s)
pnpm --filter @watchwarden/web dev      # Web on :3000
```

## Environment Variables

See [.env.example](.env.example) for all available variables with descriptions.

Key variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `API_SECRET` | Bearer token for service-to-service calls |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the single admin password |
| `SESSION_SECRET` | iron-session encryption key (32+ chars) |
| `TAUTULLI_BASE_URL` | Tautulli base URL |
| `TAUTULLI_API_KEY` | Tautulli API key |
| `JELLYSEERR_URL` | Jellyseerr base URL |
| `JELLYSEERR_API_KEY` | Jellyseerr API key |
| `TMDB_API_KEY` | TMDB API v3 key (free at themoviedb.org) |
| `TRAKT_CLIENT_ID` | Trakt.tv app client ID (free) |
| `EXPORT_OUTPUT_DIR` | Filesystem path for Kometa exports |

## Scoring System

Watch Warden scores every candidate title using a weighted formula:

```text
finalScore = (
  externalTrendScore × 0.45 +
  localInterestScore × 0.35 +
  freshnessScore     × 0.10 +
  editorialBoost     × 0.10
) × ruleMultiplier
```

**Score components:**

- `externalTrendScore` (0–1): Normalized from TMDB popularity or Trakt watchers
- `localInterestScore` (0–1): Derived from Tautulli watch history (recency, completion, household engagement)
- `freshnessScore` (0–1): Decays over 14 days since last trend snapshot
- `editorialBoost` (0–1): Manual admin editorial override

**Hard rules** (exclusions):

- Title is already in the Plex library
- Title already has a pending Jellyseerr request
- Title was permanently rejected

**Penalties** (multipliers):

- Stale trend (>14 days old): ×0.6
- Recently rejected (<30 days): decays from ×0.5 → ×1.0

All weights are configurable via Settings → Scoring Weights.

## Lifecycle State Machine

Titles flow through a lifecycle state:

```text
CANDIDATE → SUGGESTED → APPROVED → REQUESTED → AVAILABLE → ACTIVE_TRENDING
                ↓                                                   ↓
            REJECTED                                        CLEANUP_ELIGIBLE → EXPIRED
                ↓
            SNOOZED
            
Any state → PINNED (overrides cleanup, never expires)
```

**Lifecycle policies:**

- `PERMANENT` — never eligible for cleanup
- `TEMPORARY_TRENDING` — eligible when score drops + trend is stale
- `WATCH_AND_EXPIRE` — eligible after household has watched
- `PINNED` — manually locked, survives all cleanup runs

## Worker Jobs

| Job | Default Schedule | Purpose |
| --- | --- | --- |
| `trend-sync` | Every 6 hours | Fetch trending from TMDB/Trakt, upsert Titles + snapshots |
| `tautulli-sync` | Every 4 hours | Fetch 30-day watch history, upsert LocalWatchSignals |
| `scoring` | Every 2 hours | Score all candidates, upsert Suggestions |
| `jellyseerr-status-sync` | Every 30 min | Sync RequestRecord status from Jellyseerr |
| `library-sync` | Every 30 min | Check which requested titles are now available |
| `lifecycle-eval` | Every 1 hour | Run lifecycle state machine transitions |
| `export` | Every 6 hours | Generate Kometa + Maintainerr export files |

Jobs can be manually triggered from the Admin → Jobs page.

## API Routes

All routes (except `/health`, `/auth/login`) require authentication via:

- Session cookie (web dashboard), OR
- `Authorization: Bearer <API_SECRET>` header (service-to-service)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Health check |
| POST | `/auth/login` | Admin login |
| POST | `/auth/logout` | Logout |
| GET | `/suggestions` | List suggestions (filterable, sortable) |
| GET | `/suggestions/:id` | Get suggestion with full details |
| POST | `/decisions` | Apply a decision to a suggestion |
| POST | `/decisions/bulk` | Bulk decisions (up to 50) |
| GET | `/titles` | List titles (filterable) |
| PATCH | `/titles/:id/lifecycle` | Update lifecycle policy |
| GET | `/jobs` | Job status summary |
| POST | `/jobs/:name/trigger` | Trigger a job manually |
| GET | `/settings` | Get all settings |
| PATCH | `/settings` | Batch update settings |
| POST | `/exports/generate` | Trigger export generation |
| GET | `/exports` | List published exports |
| GET | `/audit` | Paginated audit log |

## Kometa Integration

Watch Warden exports JSON files readable by Kometa (formerly PMM) for building dynamic Plex collections.

**Default export location:** `./exports/` (configurable with `EXPORT_OUTPUT_DIR`)

**Export types:**

- `active_trending_movies.json` — movies currently trending
- `active_trending_shows.json` — shows currently trending
- `cleanup_eligible_movies.json` — movies flagged for cleanup
- `cleanup_eligible_shows.json` — shows flagged for cleanup
- `pinned_movies.json` / `pinned_shows.json` — pinned/permanent titles
- `approved_movies.json` / `approved_shows.json` — approved, awaiting request

Sample Kometa `config.yml` snippet:

```yaml
libraries:
  Movies:
    collection_files:
      - file: /exports/active_trending_movies.json
```

See [exports/samples/](exports/samples/) for example output files.

## Maintainerr Integration

Point Maintainerr's collection rules at the `cleanup_eligible_*` exports to automate removal of content that Watch Warden has flagged. The `keepUntil` field in each export item can be used as a deletion date threshold.

## Testing

```bash
# Run all unit tests
pnpm test

# Run scoring package tests only
pnpm --filter @watchwarden/scoring test

# Watch mode
pnpm --filter @watchwarden/scoring test:watch
```

Tests cover:

- Scoring engine: weighted formula, rule exclusions, penalties
- Lifecycle state machine: all transitions, edge cases (PERMANENT policy, PINNED override)

## Building for Production

```bash
# Build all packages
pnpm build

# Build Docker images
docker compose build

# Start production stack
docker compose up -d
```

## Security Notes

- Single-admin design: one hashed password stored in `ADMIN_PASSWORD_HASH` env var
- Sessions use iron-session (encrypted, httpOnly, SameSite=lax)
- All API routes require authentication
- TMDB and Trakt API keys are never exposed to the browser
- Passwords are hashed with bcrypt (cost factor 12)
- Docker containers run as non-root where possible

## Tech Stack

| Component | Technology |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| API | Express.js 4 + TypeScript |
| Worker | node-cron 3 + TypeScript |
| Web | Next.js 14 App Router + Tailwind CSS |
| Database | PostgreSQL 16 + Prisma ORM 5 |
| Auth | iron-session (web) + Bearer token (API) |
| Logging | Winston (JSON in prod, colorized in dev) |
| Validation | Zod |
| Testing | Vitest |
| Containers | Docker + Docker Compose |
