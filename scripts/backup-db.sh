#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────
# scripts/backup-db.sh — nightly Postgres backup for the production droplet
#
# Postgres runs in the `db` container on the same droplet as the app, in the
# andaman_pg_data volume. Before this there was no backup at all: a lost disk
# or a bad migration would have taken every lead and every page with it.
#
# What it does, in order, stopping at the first failure:
#   1. pg_dump inside the db container (custom format, compressed). The
#      database credentials are the container's own POSTGRES_* variables,
#      so this script never reads a password.
#   2. Checks the file is a readable dump (pg_restore --list), so a dump
#      that silently came out empty is caught tonight, not on the day it is
#      needed.
#   3. Copies it to a PRIVATE Spaces bucket (BACKUP_BUCKET in .env), so a
#      dead droplet does not take its backups with it. Skipped, loudly, when
#      BACKUP_BUCKET is unset.
#   4. Deletes local dumps older than KEEP_DAYS (default 14).
#
# Lives at /opt/app/backup-db.sh on the server, run by root's crontab:
#   30 19 * * * /opt/app/backup-db.sh >> /var/log/andaman-backup.log 2>&1
# (19:30 UTC = 02:30 Bangkok.) Restore steps: docs/DEPLOYMENT.md, "Backups".
# ─────────────────────────────────────────────────────────────────────────
set -eu

APP_DIR="${APP_DIR:-/opt/app}"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# One value from .env, quotes stripped. Read by name rather than sourcing
# the file: .env holds values (a private key, passwords) a shell would choke on.
env_value() {
  grep -E "^$1=" "$APP_DIR/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

log() { echo "[backup $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

NAME="andaman-$(date -u +%Y%m%d-%H%M).dump"
FILE="$BACKUP_DIR/$NAME"

# A dump that fails half-way must not be left looking like a backup.
trap 'rm -f "$FILE.partial"' EXIT

log "dumping to $FILE"
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$FILE.partial"
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"

TABLES=$($COMPOSE exec -T db pg_restore --list < "$FILE" | grep -c "TABLE DATA" || true)
if [ "$TABLES" -lt 10 ]; then
  log "FAILED: dump has only $TABLES tables of data — not trusting it"
  exit 1
fi
log "ok: $(du -h "$FILE" | cut -f1), $TABLES tables"

BUCKET="$(env_value BACKUP_BUCKET)"
if [ -n "$BUCKET" ]; then
  ENDPOINT="$(env_value DO_SPACES_ENDPOINT)"
  AWS_ACCESS_KEY_ID="$(env_value DO_SPACES_ACCESS_KEY_ID)" \
  AWS_SECRET_ACCESS_KEY="$(env_value DO_SPACES_SECRET_ACCESS_KEY)" \
  docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -v "$BACKUP_DIR":/backups:ro amazon/aws-cli \
    s3 cp "/backups/$NAME" "s3://$BUCKET/db/$NAME" \
    --endpoint-url "$ENDPOINT" --acl private --only-show-errors
  log "uploaded to s3://$BUCKET/db/$NAME"
else
  log "WARNING: BACKUP_BUCKET is not set in .env — this backup exists only on this droplet"
fi

find "$BACKUP_DIR" -name 'andaman-*.dump' -mtime "+$KEEP_DAYS" -delete
log "done; $(ls "$BACKUP_DIR"/andaman-*.dump | wc -l) local dumps kept"
