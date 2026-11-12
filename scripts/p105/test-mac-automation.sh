#!/usr/bin/env bash
# End-to-end local emulation test ONLY. Does NOT verify live NAS transfer.
set -Eeuo pipefail
umask 077
WORK=$(mktemp -d /tmp/colanode-p105-emulate.XXXXXXXX)
SUFFIX=$(basename "$WORK" | tr -cd 'a-z0-9')
CNAME="colanode-p105-source-$SUFFIX"
cleanup() { docker rm -f "$CNAME" >/dev/null 2>&1 || true; rm -rf -- "$WORK"; }
trap cleanup EXIT
mkdir -p "$WORK/root/home/Colanode-Backups/P1-05-Automation" "$WORK/storage" "$WORK/private"
printf 'synthetic fixture\n' > "$WORK/storage/fake-upload.txt"
printf 'p105-synthetic-fixture-v1\n' > "$WORK/storage/.p105-synthetic-only"
cat > "$WORK/rclone.conf" <<RC
[colanode-nas]
type = alias
remote = $WORK/root
RC
export RCLONE_CONFIG="$WORK/rclone.conf"
export P105_ALLOW_LOCAL_TEST_ALIAS=1
cat > "$WORK/private/p105.env" <<CONF
P105_ENVIRONMENT=synthetic
P105_SOURCE_CONTAINER=$CNAME
P105_UPLOADS_DIR=$WORK/storage
P105_DB_NAME=postgres
P105_DB_USER=postgres
P105_RESTIC_KEYCHAIN_SERVICE=Colanode-P1-05-Synology-Synthetic-Restic
P105_REMOTE_REPOSITORY=rclone:colanode-nas:home/Colanode-Backups/P1-05-Automation/synthetic
CONF
chmod 600 "$WORK/private/p105.env"
# Symlink is rejected; use a private dummy path under the expected prefix.
# The runner only reads and never deletes the synthetic storage source.
TMP_ALIAS=$(mktemp -d /tmp/colanode-p105-sourcefiles.XXXXXXXX)
trap 'cleanup; rm -rf -- "$TMP_ALIAS"' EXIT
cp -R "$WORK/storage/." "$TMP_ALIAS/"
sed -i '' "s#P105_UPLOADS_DIR=$WORK/storage#P105_UPLOADS_DIR=$TMP_ALIAS#" "$WORK/private/p105.env"
export P105_BACKUP_CONFIG="$WORK/private/p105.env"
# Do not publish host ports or reuse any Colanode DEV volumes.
docker run -d --rm --name "$CNAME" --network none --memory 512m --cpus 0.6 -e POSTGRES_HOST_AUTH_METHOD=trust pgvector/pgvector:pg17 >/dev/null
READY=no
for n in $(seq 1 40); do
 if docker exec --user postgres "$CNAME" pg_isready -d postgres >/dev/null 2>&1; then READY=yes; break; fi
 sleep 1
done
[[ "$READY" == yes ]] || { echo 'Synthetic database did not start' >&2; exit 2; }
docker exec --user postgres "$CNAME" psql -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE EXTENSION vector; CREATE TABLE p105_fixture (id integer PRIMARY KEY,note text); INSERT INTO p105_fixture VALUES (1,'synthetic-A'),(2,'synthetic-B');" >/dev/null
export RESTIC_PASSWORD_COMMAND='security find-generic-password -s Colanode-P1-05-Synology-Synthetic-Restic -w'
export RESTIC_REPOSITORY='rclone:colanode-nas:home/Colanode-Backups/P1-05-Automation/synthetic'
restic init >/dev/null
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPTS/mac-offsite-backup.sh" --preflight
"$SCRIPTS/mac-offsite-backup.sh" --backup
"$SCRIPTS/mac-offsite-backup.sh" --verify
printf 'PASS: local Rclone emulation encrypt->backup->restore with PostgreSQL, pgvector and upload hashes\n'
