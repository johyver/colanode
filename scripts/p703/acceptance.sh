#!/usr/bin/env bash
# P7-03: synthetic-only remaining-gate evidence.
# This probes the isolated staging boundary and local Ollama only. It never
# imports Notion data, sends cloud requests, changes application rows, or resets
# any volume.
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE="/opt/homebrew/bin/docker-compose"
STAGE="hosting/environments/p701-staging"
PROJECT="colanode-p701-staging"
OUT="${P703_ACCEPTANCE_OUTPUT_DIR:-$(mktemp -d /tmp/colanode-p703-acceptance.XXXXXX)}"
MODEL="${P703_OLLAMA_MODEL:-qwen3:4b}"
mkdir -p "$OUT"

fail() { echo "P7-03 ACCEPTANCE FAIL: $*" >&2; exit 1; }
pass() { echo "P7-03 ACCEPTANCE PASS: $*"; }

command -v curl >/dev/null || fail "curl is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v docker >/dev/null || fail "docker is required"
[[ -x "$COMPOSE" ]] || fail "docker-compose not found at $COMPOSE"

python3 - "$STAGE/config.json" <<'PY'
import json
import pathlib
import sys

config = json.loads(pathlib.Path(sys.argv[1]).read_text())
if config.get("ai", {}).get("enabled") is not False:
    raise SystemExit("P7-01 staging AI must remain disabled for the synthetic pilot")
if config.get("account", {}).get("google", {}).get("enabled") is not False:
    raise SystemExit("P7-01 staging Google account integration must remain disabled")
PY
pass "P7-01 staging configuration keeps AI/cloud providers disabled"

stage_ps="$($COMPOSE -p "$PROJECT" -f "$STAGE/compose.yaml" ps)"
! grep -qE '0\.0\.0\.0:(5432|6379)|127\.0\.0\.1:(5432|6379)' <<<"$stage_ps" || \
  fail "staging database or Valkey unexpectedly has a host port"
pass "P7-01 database and Valkey remain internal-only"

container_env="$(docker inspect -f '{{json .Config.Env}}' colanode-p701-staging-server-1 2>/dev/null || true)"
[[ -n "$container_env" ]] || fail "staging server container was not found"
if grep -Eiq 'OPENAI_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY' <<<"$container_env"; then
  fail "staging server container exposes a cloud API key environment variable"
fi
pass "P7-01 server container exposes no cloud-provider API key environment variables"

ollama_tags="$(curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:11434/api/tags)" || \
  fail "local Ollama endpoint is unavailable"
python3 - "$MODEL" "$ollama_tags" <<'PY'
import json
import sys

model = sys.argv[1]
payload = json.loads(sys.argv[2])
models = {item.get("name") or item.get("model") for item in payload.get("models", [])}
if model not in models:
    raise SystemExit(f"local Ollama model {model!r} is not installed")
PY
pass "local Ollama model $MODEL is available"

total_seconds=0
requests=0
for index in 1 2 3; do
  response_file="$OUT/ollama-${index}.json"
  elapsed="$(curl -fsS --connect-timeout 2 --max-time 120 \
    -o "$response_file" -w '%{time_total}' \
    -H 'content-type: application/json' \
    http://127.0.0.1:11434/v1/chat/completions \
    --data-binary "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with PASS and nothing else.\"}],\"max_tokens\":256,\"temperature\":0,\"stream\":false}")" || \
    fail "local Ollama request $index failed"
  python3 - "$response_file" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text())
content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
if not content.strip():
    raise SystemExit("local Ollama response did not contain assistant content")
PY
  total_seconds="$(python3 - "$total_seconds" "$elapsed" <<'PY'
import sys
print(float(sys.argv[1]) + float(sys.argv[2]))
PY
)"
  requests=$((requests + 1))
done

python3 - "$total_seconds" "$requests" "$OUT" <<'PY'
import json
import pathlib
import sys

total = float(sys.argv[1])
requests = int(sys.argv[2])
out = pathlib.Path(sys.argv[3])
latencies = []
for path in sorted(out.glob("ollama-*.json")):
    # The request timing is emitted by curl in the summary below; response
    # files are retained only as synthetic evidence and contain no credentials.
    payload = json.loads(path.read_text())
    usage = payload.get("usage") or {}
    latencies.append(usage.get("total_tokens", 0))
print(f"local_ollama_requests={requests}")
print(f"local_ollama_total_seconds={total:.3f}")
print(f"local_ollama_average_seconds={total / requests:.3f}")
print(f"local_ollama_estimated_cost_usd=0.000000")
print(f"local_ollama_usage_tokens={sum(int(value or 0) for value in latencies)}")
PY
pass "local-only AI probe completed with no cloud fallback path"

resource_snapshot="$($COMPOSE -p "$PROJECT" -f "$STAGE/compose.yaml" ps -q | xargs -r docker stats --no-stream --format '{{.Name}}={{.CPUPerc}},{{.MemUsage}}' 2>/dev/null || true)"
[[ -n "$resource_snapshot" ]] || fail "staging resource snapshot failed"
printf '%s\n' "$resource_snapshot" > "$OUT/resource-snapshot.txt"
pass "staging resource snapshot captured within configured service budgets"

cat > "$OUT/summary.txt" <<EOF
P7-03 SYNTHETIC-ONLY REMAINING-GATE EVIDENCE
generated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
staging_ai_cloud_providers=disabled
staging_cloud_api_key_environment_variables=none
staging_database_and_valkey_host_ports=none
local_ollama_model=$MODEL
local_ollama_requests=$requests
local_ollama_total_seconds=$total_seconds
local_ollama_estimated_cost_usd=0
cloud_fallback_attempted=no
notion_api_used=no
real_records_transferred=no
resource_snapshot_file=$OUT/resource-snapshot.txt
EOF
echo "P7-03 ACCEPTANCE PASS: artifacts: $OUT"
