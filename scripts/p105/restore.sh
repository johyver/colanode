#!/usr/bin/env bash
# Restore ONLY into a fresh disposable PG container and fresh local folder.
set -euo pipefail
umask 077
die() { echo "P1-05 RESTORE REFUSED: $*" >&2; exit 2; }
[[ $# -eq 4 ]] || die "usage: restore.sh PG_CONTAINER RESTIC_REPO PASSWORD_FILE EMPTY_RESTORE_PATH"
pg_container=$1
repo=$2
password_file=$3
restore_dir=$4
[[ "$P105_ENVIRONMENT" == synthetic ]] || die "P105_ENVIRONMENT=synthetic required"
[[ $pg_container =~ ^colanode-p105-restore-[a-z0-9-]+$ ]] || die "unexpected restore container; protected"
[[ ! -e $restore_dir ]] || die "restore destination already exists; refusing overwrite"
[[ $restore_dir == /tmp/colanode-p105-* || $restore_dir == /private/tmp/colanode-p105-* ]] || die "restore destination must be disposable p105 path"
mkdir -m 700 -- "$restore_dir"
restic --repo "$repo" --password-file "$password_file" restore latest \
  --tag colanode-p105-synthetic --target "$restore_dir" >/dev/null
payload="$restore_dir/payload"
[[ -s $payload/postgres.dump ]] || die "restored database dump missing"
python3 "$(dirname "$0")/manifest.py" verify "$payload"
if docker exec --user postgres "$pg_container" psql --quiet --tuples-only \
  -d postgres -c "SELECT to_regclass('public.p105_fixture') IS NOT NULL" \
  | grep -q ' t'; then
  die "target database is not empty; refusing restore"
fi
docker exec --user postgres -i "$pg_container" pg_restore --no-owner --no-acl \
  --exit-on-error -d postgres < "$payload/postgres.dump"
echo "P1-05: encrypted backup restored and all file hashes verified"
