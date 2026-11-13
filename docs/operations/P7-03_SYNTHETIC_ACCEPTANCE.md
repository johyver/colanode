# P7-03 synthetic-only acceptance evidence

Run `scripts/p703/acceptance.sh` while the isolated P7-01 staging stack and the
local Ollama endpoint are available. The check is fail-closed and does not
contact Notion or cloud AI providers.

It verifies:

- P7-01 keeps AI/cloud providers disabled and exposes no cloud API-key
  environment variables in the staging server container.
- PostgreSQL and Valkey remain internal-only.
- The configured local Ollama model responds successfully three times and is
  recorded as zero estimated cloud cost.
- Staging resource usage is captured against the configured service budgets.

The server acceptance suite additionally verifies that workspace and per-agent
AI budgets reserve the cost of an allowed cloud fallback, that the durable
agent runtime records model usage, and that a denied MCP write produces a
failed agent action plus a denied MCP audit without contacting the external
server.

This evidence does not authorize real Notion migration. A3 approval, full
staging UX/UAT, and any future cloud-provider pilot require separate explicit
authorization.
