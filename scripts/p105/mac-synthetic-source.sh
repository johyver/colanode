#!/usr/bin/env bash
# Install an isolated, persistent *fake* data fixture for off-Mac backup scheduling.
# No real Notion or DEV content; no public ports, no network, no reused volumes.
set -Eeuo pipefail
umask 077
[[ ${1:-} == --prepare ]] || { echo 'Usage: mac-synthetic-source.sh --prepare' >&2; exit 2; }
ROOT="$HOME/Library/Application Support/ColanodeBackups"
STORAGE="$ROOT/synthetic-storage"
CONFIG="$ROOT/p105.env"
CONTAINER=colanode-p105-source-scheduled
VOLUME=colanode-p105-synthetic-postgres
for n in "$CONTAINER"; do
 if docker inspect "$n" >/dev/null 2>&1; then echo 'Synthetic source already exists; refusing overwrite' >&2; exit 2; fi
done
if docker volume inspect "$VOLUME" >/dev/null 2>&1; then echo 'Synthetic PostgreSQL volume already exists; refusing overwrite' >&2; exit 2; fi
if [[ -e "$CONFIG" || -e "$STORAGE" ]]; then echo 'Synthetic fixture paths already exist; refusing overwrite' >&2; exit 2; fi
mkdir -p -m 700 "$ROOT"
chmod 700 "$ROOT"
mkdir -m 700 "$STORAGE"
printf 'p105-synthetic-fixture-v1\n' > "$STORAGE/.p105-synthetic-only"
printf 'P1-05 MAC SYNTHETIC FIXTURE; NOT REAL USER DATA\n' > "$STORAGE/readme.txt"
# Random bytes confirm transfers beyond the connected plugin's 15 MB limit.
dd if=/dev/urandom of="$STORAGE/synthetic-18MiB.bin" bs=1048576 count=18 status=none
cat > "$CONFIG" <<CONF
P105_ENVIRONMENT=synthetic
P105_SOURCE_CONTAINER=$CONTAINER
P105_UPLOADS_DIR="$STORAGE"
P105_DB_NAME=postgres
P105_DB_USER=postgres
P105_RESTIC_KEYCHAIN_SERVICE=Colanode-P1-05-Synology-Synthetic-Restic
P105_REMOTE_REPOSITORY=rclone:colanode-nas:home/Colanode-Backups/P1-05-Automation/synthetic
CONF
chmod 600 "$CONFIG"
docker volume create "$VOLUME" >/dev/null
docker run -d --name "$CONTAINER" --restart unless-stopped --network none --memory 512m --cpus 0.6 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -v "$VOLUME:/var/lib/postgresql/data" pgvector/pgvector:pg17 >/dev/null
READY=no
for n in $(seq 1 45); do
 if docker exec --user postgres "$CONTAINER" pg_isready -d postgres >/dev/null 2>&1; then READY=yes; break; fi
 sleep 1
done
[[ "$READY" == yes ]] || { echo 'Persistent synthetic PostgreSQL not ready' >&2; exit 3; }
docker exec --user postgres "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -d postgres -c \
  "CREATE EXTENSION vector; CREATE TABLE p105_fixture (id integer PRIMARY KEY,note text NOT NULL); INSERT INTO p105_fixture VALUES (1,'scheduled-synthetic-A'),(2,'scheduled-synthetic-B');" >/dev/null
echo 'PASS: durable Mac synthetic staging database, upload folder, private credentials-free config; no host ports.'
