#!/usr/bin/env bash
# Disposable Mac/Colima synthetic staging. Never targets existing DEV volumes.
set -euo pipefail
umask 077
export P105_ENVIRONMENT=synthetic
for exe in docker restic python3 openssl; do
  command -v "$exe" >/dev/null || { echo "Missing: $exe" >&2; exit 2; }
done
if docker compose version >/dev/null 2>&1; then
  use_docker_compose_plugin=yes
elif command -v docker-compose >/dev/null 2>&1; then
  use_docker_compose_plugin=no
else
  echo "P1-05 needs Docker Compose v2 plugin or standalone docker-compose" >&2
  exit 2
fi
work=$(mktemp -d /tmp/colanode-p105-mac.XXXXXXXX)
suffix=$(basename "$work" | tr -cd 'a-z0-9')
export P105_PROJECT="colanode-p105-mac-$suffix"
export P105_SOURCE_CONTAINER="colanode-p105-source-$suffix"
export P105_VALKEY_CONTAINER="colanode-p105-valkey-$suffix"
# Colima shares the user's home but NOT macOS /tmp with Docker.
# Keep disposable Compose secrets in a private home directory outside Git.
export P105_SECRET_DIR
P105_SECRET_DIR=$(mktemp -d "$HOME/.colanode-p105-secrets.XXXXXXXX")
restore_container="colanode-p105-restore-$suffix"
restore_volume="colanode-p105-restore-files-$suffix"
compose_file="$(cd "$(dirname "$0")/../../hosting/environments" && pwd)/mac-staging.compose.yaml"
dc() {
  if test "$use_docker_compose_plugin" = yes; then
    docker compose -f "$compose_file" --profile synthetic-staging -p "$P105_PROJECT" "$@"
  else
    docker-compose -f "$compose_file" --profile synthetic-staging -p "$P105_PROJECT" "$@"
  fi
}
cleanup() {
  docker rm -f "$restore_container" >/dev/null 2>&1 || true
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "$restore_volume" >/dev/null 2>&1 || true
  rm -rf -- "$work" "$P105_SECRET_DIR"
}
trap cleanup EXIT
for name in "$P105_SOURCE_CONTAINER" "$P105_VALKEY_CONTAINER" "$restore_container"; do
  if docker inspect "$name" >/dev/null 2>&1; then
    echo "Refusing existing container $name" >&2; exit 2
  fi
done
if docker volume inspect "$restore_volume" >/dev/null 2>&1; then
  echo "Refusing existing restore volume" >&2; exit 2
fi
chmod 700 "$P105_SECRET_DIR"
openssl rand -hex 32 > "$P105_SECRET_DIR/postgres.password"
printf 'requirepass %s\n' "$(openssl rand -hex 32)" > "$P105_SECRET_DIR/valkey.conf"
# Docker Compose file-based secrets use host bind mounts. On Linux the Valkey
# process runs as an unprivileged user, so a root-owned 0600 config is unreadable.
# Keep the parent directory private (0700) while making only that test config
# readable inside its container. No real or reusable credentials are involved.
chmod 600 "$P105_SECRET_DIR/postgres.password"
chmod 644 "$P105_SECRET_DIR/valkey.conf"
dc config --quiet
dc up -d --wait >/dev/null
echo "PASS: isolated Mac STAGING PostgreSQL + Valkey healthy"
docker exec --user postgres "$P105_SOURCE_CONTAINER" psql --quiet \
  --set ON_ERROR_STOP=1 -d postgres -c \
  "CREATE EXTENSION IF NOT EXISTS vector;
   CREATE TABLE p105_fixture (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
   INSERT INTO p105_fixture VALUES (1,'stage-one'),(2,'stage-two');" >/dev/null
docker exec "$P105_SOURCE_CONTAINER" sh -c \
  'mkdir -p /synthetic-uploads/nested &&
   printf "SYNTHETIC-MAC-STAGING-FILE\n" > /synthetic-uploads/nested/file.txt &&
   printf "fake bytes\n" > /synthetic-uploads/fake-image.bin &&
   printf "p105-synthetic-fixture-v1\n" > /synthetic-uploads/.p105-synthetic-only'
docker exec "$P105_VALKEY_CONTAINER" sh -c \
  'REDISCLI_AUTH=$(sed -n "s/^requirepass //p" /run/secrets/valkey_conf) valkey-cli ping' \
  | grep -q '^PONG$'
echo "PASS: pgvector fixture, staging upload volume, authenticated Valkey"
storage="$work/storage"
mkdir -m 700 "$storage"
docker cp "$P105_SOURCE_CONTAINER:/synthetic-uploads/." "$storage/"
key="$work/restic.password"
openssl rand -hex 32 > "$key"
chmod 600 "$key"
repo="$work/repository"
restic --repo "$repo" --password-file "$key" init >/dev/null
"$(dirname "$0")/backup.sh" "$P105_SOURCE_CONTAINER" "$storage" "$repo" "$key" "$work/backup-stage"
replica="$work/encrypted-replica"
cp -R "$repo" "$replica"
restic --repo "$replica" --password-file "$key" check >/dev/null
rm -rf -- "$repo"
echo "PASS: encrypted Restic repository survived simulated primary loss"
# Change source records/files AFTER the encrypted snapshot.
docker exec --user postgres "$P105_SOURCE_CONTAINER" psql --quiet \
  --set ON_ERROR_STOP=1 -d postgres -c \
  "INSERT INTO p105_fixture VALUES (3,'must-not-restore');" >/dev/null
docker exec "$P105_SOURCE_CONTAINER" sh -c \
  'printf "CHANGED FILE\n" > /synthetic-uploads/nested/file.txt'
docker run -d --rm --name "$restore_container" --network none \
  --memory 512m --cpus 0.6 \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$restore_volume:/synthetic-uploads" \
  pgvector/pgvector:pg17 >/dev/null
ready=no
for n in $(seq 1 45); do
  if docker exec --user postgres "$restore_container" pg_isready -d postgres >/dev/null 2>&1; then
    ready=yes; break
  fi
  sleep 1
done
if test "$ready" != yes; then
  echo "Fresh restore PostgreSQL did not start" >&2; exit 3
fi
"$(dirname "$0")/restore.sh" "$restore_container" "$replica" "$key" "$work/restore"
docker cp "$work/restore/payload/storage/." "$restore_container:/synthetic-uploads/"
rows=$(docker exec --user postgres "$restore_container" psql -At -d postgres \
  -c 'SELECT string_agg(note,chr(44) ORDER BY id) FROM p105_fixture')
if test "$rows" != "stage-one,stage-two"; then
  echo "Restored PostgreSQL differs from original" >&2; exit 3
fi
vector=$(docker exec --user postgres "$restore_container" psql -At -d postgres \
  -c "SELECT count(*) FROM pg_extension WHERE extname='vector'")
if test "$vector" != 1; then
  echo "Restored pgvector extension missing" >&2; exit 3
fi
docker exec "$restore_container" sh -c \
  'grep -qx "SYNTHETIC-MAC-STAGING-FILE" /synthetic-uploads/nested/file.txt'
echo "PASS: independent DB/pgvector and upload-volume recovery"
# Verify pre-existing DEV containers IF this host actually has them.
# GitHub hosted runners are clean and deliberately have no DEV stack.
# Never accept a stopped DEV container as a success on the Mac.
dev_seen=0
for name in colanode-dev-postgres-1 colanode-dev-valkey-1; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker inspect "$name" --format '{{.State.Running}}' | grep -q '^true$'
    dev_seen=$((dev_seen + 1))
  fi
done
if test "$dev_seen" -eq 2; then
  echo "PASS: original Mac DEV PostgreSQL and Valkey remained running"
elif test "$dev_seen" -eq 0; then
  echo "PASS: fresh CI runner has no existing DEV containers to disturb"
else
  echo "Unexpected partial DEV environment; cannot claim isolation" >&2
  exit 3
fi
echo "P1-05 Mac synthetic staging drill PASS; cleanup follows"
