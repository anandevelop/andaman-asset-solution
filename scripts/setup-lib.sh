# ─────────────────────────────────────────────────────────────────────────
# scripts/setup-lib.sh — shared helpers for the setup scripts.
# Sourced, never executed directly.
# ─────────────────────────────────────────────────────────────────────────

GREEN='\033[32m'; RED='\033[31m'; YELLOW='\033[33m'
DIM='\033[2m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { printf "${GREEN}✓${NC} %s\n" "$1"; }
info() { printf "${DIM}  %s${NC}\n" "$1"; }
warn() { printf "${YELLOW}!${NC} %s\n" "$1"; }
step() { printf "\n${BOLD}%s${NC}\n\n" "$1"; }

# die "headline" "fix line 1" "fix line 2" …
die() {
  printf "\n${RED}✗ %s${NC}\n\n" "$1"
  shift
  for line in "$@"; do printf "    %s\n" "$line"; done
  printf "\n"
  exit 1
}

# ── .env readers ─────────────────────────────────────────────────────────
# Values are read from .env rather than hardcoded, so changing credentials in
# one place keeps the scripts correct.

env_value() {
  # env_value KEY [default]
  local value
  value="$(grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
  printf '%s' "${value:-${2:-}}"
}

db_port() {
  local port
  port="$(grep -oE '@[^:]+:[0-9]+' .env 2>/dev/null | head -1 | cut -d: -f2 || true)"
  printf '%s' "${port:-5432}"
}

db_user()     { env_value POSTGRES_USER andaman_admin; }
db_password() { env_value POSTGRES_PASSWORD changeme_local_only; }
db_name()     { env_value POSTGRES_DB andaman_asset_solution; }

ensure_env_file() {
  if [ -f .env ]; then
    ok ".env found"
    return
  fi

  [ -f .env.example ] || die ".env and .env.example are both missing" \
    "You may be running this from the wrong directory."

  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Using the default local password — change it before deploying."
}

# ── Readiness probe ──────────────────────────────────────────────────────
# Pure-bash TCP check so it works whether Postgres runs in Docker or natively.
wait_for_port() {
  local host="$1" port="$2" seconds="${3:-45}" i

  for i in $(seq 1 "$seconds"); do
    if (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; then
      exec 3<&- 2>/dev/null || true
      exec 3>&- 2>/dev/null || true
      return 0
    fi
    sleep 1
    [ $((i % 10)) -eq 0 ] && info "still waiting… (${i}s)"
  done

  return 1
}
