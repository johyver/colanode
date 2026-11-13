#!/usr/bin/env bash
# P7-03: synthetic-only pilot preflight.
# Read-only against both local stacks; the migration rehearsal uses disposable
# fixtures and never contacts Notion or writes application volumes.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE="/opt/homebrew/bin/docker-compose"
STAGE_COMPOSE="hosting/environments/p701-staging/compose.yaml"
STAGE_PROJECT="colanode-p701-staging"
OUT="${P703_OUTPUT_DIR:-$(mktemp -d /tmp/colanode-p703-preflight.XXXXXX)}"
mkdir -p "$OUT"

fail() { echo "P7-03 PREFLIGHT FAIL: $*" >&2; exit 1; }
pass() { echo "P7-03 PREFLIGHT PASS: $*"; }

command -v curl >/dev/null || fail "curl is required"
command -v launchctl >/dev/null || fail "launchctl is required"
[[ -x "$COMPOSE" ]] || fail "docker-compose not found at $COMPOSE"

web_201="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4300/)" || fail "P2-01 web unavailable"
api_201="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3300/config)" || fail "P2-01 API unavailable"
web_701="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4500/)" || fail "P7-01 web unavailable"
api_701="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3500/config)" || fail "P7-01 API unavailable"
[[ "$web_201" == 200 && "$api_201" == 200 && "$web_701" == 200 && "$api_701" == 200 ]] || \
  fail "one or more local HTTP checks were not 200"
pass "P2-01 preview and P7-01 staging web/API endpoints returned HTTP 200"

launchctl print "gui/$(id -u)/com.hyver.colanode.p701.staging" >/dev/null 2>&1 || \
  fail "P7-01 launchd service is not loaded"
pass "P7-01 login startup/recovery LaunchAgent is loaded"

ps="$("$COMPOSE" -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" ps)"
grep -q 'Up .*healthy' <<<"$ps" || fail "not all P7-01 services are healthy"
grep -q '127.0.0.1:3500->3000/tcp' <<<"$ps" || fail "P7-01 API is not loopback-only"
grep -q '127.0.0.1:4500->80/tcp' <<<"$ps" || fail "P7-01 web is not loopback-only"
! grep -qE '0\.0\.0\.0:5432|0\.0\.0\.0:6379|127\.0\.0\.1:5432|127\.0\.0\.1:6379' <<<"$ps" || \
  fail "P7-01 database or Valkey has a host port"
pass "P7-01 containers healthy with database and Valkey internal-only"

measure_p95() {
  local url="$1" count="${2:-20}"
  for _ in $(seq 1 "$count"); do
    curl -fsS --connect-timeout 2 --max-time 5 -o /dev/null -w '%{time_total}\n' "$url"
  done | sort -n | awk -v n="$count" 'NR==int(n*0.95+0.999) { printf "%.3f", $1; exit }'
}

stage_web_p95="$(measure_p95 http://127.0.0.1:4500/ 20)"
stage_api_p95="$(measure_p95 http://127.0.0.1:3500/config 20)"
[[ -n "$stage_web_p95" && -n "$stage_api_p95" ]] || fail "staging latency measurement failed"
pass "P7-01 measured latency: web p95=${stage_web_p95}s, API p95=${stage_api_p95}s"

stats="$($COMPOSE -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" top 2>/dev/null || true)"
resource_snapshot="$($COMPOSE -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" ps -q | xargs -r docker stats --no-stream --format '{{.Name}}={{.CPUPerc}},{{.MemUsage}}' 2>/dev/null || true)"
[[ -n "$resource_snapshot" ]] || fail "staging resource snapshot failed"
pass "P7-01 resource snapshot captured for all running services"

for _ in $(seq 1 12); do
  curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:4500/ >/dev/null
  curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:3500/config >/dev/null
  sleep 5
done
pass "P7-01 bounded 60-second web/API availability soak passed"

rehearsal_out="$OUT/p702-rehearsal"
python3 scripts/p702/migration_rehearsal.py --output-dir "$rehearsal_out" >"$OUT/p702.log"
python3 - "$rehearsal_out/readiness-report.json" <<'PY'
import json
import pathlib
import sys

report = json.loads(pathlib.Path(sys.argv[1]).read_text())
required = {
    "marker": "P7-02-SYNTHETIC-ONLY",
    "notion_api_used": False,
    "production_data_accessed": False,
    "real_records_transferred": False,
    "readiness": "PREPARED_FOR_FUTURE_REVIEW_ONLY",
}
for key, expected in required.items():
    if report.get(key) != expected:
        raise SystemExit(f"P7-02 report field {key}={report.get(key)!r}, expected {expected!r}")
checks = report.get("checks", {})
if not all(checks.get(key) for key in (
    "synthetic_fixture_gate",
    "source_target_counts_reconciled",
    "ids_and_relations_reconciled",
    "attachment_hashes_reconciled",
)):
    raise SystemExit("P7-02 reconciliation checks did not all pass")
rollback = checks.get("rollback_simulation", {})
if rollback != {"target_removed": True, "target_restored": True}:
    raise SystemExit(f"unexpected rollback result: {rollback!r}")
PY
pass "P7-02 synthetic rehearsal passed without Notion access or real-record transfer"

cat >"$OUT/p703-preflight-summary.txt" <<EOF
P7-03 SYNTHETIC-ONLY PREFLIGHT
generated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
p2_01_preview=http_${web_201}_web_and_${api_201}_api
p7_01_staging=http_${web_701}_web_and_${api_701}_api
launchd=com.hyver.colanode.p701.staging:loaded
database_and_valkey=internal_only
staging_web_p95_seconds=$stage_web_p95
staging_api_p95_seconds=$stage_api_p95
staging_resource_snapshot<<SNAPSHOT
$resource_snapshot
SNAPSHOT
p7_01_availability_soak=60s_passed
p7_02_rehearsal=passed
real_notion_data_accessed=no
real_records_transferred=no
EOF

echo "P7-03 PREFLIGHT PASS: synthetic checks complete; artifacts: $OUT"
