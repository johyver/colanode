#!/usr/bin/env bash
# P6-03: restore the current synthetic preview into a fresh disposable container.
# Never targets a named volume, the original DEV database, or real Notion data.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
source .preview/.env
pg_source="colanode-p201-preview-postgres-1"
suffix="$(date +%Y%m%d%H%M%S)-$$"
restore="colanode-p6-restore-$suffix"
work="$(mktemp -d /tmp/colanode-p6-restore.XXXXXX)"
dump="$work/preview.dump"
cleanup() { docker rm -f "$restore" >/dev/null 2>&1 || true; rm -rf -- "$work"; }
trap cleanup EXIT
umask 077

docker inspect "$pg_source" >/dev/null 2>&1 || { echo 'P6 restore: source preview container missing' >&2; exit 2; }
if docker inspect "$restore" >/dev/null 2>&1; then
  echo 'P6 restore: disposable container name collision; refusing' >&2
  exit 2
fi

docker exec -e PGPASSWORD="$P201_PG_PASSWORD" "$pg_source" \
  pg_dump -U colanode_p201 -d colanode_p201 --format=custom --no-owner --no-acl > "$dump"
[[ -s "$dump" ]] || { echo 'P6 restore: empty dump' >&2; exit 2; }
source_counts="$(docker exec -e PGPASSWORD="$P201_PG_PASSWORD" "$pg_source" \
  psql -U colanode_p201 -d colanode_p201 -At -v ON_ERROR_STOP=1 -c \
  "SELECT 'workspaces='||count(*) FROM workspaces UNION ALL SELECT 'nodes='||count(*) FROM nodes UNION ALL SELECT 'node_updates='||count(*) FROM node_updates UNION ALL SELECT 'agents='||count(*) FROM agents UNION ALL SELECT 'agent_runs='||count(*) FROM agent_runs UNION ALL SELECT 'agent_actions='||count(*) FROM agent_action_ledger UNION ALL SELECT 'mcp_audits='||count(*) FROM mcp_execution_audits ORDER BY 1")"

docker run -d --rm --name "$restore" --network none \
  --memory 768m --cpus 1.0 \
  -e POSTGRES_HOST_AUTH_METHOD=trust pgvector/pgvector:pg17 >/dev/null
ready=no
for _ in $(seq 1 45); do
  if docker exec --user postgres "$restore" pg_isready -d postgres >/dev/null 2>&1; then ready=yes; break; fi
  sleep 1
done
[[ "$ready" == yes ]] || { echo 'P6 restore: disposable PostgreSQL did not become ready' >&2; exit 3; }

docker exec -i --user postgres "$restore" pg_restore --no-owner --no-acl --exit-on-error -d postgres < "$dump"
counts="$(docker exec --user postgres "$restore" psql -At -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM workspaces)||':'||(SELECT count(*) FROM nodes)||':'||(SELECT revision FROM nodes WHERE id='01m784hcjb6je2vmsnyg4ke9pddb')||':'||(SELECT revision FROM nodes WHERE id='01m784hew3058evm7v575ypsr6db')")"
[[ "$counts" == 9:*:1000000066:1000000065 ]] || { echo "P6 restore: reconciled counts/revisions differ: $counts" >&2; exit 4; }
vector="$(docker exec --user postgres "$restore" psql -At -d postgres -c "SELECT count(*) FROM pg_extension WHERE extname='vector'")"
[[ "$vector" == 1 ]] || { echo 'P6 restore: pgvector extension missing' >&2; exit 4; }
restore_counts="$(docker exec --user postgres "$restore" psql -At -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT 'workspaces='||count(*) FROM workspaces UNION ALL SELECT 'nodes='||count(*) FROM nodes UNION ALL SELECT 'node_updates='||count(*) FROM node_updates UNION ALL SELECT 'agents='||count(*) FROM agents UNION ALL SELECT 'agent_runs='||count(*) FROM agent_runs UNION ALL SELECT 'agent_actions='||count(*) FROM agent_action_ledger UNION ALL SELECT 'mcp_audits='||count(*) FROM mcp_execution_audits ORDER BY 1")"
[[ "$source_counts" == "$restore_counts" ]] || { echo 'P6 restore: application metadata counts differ' >&2; diff <(printf '%s\n' "$source_counts") <(printf '%s\n' "$restore_counts") >&2 || true; exit 4; }
echo "P6-03 PASS: preview synthetic database restored into disposable container; application metadata counts, workspace/node counts, P2-02 revisions, and pgvector reconciled"
