#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# scripts/setup-native.sh
#
# Brings up Postgres 16 natively via Homebrew — no Docker required.
# Called by scripts/setup-db.sh; can also be run directly:
#   npm run setup:native
#
# Its only contract: on exit 0, Postgres is listening and DATABASE_URL works.
# Migrations and seeding are the dispatcher's job.
# ─────────────────────────────────────────────────────────────────────────

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/setup-lib.sh
source scripts/setup-lib.sh

FORMULA="postgresql@16"

PG_PORT="$(db_port)"
PG_USER="$(db_user)"
PG_PASS="$(db_password)"
PG_NAME="$(db_name)"

step "  Postgres via Homebrew (no Docker)"

# ── 1. Homebrew present ──────────────────────────────────────────────────
if ! command -v brew >/dev/null 2>&1; then
  die "Homebrew is not installed" \
    "Install it, then re-run \`npm run setup\`:" \
    "" \
    '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"' \
    "" \
    "Prefer Docker instead? Install Docker Desktop and run npm run setup:docker" \
    "  brew install --cask docker      (once Homebrew is available)" \
    "  https://www.docker.com/products/docker-desktop/"
fi
ok "Homebrew found  $(brew --version | head -1)"

BREW_PREFIX="$(brew --prefix)"
PG_BIN="${BREW_PREFIX}/opt/${FORMULA}/bin"

# ── 2. Install the formula ───────────────────────────────────────────────
if brew list --formula "$FORMULA" >/dev/null 2>&1; then
  ok "${FORMULA} already installed"
else
  info "Installing ${FORMULA} (a few minutes on first run)…"
  brew install "$FORMULA" || die "brew install ${FORMULA} failed" \
    "Try updating Homebrew first:" \
    "  brew update && brew install ${FORMULA}"
  ok "${FORMULA} installed"
fi

# postgresql@16 is keg-only, so its binaries are not on PATH by default.
if [ ! -x "${PG_BIN}/psql" ]; then
  die "Could not find psql at ${PG_BIN}" \
    "Check where Homebrew put it:" \
    "  brew --prefix ${FORMULA}"
fi
export PATH="${PG_BIN}:${PATH}"

# ── 3. Port conflict ─────────────────────────────────────────────────────
# A different Postgres already on this port would silently receive our
# commands and produce very confusing failures later.
if lsof -i ":${PG_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  if pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
    info "Postgres is already listening on ${PG_PORT} — reusing it."
  else
    die "Port ${PG_PORT} is held by something that isn't Postgres" \
      "  lsof -i :${PG_PORT}" \
      "" \
      "Stop it, or move this project to another port:" \
      "  .env → change the port in DATABASE_URL to 5433" \
      "  then re-run npm run setup"
  fi
else
  # ── 4. Start the service ───────────────────────────────────────────────
  info "Starting ${FORMULA} as a background service…"
  brew services start "$FORMULA" >/dev/null 2>&1 || die \
    "brew services start ${FORMULA} failed" \
    "Inspect the service:" \
    "  brew services info ${FORMULA}" \
    "  tail -50 ${BREW_PREFIX}/var/log/${FORMULA}.log"

  info "Waiting for Postgres to accept connections…"
  wait_for_port localhost "$PG_PORT" 45 || die \
    "Postgres did not start within 45 seconds" \
    "Check the log:" \
    "  tail -50 ${BREW_PREFIX}/var/log/${FORMULA}.log"
fi
ok "Postgres is listening on localhost:${PG_PORT}"

# ── 5. Role ──────────────────────────────────────────────────────────────
# Homebrew initialises the cluster with a superuser named after the macOS
# account, not "postgres" — so we connect as $USER to create the app role.
ADMIN_DB="postgres"

psql -h localhost -p "$PG_PORT" -d "$ADMIN_DB" -c '\q' >/dev/null 2>&1 || die \
  "Could not connect to the local cluster as $(whoami)" \
  "The data directory may not be initialised. Try:" \
  "  brew services restart ${FORMULA}" \
  "  tail -50 ${BREW_PREFIX}/var/log/${FORMULA}.log"

ROLE_EXISTS="$(psql -h localhost -p "$PG_PORT" -d "$ADMIN_DB" -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" 2>/dev/null || true)"

if [ "$ROLE_EXISTS" = "1" ]; then
  # Re-apply the password so .env stays the source of truth.
  psql -h localhost -p "$PG_PORT" -d "$ADMIN_DB" -q -c \
    "ALTER ROLE \"${PG_USER}\" WITH LOGIN CREATEDB PASSWORD '${PG_PASS}';" >/dev/null
  ok "Role ${PG_USER} exists — password synced with .env"
else
  psql -h localhost -p "$PG_PORT" -d "$ADMIN_DB" -q -c \
    "CREATE ROLE \"${PG_USER}\" WITH LOGIN CREATEDB PASSWORD '${PG_PASS}';" >/dev/null
  ok "Created role ${PG_USER}"
fi

# ── 6. Database ──────────────────────────────────────────────────────────
DB_EXISTS="$(psql -h localhost -p "$PG_PORT" -d "$ADMIN_DB" -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${PG_NAME}'" 2>/dev/null || true)"

if [ "$DB_EXISTS" = "1" ]; then
  ok "Database ${PG_NAME} already exists"
else
  createdb -h localhost -p "$PG_PORT" -O "$PG_USER" "$PG_NAME" || die \
    "Could not create database ${PG_NAME}" \
    "Create it manually:" \
    "  ${PG_BIN}/createdb -O ${PG_USER} ${PG_NAME}"
  ok "Created database ${PG_NAME}"
fi

# ── 7. Verify the exact credentials Prisma will use ──────────────────────
if PGPASSWORD="$PG_PASS" psql -h localhost -p "$PG_PORT" -U "$PG_USER" \
     -d "$PG_NAME" -tAc "SELECT 1" >/dev/null 2>&1; then
  ok "Connected as ${PG_USER} to ${PG_NAME}"
else
  die "Role and database exist, but logging in as ${PG_USER} failed" \
    "Usually a password mismatch. Reset it:" \
    "  ${PG_BIN}/psql -d postgres -c \"ALTER ROLE \\\"${PG_USER}\\\" WITH PASSWORD '${PG_PASS}';\""
fi

printf "\n"
info "Manage the service later with:"
info "  brew services stop ${FORMULA}     # stop"
info "  brew services restart ${FORMULA}  # restart"
