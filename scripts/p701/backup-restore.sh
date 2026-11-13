#!/bin/bash
set -euo pipefail

ROOT="/Users/johyver/Projects/colanode-p2-01-preview"
STAGE="$ROOT/hosting/environments/p701-staging"
COMPOSE=(/opt/homebrew/bin/docker-compose --env-file "$STAGE/.env" -f "$STAGE/compose.yaml")
BACKUP_ROOT="${P701_BACKUP_ROOT:-/Volumes/files.hyverstudio.com/colanode-p701-staging}"
RESTIC_REPOSITORY="${P701_RESTIC_REPOSITORY:-rclone:colanode-nas:home/Colanode-Backups/P7-01-Automation/p701-restic}"
RESTIC_PASSWORD_FILE="$STAGE/secrets/restic.password"
WORK="$(mktemp -d /tmp/p701-backup.XXXXXX)"
RESTORE="$(mktemp -d /tmp/p701-restore.XXXXXX)"
trap 'rm -rf "$WORK" "$RESTORE"' EXIT

set -a
source "$STAGE/.env"
set +a

if [[ "$RESTIC_REPOSITORY" == rclone:colanode-nas:home/Colanode-Backups/P7-01-Automation/* ]]; then
  :
else
  mkdir -p "$BACKUP_ROOT"
fi
if [ ! -f "$RESTIC_PASSWORD_FILE" ]; then
  printf '%s\n' 'p701-restic-9f4e2c7a6b1d8e0f3c5a7b9d2e4f6a8c' > "$RESTIC_PASSWORD_FILE"
  chmod 600 "$RESTIC_PASSWORD_FILE"
fi

backup() {
  local pg_volume upload_volume
  pg_volume="$(docker volume ls --format '{{.Name}}' | grep 'p701_postgres_data$' | head -1)"
  upload_volume="$(docker volume ls --format '{{.Name}}' | grep 'p701_uploads$' | head -1)"
  [ -n "$pg_volume" ] && [ -n "$upload_volume" ]

  docker exec "${P701_PROJECT}-postgres-1" pg_dump -U "$P701_PG_USER" -d "$P701_PG_DB" -Fc > "$WORK/database.dump"
  docker run --rm -v "$upload_volume:/source:ro" alpine:3.21 sh -c 'tar -czf - -C /source .' > "$WORK/uploads.tar.gz"
  (cd "$WORK" && shasum -a 256 database.dump uploads.tar.gz > SHA256SUMS)
  printf 'P701 project=%s\n' "$P701_PROJECT" > "$WORK/MANIFEST"
  printf 'P701 synthetic-only backup created=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$WORK/MANIFEST"

  if ! restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" snapshots >/dev/null 2>&1; then
    restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" init
  fi
  restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" backup "$WORK"
  restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" check
  printf 'encrypted backup verified at %s\n' "$RESTIC_REPOSITORY"
}

restore_test() {
  local restore_container="p701-restore-$$"
  restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" snapshots >/dev/null
  restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" restore latest --target "$RESTORE"
  local snapshot_root
  snapshot_root="$(find "$RESTORE" -type f -name database.dump -print -quit | xargs -I{} dirname "{}")"
  [ -n "$snapshot_root" ]
  (cd "$snapshot_root" && shasum -a 256 -c SHA256SUMS)
  docker run -d --name "$restore_container" -e POSTGRES_PASSWORD=restorepass -e POSTGRES_DB="$P701_PG_DB" -e POSTGRES_USER="$P701_PG_USER" pgvector/pgvector:pg17 >/dev/null
  cleanup() { docker rm -f "$restore_container" >/dev/null 2>&1 || true; }
  trap cleanup RETURN
  for _ in $(seq 1 30); do
    if docker exec "$restore_container" pg_isready -U "$P701_PG_USER" -d "$P701_PG_DB" >/dev/null 2>&1; then break; fi
    sleep 2
  done
  docker cp "$snapshot_root/database.dump" "$restore_container:/tmp/database.dump"
  docker exec "$restore_container" pg_restore --no-owner --no-privileges -U "$P701_PG_USER" -d "$P701_PG_DB" /tmp/database.dump
  docker exec "$restore_container" psql -U "$P701_PG_USER" -d "$P701_PG_DB" -Atc 'select count(*) from users;' | grep -Eq '^[0-9]+$'
  printf 'fresh PostgreSQL restore verified; upload archive hash verified\n'
}

case "${1:-}" in
  backup) backup ;;
  restore-test) restore_test ;;
  *) printf 'usage: %s {backup|restore-test}\n' "$0" >&2; exit 2 ;;
esac
