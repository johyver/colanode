#!/usr/bin/env bash
# P1-05: fail-closed, synthetic-only automated backup. Never targets real Notion/DEV data.
set -Eeuo pipefail
umask 077
MODE=${1:---preflight}
CONFIG=${P105_BACKUP_CONFIG:-"$HOME/Library/Application Support/ColanodeBackups/p105.env"}
LOG_DIR="$HOME/Library/Logs/ColanodeBackups"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/backup.log"
err() { printf '[P1-05] %s\n' "$*" >&2; }
notify_failure() {
  err "backup/verification failed; see $LOG"
  /usr/bin/osascript -e 'display notification "Colanode P1-05 backup needs attention. Check backup.log." with title "Colanode Backup"' >/dev/null 2>&1 || true
}
trap 'rc=$?; if ((rc != 0)); then notify_failure; fi' EXIT
for cmd in docker restic rclone python3 security; do command -v "$cmd" >/dev/null || { err "Missing $cmd"; exit 2; }; done
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || { err 'Private config missing; job NOT activated'; exit 2; }
if [[ $(stat -f %Lp "$CONFIG") != 600 || $(stat -f %u "$CONFIG") != "$(id -u)" ]]; then err 'Config must be owned by current Mac user with permissions 0600'; exit 2; fi
# Config is owner-written, mode 0600, containing no passwords or access tokens.
# shellcheck source=/dev/null
source "$CONFIG"
: "${P105_SOURCE_CONTAINER:?Missing source container}"
: "${P105_UPLOADS_DIR:?Missing synthetic upload directory}"
: "${P105_RESTIC_KEYCHAIN_SERVICE:?Missing local Keychain service}"
: "${P105_REMOTE_REPOSITORY:?Missing remote repo}"
: "${P105_DB_NAME:?Missing database name}"
: "${P105_DB_USER:?Missing database user}"
[[ ${P105_ENVIRONMENT:-} == synthetic ]] || { err 'Synthetic environment gate missing'; exit 2; }
[[ "$P105_SOURCE_CONTAINER" =~ ^colanode-p105-source-[a-z0-9-]+$ ]] || { err 'Protected source container: REFUSED'; exit 2; }
[[ "$P105_UPLOADS_DIR" == /tmp/colanode-p105-* || "$P105_UPLOADS_DIR" == /private/tmp/colanode-p105-* || "$P105_UPLOADS_DIR" == "$HOME/Library/Application Support/ColanodeBackups/synthetic-storage" ]] || { err 'Synthetic uploads path gate: REFUSED'; exit 2; }
if [[ "$MODE" != --verify ]]; then
  [[ -f "$P105_UPLOADS_DIR/.p105-synthetic-only" ]] || { err 'Synthetic marker not found'; exit 2; }
fi
[[ "$P105_RESTIC_KEYCHAIN_SERVICE" =~ ^[A-Za-z0-9_-]+$ ]] || { err 'Unsafe Keychain service name'; exit 2; }
[[ "$P105_REMOTE_REPOSITORY" == rclone:colanode-nas:home/Colanode-Backups/P1-05-Automation/* ]] || { err 'Repository path outside dedicated Synology backup folder'; exit 2; }
if ! rclone listremotes 2>/dev/null | grep -Fxq 'colanode-nas:'; then err 'Configure private Rclone WebDAV remote colanode-nas first'; exit 2; fi
# Fail closed if remote is not genuine Synology WebDAV. Local alias is ONLY
# permitted in a non-production test harness and never in installed launchd.
BACKEND=$(rclone config show colanode-nas 2>/dev/null | awk '$1 == "type" && $2 == "=" {print $3; exit}')
BACKEND_URL=$(rclone config show colanode-nas 2>/dev/null | awk '$1 == "url" && $2 == "=" {print $3; exit}')
if [[ ${P105_ALLOW_LOCAL_TEST_ALIAS:-0} == 1 && "$BACKEND" == alias ]]; then
  : # local fixture harness only
elif [[ "$BACKEND" != webdav || ( "$BACKEND_URL" != 'https://files.hyverstudio.com/' && "$BACKEND_URL" != 'https://files.hyverstudio.com' ) ]]; then
  err 'Remote must use the expected HTTPS Synology WebDAV endpoint; installation blocked'; exit 2
fi
# Query only a known folder; do not touch unrelated Synology locations.
if ! rclone lsf 'colanode-nas:home/Colanode-Backups/' --max-depth 1 --timeout 15s >/dev/null 2>&1; then
  err 'Rclone Synology connection failed'; exit 2
fi
if ! security find-generic-password -s "$P105_RESTIC_KEYCHAIN_SERVICE" >/dev/null 2>&1; then err 'Local Keychain Restic key missing'; exit 2; fi
if [[ "$MODE" != --verify ]]; then
  [[ $(docker inspect "$P105_SOURCE_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || true) == true ]] || { err 'Synthetic PostgreSQL container unavailable'; exit 2; }
fi
# Restic launches the Keychain command locally, and no key is displayed in logs.
export RESTIC_PASSWORD_COMMAND="security find-generic-password -s $P105_RESTIC_KEYCHAIN_SERVICE -w"
export RESTIC_REPOSITORY="$P105_REMOTE_REPOSITORY"
case "$MODE" in
  --preflight)
    restic snapshots --json >/dev/null 2>&1 || { err 'Encrypted remote repository missing, unreachable, or wrong key'; exit 2; }
    err 'PASS: synthetic source, configured encrypted repository, Keychain and Restic access validated'
    ;;
  --backup)
    LOCK_DIR="$LOG_DIR/backup.lockdir"
    if ! mkdir -m 700 "$LOCK_DIR" 2>/dev/null; then err 'Another backup may be running; remove stale lock only after inspection'; exit 2; fi
    trap 'rc=$?; rmdir "$LOCK_DIR" 2>/dev/null || true; if ((rc != 0)); then notify_failure; fi' EXIT
    restic snapshots --json >/dev/null 2>&1 || { err 'Restic repo unavailable; do not auto-initialize'; exit 2; }
    TEMP=$(mktemp -d /tmp/colanode-p105-automated.XXXXXXXX)
    cleanup() { rm -rf -- "$TEMP"; }
    trap 'rc=$?; cleanup; rmdir "$LOCK_DIR" 2>/dev/null || true; if ((rc != 0)); then notify_failure; fi' EXIT
    mkdir -m 700 "$TEMP/payload" "$TEMP/payload/storage"
    cp -R "$P105_UPLOADS_DIR/." "$TEMP/payload/storage/"
    echo p105-synthetic-fixture-v1 > "$TEMP/payload/.p105-synthetic-only"
    docker exec --user "$P105_DB_USER" "$P105_SOURCE_CONTAINER" pg_dump --format=custom --no-owner --no-acl -d "$P105_DB_NAME" > "$TEMP/payload/postgres.dump"
    [[ -s "$TEMP/payload/postgres.dump" ]] || { err 'Empty PostgreSQL dump'; exit 2; }
    python3 "$(dirname "$0")/manifest.py" generate "$TEMP/payload"
    (cd "$TEMP" && restic backup payload --tag colanode-p105-synthetic --tag automated >/dev/null)
    restic check --read-data-subset=10% >/dev/null
    printf '%s SUCCESS: encrypted synthetic PostgreSQL/files backup + integrity check\n' "$(date -u +%FT%TZ)" >> "$LOG"
    ;;
  --verify)
    # Verify directly from off-Mac encrypted repository into a clean disposable
    # database. No existing DEV/STAGING container or volume is targeted.
    TEMP=$(mktemp -d /tmp/colanode-p105-verification.XXXXXXXX)
    SUFFIX=$(basename "$TEMP" | tr -cd 'a-z0-9')
    VERIFY_CONTAINER="colanode-p105-verify-$SUFFIX"
    cleanup_verify() {
      docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
      rm -rf -- "$TEMP"
    }
    trap 'rc=$?; cleanup_verify; if ((rc != 0)); then notify_failure; fi' EXIT
    restic restore latest --tag colanode-p105-synthetic --target "$TEMP" >/dev/null
    [[ -s "$TEMP/payload/postgres.dump" ]] || { err 'Downloaded snapshot has no PostgreSQL dump'; exit 2; }
    python3 "$(dirname "$0")/manifest.py" verify "$TEMP/payload"
    docker run -d --rm --name "$VERIFY_CONTAINER" --network none \
      --memory 512m --cpus 0.6 -e POSTGRES_HOST_AUTH_METHOD=trust \
      pgvector/pgvector:pg17 >/dev/null
    READY=no
    for i in $(seq 1 40); do
      if docker exec --user postgres "$VERIFY_CONTAINER" pg_isready -h 127.0.0.1 -d postgres >/dev/null 2>&1; then READY=yes; break; fi
      sleep 1
    done
    [[ "$READY" == yes ]] || { err 'Disposable restore PostgreSQL was not ready'; exit 3; }
    docker exec --user postgres -i "$VERIFY_CONTAINER" pg_restore --host=127.0.0.1 --no-owner --no-acl --exit-on-error -d postgres < "$TEMP/payload/postgres.dump"
    ROWS=$(docker exec --user postgres "$VERIFY_CONTAINER" psql -At -h 127.0.0.1 -d postgres -c 'SELECT count(*) FROM p105_fixture')
    VECTOR=$(docker exec --user postgres "$VERIFY_CONTAINER" psql -At -h 127.0.0.1 -d postgres -c "SELECT count(*) FROM pg_extension WHERE extname='vector'")
    [[ "$ROWS" =~ ^[1-9][0-9]*$ && "$VECTOR" == 1 ]] || { err 'Synthetic database or pgvector restore invalid'; exit 3; }
    [[ -f "$TEMP/payload/storage/.p105-synthetic-only" ]] || { err 'Synthetic uploads marker missing after restore'; exit 3; }
    printf '%s SUCCESS: clean off-Mac snapshot restore with %s rows, pgvector and upload SHA256\n' "$(date -u +%FT%TZ)" "$ROWS" >> "$LOG"
    ;;
  *) err 'Usage: mac-offsite-backup.sh --preflight|--backup|--verify'; exit 2;;
esac
