#!/usr/bin/env bash
# Adds separately scheduled weekly synthetic retention and monthly recovery drill.
set -Eeuo pipefail
umask 077
[[ ${1:-} == --install ]] || { echo 'Usage: mac-maintenance-install.sh --install' >&2; exit 2; }
SRC="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HOME/Library/Application Support/ColanodeBackups/scripts"
[[ -x "$ROOT/mac-offsite-backup.sh" ]] || { echo 'Backup agent not installed' >&2; exit 2; }
"$SRC/mac-retention.sh" --preview >/dev/null
p1="$HOME/Library/LaunchAgents/com.hyver.colanode.p105.synthetic-retention.plist"
p2="$HOME/Library/LaunchAgents/com.hyver.colanode.p105.synthetic-restore-drill.plist"
[[ ! -e "$p1" && ! -e "$p2" ]] || { echo 'A maintenance job already exists; refusing replacement' >&2; exit 2; }
cp "$SRC/mac-retention.sh" "$ROOT/mac-retention.sh"
chmod 700 "$ROOT/mac-retention.sh"
python3 - "$p1" "$p2" "$ROOT" "$HOME" <<'PY'
import plistlib,sys
p1,p2,root,home=sys.argv[1:]
for filename,label,cmd,args,schedule in [
(p1,'com.hyver.colanode.p105.synthetic-retention','mac-retention.sh',['--apply'],{'Weekday':0,'Hour':4,'Minute':0}),
(p2,'com.hyver.colanode.p105.synthetic-restore-drill','mac-offsite-backup.sh',['--verify'],{'Day':1,'Hour':5,'Minute':0})]:
    job={'Label':label,'ProgramArguments':['/bin/bash',root+'/'+cmd,*args],
         'StartCalendarInterval':schedule,'RunAtLoad':False,
         'EnvironmentVariables':{'HOME':home,'PATH':'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'},
         'StandardOutPath':home+'/Library/Logs/ColanodeBackups/'+cmd+'.out.log',
         'StandardErrorPath':home+'/Library/Logs/ColanodeBackups/'+cmd+'.err.log'}
    with open(filename,'wb') as f:plistlib.dump(job,f)
PY
chmod 600 "$p1" "$p2"
launchctl bootstrap "gui/$(id -u)" "$p1"
launchctl bootstrap "gui/$(id -u)" "$p2"
echo 'Installed weekly synthetic-only retention and monthly clean restore schedules'
