#!/usr/bin/env bash
# P1-05 prototype. All inputs MUST be disposable synthetic fixtures.
set -euo pipefail
umask 077
die() { echo "P1-05 BACKUP REFUSED: $*" >&2; exit 2; }
[[ $# -eq 5 ]] || die "usage: backup.sh PG_CONTAINER SYNTHETIC_STORAGE_DIR RESTIC_REPO PASSWORD_FILE SCRATCH_DIR"
pg_container=$1
storage_dir=$2
repo=$3
password_file=$4
scratch_dir=$5
[[ "$P105_ENVIRONMENT" == synthetic ]] || die "P105_ENVIRONMENT=synthetic required"
[[ $pg_container =~ ^colanode-p105-source-[a-z0-9-]+$ ]] || die "unexpected source container; protected"
[[ -d $storage_dir && -f $storage_dir/.p105-synthetic-only ]] || die "fixture marker missing"
[[ -f $password_file ]] || die "Restic password file missing"
[[ -d $repo && -d $repo/data ]] || die "Restic repo must already be initialized"
[[ ! -e $scratch_dir ]] || die "scratch destination already exists; refusing overwrite"
[[ $scratch_dir == /tmp/colanode-p105-* || $scratch_dir == /private/tmp/colanode-p105-* ]] || die "scratch must use disposable p105 path"
[[ $storage_dir == /tmp/colanode-p105-* || $storage_dir == /private/tmp/colanode-p105-* ]] || die "synthetic source must be under temporary p105 path"
mkdir -m 700 -- "$scratch_dir"
payload="$scratch_dir/payload"
mkdir -m 700 -- "$payload" "$payload/storage"
cp -R "$storage_dir/." "$payload/storage/"
echo 'p105-synthetic-fixture-v1' > "$payload/.p105-synthetic-only"
docker exec --user postgres "$pg_container" pg_dump --format=custom --no-owner --no-acl -d postgres > "$payload/postgres.dump"
[[ -s "$payload/postgres.dump" ]] || die "database dump is empty"
python3 "$(dirname "$0")/manifest.py" generate "$payload"
(
  cd "$scratch_dir"
  restic --repo "$repo" --password-file "$password_file" backup payload \
    --tag colanode-p105-synthetic --tag pg-and-files >/dev/null
)
rm -rf -- "$scratch_dir"
restic --repo "$repo" --password-file "$password_file" check --read-data-subset=10% >/dev/null
echo "P1-05: encrypted synthetic backup snapshot and integrity check passed"
