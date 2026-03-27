#!/bin/bash
# ─── Watch Warden — Container Entrypoint ──────────────────────────────────────
# Initializes PostgreSQL (first-run setup), syncs the DB password, runs Prisma
# migrations, then hands off to supervisord to manage all processes.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ─── PostgreSQL binary path ───────────────────────────────────────────────────
PG_VERSION=$(ls /usr/lib/postgresql/ | sort -V | tail -1)
export PGBIN="/usr/lib/postgresql/${PG_VERSION}/bin"
PGDATA="/var/lib/postgresql/data"
PG_PASSWORD="${POSTGRES_PASSWORD:-changeme}"

# ─── Override DATABASE_URL to always point at the internal Postgres ───────────
export DATABASE_URL="postgresql://watchwarden:${PG_PASSWORD}@localhost:5432/watchwarden"

# ─── Override API_URL so Next.js server-side calls reach the local API ────────
export API_URL="http://localhost:4000"

# ─── First-run: initialize the data directory ─────────────────────────────────
if [ ! -f "${PGDATA}/PG_VERSION" ]; then
    echo "[watchwarden] Initializing PostgreSQL data directory..."
    install -d -m 0700 -o postgres -g postgres "${PGDATA}"
    su -s /bin/sh postgres -c \
        "${PGBIN}/initdb -D ${PGDATA} --auth-host=md5 --auth-local=trust"
fi

# ─── Start Postgres temporarily for setup & migrations ───────────────────────
echo "[watchwarden] Starting PostgreSQL for initialization..."
su -s /bin/sh postgres -c \
    "${PGBIN}/pg_ctl -D ${PGDATA} -l /var/log/postgresql/startup.log start -w"

# Create the database role if it doesn't exist
su -s /bin/sh postgres -c \
    "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='watchwarden'\" | grep -q 1 \
     || psql -c \"CREATE USER watchwarden WITH PASSWORD '${PG_PASSWORD}'\""

# Create the database if it doesn't exist
su -s /bin/sh postgres -c \
    "psql -tc \"SELECT 1 FROM pg_database WHERE datname='watchwarden'\" | grep -q 1 \
     || psql -c \"CREATE DATABASE watchwarden OWNER watchwarden\""

# Always sync the password in case POSTGRES_PASSWORD was changed
su -s /bin/sh postgres -c \
    "psql -c \"ALTER USER watchwarden WITH PASSWORD '${PG_PASSWORD}'\""

# ─── Prisma migrations ────────────────────────────────────────────────────────
echo "[watchwarden] Running database migrations..."
cd /app
node_modules/.bin/prisma migrate deploy --schema=packages/db/prisma/schema.prisma

# ─── Stop the temporary Postgres instance ────────────────────────────────────
echo "[watchwarden] Stopping temporary PostgreSQL (supervisord will restart it)..."
su -s /bin/sh postgres -c \
    "${PGBIN}/pg_ctl -D ${PGDATA} stop -w"

# ─── Hand off to supervisord ──────────────────────────────────────────────────
echo "[watchwarden] Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/watchwarden.conf
