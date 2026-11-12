#!/usr/bin/env bash
# Install disabled-by-default schedule only after live preflight + backup + restore.
set -euo pipefail
umask 077
[[ ${1:-} == --install || ${1:-} == --install-verified ]] || { echo 'Usage: mac-automation-install.sh --install|--install-verified' >&2; exit 2; }
BASE="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HOME/Library/Application Support/ColanodeBackups/p105.env"
[[ -f "$CONFIG" ]] || { echo 'Private configuration missing. Installation refused.' >&2; exit 2; }
[[ ${P105_ALLOW_LOCAL_TEST_ALIAS:-0} != 1 ]] || { echo 'Local test backend cannot be installed as a real schedule' >&2; exit 2; }
"$BASE/mac-offsite-backup.sh" --preflight
if [[ ${1} == --install ]]; then
  "$BASE/mac-offsite-backup.sh" --backup
  "$BASE/mac-offsite-backup.sh" --verify
else
  # Accept recorded evidence only from the past hour, after independent tests.
  # This avoids repeating 18 MiB upload and restore solely to register launchd.
  python3 - "$HOME/Library/Logs/ColanodeBackups/backup.log" <<'PYLOG'
import datetime, pathlib, sys
p=pathlib.Path(sys.argv[1]); now=datetime.datetime.now(datetime.timezone.utc)
assert p.exists(), 'No verified backup/restore log'
valid=[]
for line in p.read_text().splitlines():
    try:
        stamp,message=line.split(' ',1)
        when=datetime.datetime.fromisoformat(stamp.replace('Z','+00:00'))
        if datetime.timedelta(0) <= now-when <= datetime.timedelta(hours=1): valid.append(message)
    except ValueError: pass
assert any('SUCCESS: encrypted synthetic PostgreSQL/files backup + integrity check' in s for s in valid), 'Missing recent encrypted-backup proof'
assert any('SUCCESS: clean off-Mac snapshot restore with' in s for s in valid), 'Missing recent clean restore proof'
print('PASS: recent encrypted backup and independent clean-restore evidence')
PYLOG
fi
# Only now create a launch agent. It uses native local time, once at 03:00.
DEST="$HOME/Library/Application Support/ColanodeBackups/scripts"
mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/ColanodeBackups"
cp "$BASE/mac-offsite-backup.sh" "$BASE/manifest.py" "$DEST/"
chmod 700 "$DEST"; chmod 700 "$DEST/mac-offsite-backup.sh"; chmod 600 "$DEST/manifest.py"
PLIST="$HOME/Library/LaunchAgents/com.hyver.colanode.p105.synthetic-backup.plist"
[[ ! -e "$PLIST" ]] || { echo 'Launch agent already exists. Refusing replacement.' >&2; exit 2; }
python3 - "$PLIST" "$DEST/mac-offsite-backup.sh" "$HOME" <<'PY'
import plistlib,sys
p,script,home=sys.argv[1:]
job={'Label':'com.hyver.colanode.p105.synthetic-backup',
     'ProgramArguments':['/bin/bash',script,'--backup'],
     'StartCalendarInterval':{'Hour':3,'Minute':0},
     'RunAtLoad':False,
     'EnvironmentVariables':{'HOME':home, 'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'},
     'StandardOutPath':home+'/Library/Logs/ColanodeBackups/launchd.out.log',
     'StandardErrorPath':home+'/Library/Logs/ColanodeBackups/launchd.err.log'}
with open(p,'wb') as f:plistlib.dump(job,f)
PY
chmod 600 "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo 'P1-05 synthetic backup schedule installed AFTER successful off-Mac backup+restore.'
