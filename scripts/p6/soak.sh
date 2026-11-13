#!/usr/bin/env bash
# P6-05: local 60-minute crash/OOM-free availability soak.
# Read-only: checks localhost endpoints and existing preview container health.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
duration="${1:-3600}"
interval="${2:-10}"
[[ "$duration" =~ ^[0-9]+$ && "$interval" =~ ^[0-9]+$ && "$interval" -gt 0 ]] || { echo 'usage: soak.sh [seconds] [interval]' >&2; exit 2; }
start="$(date +%s)"
checks=0
while :; do
  now="$(date +%s)"
  elapsed=$((now-start))
  (( elapsed >= duration )) && break
  curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:4300/ >/dev/null || { echo "P6-05 FAIL: web unavailable at ${elapsed}s" >&2; exit 1; }
  curl -fsS --connect-timeout 2 --max-time 4 http://127.0.0.1:3300/config >/dev/null || { echo "P6-05 FAIL: API unavailable at ${elapsed}s" >&2; exit 1; }
  for container in colanode-p201-preview-postgres-1 colanode-p201-preview-valkey-1; do
    state="$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || true)"
    [[ "$state" == running ]] || { echo "P6-05 FAIL: $container state=$state at ${elapsed}s" >&2; exit 1; }
  done
  checks=$((checks+1))
  sleep "$interval"
done
echo "P6-05 PASS: ${duration}s localhost API/web and Postgres/Valkey availability soak completed with ${checks} checks"
