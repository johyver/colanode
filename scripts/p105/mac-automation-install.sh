#!/usr/bin/env bash
# Install disabled-by-default schedule only after live preflight + backup + restore.
set -euo pipefail
umask 077
[[ ${1:-} == --install ]] || { echo 'Usage: mac-automation-install.sh --install' >&2; exit 2; }
BASE="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$HOME/Library/Application Support/ColanodeBackups/p105.env"
[[ -f "$CONFIG" ]] || { echo 'Private configuration missing. Installation refused.' >&2; exit 2; }
[[ ${P105_ALLOW_LOCAL_TEST_ALIAS:-0} != 1 ]] || { echo 'Local test backend cannot be installed as a real schedule' >&2; exit 2; }
"$BASE/mac-offsite-backup.sh" --preflight
"$BASE/mac-offsite-backup.sh" --backup
"$BASE/mac-offsite-backup.sh" --verify
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
     'StandardOutPath':home+'/Library/Logs/ColanodeBackups/launchd.out.log',
     'StandardErrorPath':home+'/Library/Logs/ColanodeBackups/launchd.err.log'}
with open(p,'wb') as f:plistlib.dump(job,f)
PY
chmod 600 "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo 'P1-05 synthetic backup schedule installed AFTER successful off-Mac backup+restore.'
