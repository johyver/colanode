#!/usr/bin/env bash
# P7-04: read-only local incident monitor for the isolated P7-01 staging stack.
# It never restarts, resets, deletes, or writes application data. The existing
# P7-01 LaunchAgent remains the recovery authority.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE="/opt/homebrew/bin/docker-compose"
STAGE_COMPOSE="hosting/environments/p701-staging/compose.yaml"
STAGE_PROJECT="colanode-p701-staging"
INTERVAL="${P704_INTERVAL_SECONDS:-30}"
DURATION="${P704_DURATION_SECONDS:-0}"
OUT="${P704_OUTPUT_DIR:-$(mktemp -d /tmp/colanode-p704-monitor.XXXXXX)}"
mkdir -p "$OUT"

failures=0
warnings=0

note_failure() { failures=$((failures + 1)); printf 'CRITICAL %s\n' "$*"; }
note_warning() { warnings=$((warnings + 1)); printf 'WARNING %s\n' "$*"; }
note_ok() { printf 'OK %s\n' "$*"; }

measure_p95() {
  local url="$1" count="${2:-10}"
  for _ in $(seq 1 "$count"); do
    curl -fsS --connect-timeout 2 --max-time 5 -o /dev/null -w '%{time_total}\n' "$url" || return 1
  done | sort -n | awk -v n="$count" 'NR==int(n*0.95+0.999) { printf "%.3f", $1; exit }'
}

check_once() {
  local timestamp
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '\n[%s] P7-04 staging monitor cycle\n' "$timestamp"

  local p201_web p201_api p701_web p701_api
  p201_web="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4300/ || printf 000)"
  p201_api="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3300/config || printf 000)"
  p701_web="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:4500/ || printf 000)"
  p701_api="$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3500/config || printf 000)"
  [[ "$p201_web" == 200 && "$p201_api" == 200 ]] && note_ok "P2-01 preview web/API healthy" || note_failure "P2-01 preview web=${p201_web} api=${p201_api}"
  [[ "$p701_web" == 200 && "$p701_api" == 200 ]] && note_ok "P7-01 staging web/API healthy" || note_failure "P7-01 staging web=${p701_web} api=${p701_api}"

  if launchctl print "gui/$(id -u)/com.hyver.colanode.p701.staging" >/dev/null 2>&1; then
    note_ok "P7-01 login recovery LaunchAgent loaded"
  else
    note_failure "P7-01 login recovery LaunchAgent is not loaded"
  fi

  local compose_ps
  compose_ps="$($COMPOSE -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" ps 2>&1 || true)"
  if grep -q 'Up .*healthy' <<<"$compose_ps" && ! grep -qE 'Restarting|unhealthy|Exited' <<<"$compose_ps"; then
    note_ok "all P7-01 services are healthy"
  else
    note_failure "P7-01 service health changed: $compose_ps"
  fi
  if grep -qE '0\.0\.0\.0:5432|0\.0\.0\.0:6379|127\.0\.0\.1:5432|127\.0\.0\.1:6379' <<<"$compose_ps"; then
    note_failure "database or Valkey has an unexpected host port"
  else
    note_ok "database and Valkey remain internal-only"
  fi

  local web_p95 api_p95
  if web_p95="$(measure_p95 http://127.0.0.1:4500/ 10)" && api_p95="$(measure_p95 http://127.0.0.1:3500/config 10)"; then
    note_ok "staging p95 web=${web_p95}s api=${api_p95}s"
    awk -v web="$web_p95" -v api="$api_p95" 'BEGIN { exit !(web <= 3 && api <= 3) }' || note_warning "p95 latency exceeded the 3s pilot threshold"
  else
    note_failure "staging latency probe failed"
  fi

  local resources
  resources="$($COMPOSE -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" ps -q | xargs -r docker stats --no-stream --format '{{.Name}}={{.CPUPerc}},{{.MemUsage}}' 2>/dev/null || true)"
  [[ -n "$resources" ]] && note_ok "resource snapshot captured" || note_failure "resource snapshot unavailable"
  printf '%s\n' "$resources" | tee -a "$OUT/resource-snapshots.log" >/dev/null

  local ollama_status="disabled/unavailable"
  if curl -fsS --connect-timeout 1 --max-time 3 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    ollama_status="local-available"
    note_ok "local Ollama endpoint available; cloud usage not inferred"
  else
    note_warning "local Ollama endpoint unavailable"
  fi

  local log_errors
  log_errors="$($COMPOSE -p "$STAGE_PROJECT" -f "$STAGE_COMPOSE" logs --since 5m 2>/dev/null | grep -Ei 'out of memory|data loss|corrupt|fatal|uncaught|unhandled|job failed|mcp.*(error|failed)|agent.*(error|failed)' | tail -20 || true)"
  if [[ -n "$log_errors" ]]; then
    note_warning "recent suspicious log lines found; review $OUT/monitor.log"
    printf '%s\n' "$log_errors" >> "$OUT/monitor.log"
  else
    note_ok "no monitored critical/error signatures in the last 5 minutes"
  fi

  printf '%s\tweb=%s\tapi=%s\tollama=%s\tfailures=%s\twarnings=%s\n' \
    "$timestamp" "$p701_web" "$p701_api" "$ollama_status" "$failures" "$warnings" >> "$OUT/cycles.tsv"
}

command -v curl >/dev/null || { echo 'curl is required' >&2; exit 2; }
[[ -x "$COMPOSE" ]] || { echo 'docker-compose is required' >&2; exit 2; }
[[ "$INTERVAL" =~ ^[0-9]+$ && "$DURATION" =~ ^[0-9]+$ ]] || { echo 'interval/duration must be integers' >&2; exit 2; }

start="$(date +%s)"
exec > >(tee -a "$OUT/monitor.log") 2>&1
while :; do
  check_once
  [[ "$DURATION" == 0 ]] && break
  elapsed=$(( $(date +%s) - start ))
  (( elapsed >= DURATION )) && break
  sleep "$INTERVAL"
done

if (( failures > 0 )); then
  printf 'P7-04 MONITOR FAIL: critical=%s warning=%s artifacts=%s\n' "$failures" "$warnings" "$OUT" >&2
  exit 1
fi
printf 'P7-04 MONITOR PASS: critical=0 warning=%s artifacts=%s\n' "$warnings" "$OUT"
