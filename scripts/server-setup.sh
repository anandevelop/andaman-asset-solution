#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# scripts/server-setup.sh — one-time host settings for the production droplet
#
# Run once, as root, on the droplet:
#
#   cd /opt/app
#   docker compose -f docker-compose.prod.yml exec -T app cat scripts/ops/server-setup.sh > server-setup.sh
#   sh server-setup.sh
#
# Safe to run again: every step checks before it changes anything.
#
#   1. Docker log limits. /etc/docker/daemon.json gets json-file with
#      max-size 10m / max-file 5 as the host default, so every container —
#      the proxy included, which docker-compose.prod.yml in the repository
#      does not describe — keeps at most 50 MB of log. The 2026-10-03 "no
#      space left on device" was unbounded logs. Docker is restarted and the
#      stack recreated so the running containers pick the limit up: about
#      half a minute of downtime, so run this at a quiet hour.
#   2. The nightly backup. Installs backup-db.sh and root's crontab line,
#      then takes a first backup straight away so the system page in the
#      back office turns green tonight rather than tomorrow.
#
# Every deploy afterwards refreshes backup-db.sh from the new image and
# re-checks the crontab line (.github/workflows/deploy.yml), so this only
# has to be run once.
# ─────────────────────────────────────────────────────────────────────────

set -eu

APP_DIR="${APP_DIR:-/opt/app}"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
CRON_LINE="30 19 * * * $APP_DIR/backup-db.sh >> $APP_DIR/backups/backup.log 2>&1"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (sudo sh server-setup.sh)." >&2
  exit 1
fi

cd "$APP_DIR"

# ── 1. Log limits ───────────────────────────────────────────────────────
say "1/2 Docker log limits"
DAEMON=/etc/docker/daemon.json
if [ -f "$DAEMON" ] && grep -q '"max-size"' "$DAEMON"; then
  echo "already set in $DAEMON — nothing to do"
else
  if [ -f "$DAEMON" ]; then
    cp "$DAEMON" "$DAEMON.bak.$(date +%Y%m%d%H%M%S)"
    # Merge rather than overwrite: the file may hold other settings.
    python3 - "$DAEMON" <<'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f) if f.read().strip() else {}
data.setdefault("log-driver", "json-file")
data.setdefault("log-opts", {}).update({"max-size": "10m", "max-file": "5"})
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PY
  else
    mkdir -p /etc/docker
    printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "5" }\n}\n' > "$DAEMON"
  fi
  echo "written: $(tr -d '\n' < "$DAEMON")"

  echo "current container log sizes:"
  du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -h | tail -5 || true

  echo "restarting Docker and recreating the stack (about 30 s of downtime)…"
  systemctl restart docker
  # Every container, so each is recreated with the new default — a
  # container keeps the log settings it was created with.
  $COMPOSE up -d --force-recreate
  echo "done"
fi

# ── 2. Nightly backup ───────────────────────────────────────────────────
say "2/2 Nightly database backup"
$COMPOSE exec -T app cat scripts/ops/backup-db.sh > "$APP_DIR/backup-db.sh.new"
mv "$APP_DIR/backup-db.sh.new" "$APP_DIR/backup-db.sh"
chmod 700 "$APP_DIR/backup-db.sh"
mkdir -p "$APP_DIR/backups" && chmod 700 "$APP_DIR/backups"
echo "installed $APP_DIR/backup-db.sh"

if crontab -l 2>/dev/null | grep -qF "$APP_DIR/backup-db.sh"; then
  echo "crontab line already present"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "crontab: $CRON_LINE   (19:30 UTC = 02:30 Bangkok)"
fi

if ! grep -qE '^BACKUP_BUCKET=.+' "$APP_DIR/.env"; then
  echo
  echo "NOTE: BACKUP_BUCKET is not set in $APP_DIR/.env, so dumps stay on this"
  echo "droplet only. Create a private Space (file listing off), add"
  echo "  BACKUP_BUCKET=\"andaman-db-backups\""
  echo "to .env, and the next run copies there too. See docs/DEPLOYMENT.md §8a."
fi

say "First backup now"
"$APP_DIR/backup-db.sh" 2>&1 | tee -a "$APP_DIR/backups/backup.log"

say "All set. Check /admin/settings/system → Backups in the back office."
