#!/bin/bash
set -u

ROOT="/Users/johyver/Projects/colanode-p2-01-preview"
STAGE="$ROOT/hosting/environments/p701-staging"
COMPOSE="/opt/homebrew/bin/docker-compose"
LOG_DIR="$STAGE/logs"

mkdir -p "$LOG_DIR"
exec >> "$LOG_DIR/service.log" 2>&1

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"
}

cd "$STAGE"

ensure_colima() {
  if ! colima status >/dev/null 2>&1; then
    log 'Colima is not running; starting the existing default profile'
    colima start default >/dev/null 2>&1 || true
  fi

  for attempt in $(seq 1 30); do
    if colima status >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  log 'Colima did not become ready'
  return 1
}

ensure_stack() {
  log 'Ensuring P7-01 private staging services are running'
  "$COMPOSE" --env-file .env -f compose.yaml up -d --wait
}

while true; do
  if ensure_colima; then
    if ! curl -fsS --max-time 5 http://127.0.0.1:3500/config >/dev/null 2>&1 || \
       ! curl -fsS --max-time 5 http://127.0.0.1:4500/ >/dev/null 2>&1; then
      ensure_stack || log 'Staging recovery attempt failed; retrying'
    fi
  fi
  sleep 30
done
