#!/usr/bin/env bash
# P1-05: fixed synthetic-only encrypted repository; no production credentials/data.
set -Eeuo pipefail
umask 077
MODE=${1:-}
[[ $MODE == --preview || $MODE == --apply ]] || { echo 'Usage: mac-retention.sh --preview|--apply' >&2; exit 2; }
ROOT="$HOME/Library/Application Support/ColanodeBackups"
CONFIG="$ROOT/p105.env"
LOG="$HOME/Library/Logs/ColanodeBackups/backup.log"
LOCK_DIR="$HOME/Library/Logs/ColanodeBackups/backup.lockdir"
REPO='rclone:colanode-nas:home/Colanode-Backups/P1-05-Automation/synthetic'
EXPECTED_ID='d7cf68642e5e7d40ff9d8789e20bd5a1e1e778e711a84c12b172f086d458fef8'
[[ -f "$CONFIG" && ! -L "$CONFIG" && $(stat -f %Lp "$CONFIG") == 600 ]] || { echo 'Secure synthetic config missing' >&2; exit 2; }
# shellcheck source=/dev/null
source "$CONFIG"
[[ ${P105_ENVIRONMENT:-} == synthetic && ${P105_REMOTE_REPOSITORY:-} == "$REPO" ]] || { echo 'Retention refused: not dedicated synthetic NAS repository' >&2; exit 2; }
[[ ${P105_SOURCE_CONTAINER:-} == colanode-p105-source-scheduled ]] || { echo 'Retention refused: source identity mismatch' >&2; exit 2; }
BACKEND=$(rclone config show colanode-nas 2>/dev/null | awk '$1=="type" && $2=="=" {print $3;exit}')
URL=$(rclone config show colanode-nas 2>/dev/null | awk '$1=="url" && $2=="=" {print $3;exit}')
[[ "$BACKEND" == webdav && ( "$URL" == 'https://files.hyverstudio.com/' || "$URL" == 'https://files.hyverstudio.com' ) ]] || { echo 'Retention refused: unexpected NAS backend' >&2; exit 2; }
export RESTIC_PASSWORD_COMMAND='security find-generic-password -s Colanode-P1-05-Synology-Synthetic-Restic -w'
export RESTIC_REPOSITORY="$REPO"
ID=$(restic cat config | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
[[ "$ID" == "$EXPECTED_ID" ]] || { echo 'Retention refused: repository ID mismatch' >&2; exit 2; }
N=$(restic snapshots --json | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
(( N >= 2 )) || { echo 'Retention refused: fewer than two snapshots' >&2; exit 2; }
python3 - "$LOG" <<'PY'
import datetime,pathlib,sys
p=pathlib.Path(sys.argv[1])
now=datetime.datetime.now(datetime.timezone.utc)
assert p.is_file(),'Missing backup/restore audit log'
lines=p.read_text().splitlines()
for term in ['SUCCESS: encrypted synthetic PostgreSQL/files backup + integrity check', 'SUCCESS: clean off-Mac snapshot restore']:
    recent=False
    for line in lines:
        if term not in line: continue
        try:
            timestamp=datetime.datetime.fromisoformat(line.split(' ',1)[0].replace('Z','+00:00'))
            if datetime.timedelta(0) <= now-timestamp <= datetime.timedelta(days=32): recent=True
        except (IndexError,ValueError): pass
    assert recent,f'Missing recent verification: {term}'
PY
ARGS=(--group-by tags --tag colanode-p105-synthetic --keep-within 48h --keep-daily 7 --keep-weekly 4 --keep-monthly 3)
if [[ $MODE == --preview ]]; then
  restic forget --dry-run "${ARGS[@]}"
  echo 'PREVIEW PASS: 7 daily, 4 weekly, 3 monthly plus 48-hour buffer; no deletion'
else
  if ! mkdir -m 700 "$LOCK_DIR" 2>/dev/null; then echo 'Another backup/retention is running' >&2; exit 2; fi
  trap 'rc=$?; rmdir "$LOCK_DIR" 2>/dev/null || true; if ((rc != 0)); then /usr/bin/osascript -e '\''display notification "Synthetic Colanode retention failed" with title "Colanode Backup"'\'' >/dev/null 2>&1 || true; fi' EXIT
  restic forget "${ARGS[@]}" --prune
  restic check >/dev/null
  printf '%s SUCCESS: dedicated synthetic repository retention (7 daily/4 weekly/3 monthly, protect 48h) and integrity check\n' "$(date -u +%FT%TZ)" >> "$LOG"
  echo 'RETENTION PASS: synthetic repository only, restored-backup evidence and encrypted repository check verified'
fi
