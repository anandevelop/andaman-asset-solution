#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# scripts/setup-docker.sh
#
# Brings up Postgres via docker-compose.yml.
# Called by scripts/setup-db.sh; can also be run directly:
#   npm run setup:docker
#
# Its only contract: on exit 0, Postgres is listening and DATABASE_URL works.
# Migrations and seeding are the dispatcher's job.
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/setup-lib.sh
source scripts/setup-lib.sh

PG_PORT="$(db_port)"
PG_USER="$(db_user)"

step "  Postgres via Docker"

# ── 1. Docker installed ──────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed" \
    "Install Docker Desktop:" \
    "  brew install --cask docker" \
    "  https://www.docker.com/products/docker-desktop/" \
    "" \
    "Open it once so the daemon starts, then re-run: npm run setup" \
    "" \
    "Don't want Docker? Use native Postgres instead:" \
    "  npm run setup:native"
fi
ok "Docker CLI found  $(docker --version 2>/dev/null | sed 's/,.*//')"

# ── 2. Daemon running ────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but the daemon isn't running" \
    "Open Docker Desktop (Applications → Docker) and wait for the whale" \
    "icon in the menu bar to stop animating, then re-run: npm run setup"
fi
ok "Docker daemon is running"

# ── 3. Port conflict ─────────────────────────────────────────────────────
if lsof -i ":${PG_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  if docker compose ps --services --filter status=running 2>/dev/null | grep -q '^db$'; then
    info "Port ${PG_PORT} is held by this project's container — reusing it."
  else
    die "Port ${PG_PORT} is already in use by another process" \
      "  lsof -i :${PG_PORT}" \
      "" \
      "Stop it, or move this project to another port:" \
      "  1. docker-compose.yml → ports: \"5433:5432\"" \
      "  2. .env → DATABASE_URL port 5433" \
      "  3. npm run setup"
  fi
else
  ok "Port ${PG_PORT} is free"
fi

# ── 4. Start containers ──────────────────────────────────────────────────
info "Starting Postgres (the first run pulls the image)…"

docker compose up -d || die "docker compose up failed" \
  "Full logs:" \
  "  docker compose logs db"
ok "Containers started"

# ── 5. Readiness ─────────────────────────────────────────────────────────
info "Waiting for Postgres to accept connections…"

READY=0
for i in $(seq 1 45); do
  if docker compose exec -T db pg_isready -U "$PG_USER" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
  [ $((i % 10)) -eq 0 ] && info "still waiting… (${i}s)"
done

[ "$READY" -eq 1 ] || die "Postgres did not become ready within 45 seconds" \
  "Inspect the container:" \
  "  docker compose logs db" \
  "" \
  "If the volume was created with different credentials, reset it" \
  "(this DESTROYS local data):" \
  "  npm run db:reset"

ok "Postgres is accepting connections"

printf "\n"
info "Adminer (DB browser): http://localhost:8080  (server: db, user: ${PG_USER})"
