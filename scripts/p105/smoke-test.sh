#!/usr/bin/env bash
# Disposable and encrypted backup -> destructive source change -> isolated restore.
# Never uses Colanode's existing database, named Docker volumes, or NAS shares.
set -euo pipefail
umask 077
export P105_ENVIRONMENT=synthetic
for binary in docker restic python3 openssl; do
  command -v "$binary" >/dev/null || { echo "missing $binary" >&2; exit 2; }
done
work=$(mktemp -d /tmp/colanode-p105-smoke.XXXXXXXX)
suffix=$(basename "$work" | tr -cd 'a-z0-9')
src="colanode-p105-source-$suffix"
dst="colanode-p105-restore-$suffix"
cleanup() {
  docker rm --force "$src" "$dst" >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
if docker container inspect "$src" >/dev/null 2>&1 ||
   docker container inspect "$dst" >/dev/null 2>&1; then
  echo "Disposable container name already exists. Refusing." >&2
  exit 2
fi
repo="$work/repo"
key="$work/restic.password"
storage="$work/storage"
restore="$work/restore"
mkdir -m 700 "$storage" "$storage/nested"
printf 'SYNTHETIC-P105-TEST-FILE\n' > "$storage/nested/fixture.txt"
printf 'Fake image bytes, not real user data\n' > "$storage/image.bin"
printf 'p105-synthetic-fixture-v1\n' > "$storage/.p105-synthetic-only"
openssl rand -hex 32 > "$key"
chmod 600 "$key"
restic --repo "$repo" --password-file "$key" init >/dev/null

start_pg() {
  local name=$1
  docker run -d --rm --name "$name" --network none \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    pgvector/pgvector:pg17 >/dev/null
  local i
  for i in $(seq 1 45); do
    if docker exec --user postgres "$name" pg_isready -d postgres >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo "Disposable PostgreSQL did not become healthy: $name" >&2
  exit 2
}
start_pg "$src"
docker exec --user postgres "$src" psql --quiet --set ON_ERROR_STOP=1 \
  -d postgres -c "CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE p105_fixture (id INTEGER PRIMARY KEY, note TEXT NOT NULL);
    INSERT INTO p105_fixture VALUES (1,'synthetic-one'),(2,'synthetic-two');" >/dev/null

"$(dirname "$0")/backup.sh" "$src" "$storage" "$repo" "$key" "$work/scratch"
# Exercise an independent encrypted backup copy. This is only a local
# simulation, NOT a real configured off-NAS destination.
replica="$work/encrypted-replica"
cp -R "$repo" "$replica"
restic --repo "$replica" --password-file "$key" check >/dev/null
rm -rf -- "$repo"
echo 'P1-05: restore repository survives loss of synthetic primary copy PASS'
# Simulate a destructive source change AFTER the encrypted backup.
docker exec --user postgres "$src" psql --quiet --set ON_ERROR_STOP=1 \
  -d postgres -c "INSERT INTO p105_fixture VALUES (3,'should-not-be-restored');" >/dev/null
printf 'Source file changed after backup\n' > "$storage/nested/fixture.txt"

start_pg "$dst"
"$(dirname "$0")/restore.sh" "$dst" "$replica" "$key" "$restore"
restored_count=$(docker exec --user postgres "$dst" psql --quiet --tuples-only \
  --no-align -d postgres -c "SELECT count(*) FROM p105_fixture" | tr -d '[:space:]')
[[ "$restored_count" == 2 ]] || { echo "Incorrect restored row count" >&2; exit 3; }
restored_rows=$(docker exec --user postgres "$dst" psql --quiet --tuples-only \
  --no-align -d postgres -c "SELECT string_agg(note,',' ORDER BY id) FROM p105_fixture" | tr -d '[:space:]')
[[ "$restored_rows" == 'synthetic-one,synthetic-two' ]] || { echo "Restored SQL values wrong" >&2; exit 3; }
grep -qx 'SYNTHETIC-P105-TEST-FILE' "$restore/payload/storage/nested/fixture.txt"
docker exec --user postgres "$dst" psql --quiet --tuples-only \
  -d postgres -c "SELECT count(*) FROM pg_extension WHERE extname='vector'" | grep -q 1
echo 'P1-05: PostgreSQL rows, pgvector extension and encrypted file restore PASS'
# Prove file-content corruption is detectable after restoring.
printf 'tampered\n' >> "$restore/payload/storage/nested/fixture.txt"
if python3 "$(dirname "$0")/manifest.py" verify "$restore/payload" >/dev/null 2>&1; then
  echo 'Tampered file was not detected' >&2
  exit 3
fi
echo 'P1-05: restored file tampering rejected PASS'
# Prove an existing destination cannot be overwritten.
if "$(dirname "$0")/restore.sh" "$dst" "$replica" "$key" "$restore" >/dev/null 2>&1; then
  echo 'Restore overwrite guard failed' >&2
  exit 3
fi
# Prove existing Colanode DEV PostgreSQL is never eligible as synthetic source.
if "$(dirname "$0")/backup.sh" colanode-dev-postgres-1 \
   "$storage" "$repo" "$key" "$work/other-scratch" >/dev/null 2>&1; then
  echo 'Protected DEV container was accepted as synthetic source' >&2
  exit 3
fi
echo 'P1-05: no-overwrite and real DEV container protection PASS'
echo 'P1-05: disposable, encrypted backup and recovery drill PASSED'
