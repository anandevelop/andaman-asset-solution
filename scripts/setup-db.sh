#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# scripts/setup-db.sh
#
# One command from a fresh clone to a running, seeded database:
#   npm run setup
#
# Picks whichever Postgres engine is available on this machine — Docker if
# it's installed and running, otherwise a native Homebrew install. Force one
# explicitly with:
#   npm run setup:docker
#   npm run setup:native
#
# Safe to re-run.
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/setup-lib.sh
source scripts/setup-lib.sh

ENGINE="${1:-auto}"

printf "\n${BOLD}  Andaman — database setup${NC}\n\n"

# ── 1. Environment file ──────────────────────────────────────────────────
ensure_env_file

# ── 2. Choose an engine ──────────────────────────────────────────────────
if [ "$ENGINE" = "auto" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    ENGINE="docker"
    info "Docker detected — using the containerised database."
  elif command -v brew >/dev/null 2>&1; then
    ENGINE="native"
    info "Docker not available — using native Postgres via Homebrew."
    info "(Prefer containers? Install Docker Desktop, then: npm run setup:docker)"
  else
    die "Neither Docker nor Homebrew is available" \
      "Install one of them, then re-run npm run setup." \
      "" \
      "Homebrew (lighter, recommended for local dev):" \
      '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' \
      "" \
      "Docker Desktop:" \
      "  https://www.docker.com/products/docker-desktop/"
  fi
fi

case "$ENGINE" in
  docker) bash scripts/setup-docker.sh ;;
  native) bash scripts/setup-native.sh ;;
  *) die "Unknown engine: ${ENGINE}" "Use 'docker' or 'native'." ;;
esac

# ── 3. Schema ────────────────────────────────────────────────────────────
step "  Applying migrations"

npx prisma migrate dev --name init || die "prisma migrate failed" \
  "Most often a credential mismatch between .env and an existing database." \
  "" \
  "Diagnose:  npm run db:check" \
  "Reset (DESTROYS local data):" \
  "  docker:  npm run db:reset && npm run setup" \
  "  native:  dropdb $(db_name) && npm run setup"

ok "Schema applied"

# ── 4. Seed ──────────────────────────────────────────────────────────────
step "  Seeding Trinity Village + construction progress"

npx prisma db seed || die "Seeding failed" \
  "Run it directly for the full error:" \
  "  npx tsx prisma/seed.ts"

# ── 5. Verify ────────────────────────────────────────────────────────────
step "  Verifying"

npx tsx scripts/db-check.ts || true

printf "\n${GREEN}${BOLD}  Done.${NC}  Start the dev server:\n\n"
printf "    npm run dev\n\n"
printf "${DIM}    http://localhost:3000  → redirects to /th${NC}\n\n"
