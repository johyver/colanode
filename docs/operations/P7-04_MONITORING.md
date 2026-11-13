# P7-04 staging monitoring and incident playbook

This is the local operational package for the isolated P7-01 synthetic staging
stack. It is not production monitoring and does not authorize real Notion
migration. Until P7-03 receives an explicit A3 GO, run it only against the
loopback staging and preview endpoints.

## Monitor

Run one read-only cycle:

```sh
scripts/p704/monitor.sh
```

Run a bounded 5-minute check every 30 seconds:

```sh
P704_DURATION_SECONDS=300 P704_INTERVAL_SECONDS=30 scripts/p704/monitor.sh
```

The monitor checks P2-01 and P7-01 HTTP health, the P7-01 login LaunchAgent,
container health, database/Valkey port isolation, staging p95 latency, Docker
resource usage, local Ollama availability, and recent critical job/MCP/agent
log signatures. It only writes disposable reports under `/tmp` unless
`P704_OUTPUT_DIR` is supplied. It never resets volumes, restarts services, or
changes application rows.

## Thresholds and escalation

- Critical: preview or staging web/API failure, missing LaunchAgent, unhealthy
  or restarting service, unexpected database/Valkey host port, or evidence of
  corruption/data loss/OOM. Capture the monitor artifact and stop any pilot
  write activity.
- Warning: staging web/API p95 above 3 seconds, rising resource use, local
  Ollama unavailable, or suspicious job/MCP/agent log lines. Review logs and
  repeat the bounded monitor before resuming synthetic work.
- AI: P7-01 staging has cloud AI disabled. A local Ollama result is not proof
  of cloud spend, paid fallback, or production AI availability. Any cloud
  provider test requires separate authorization and budget evidence.
- Backups: use the existing synthetic-only backup/restore script and its
  dedicated repository. Never use `down -v`, remove named volumes, or restore
  over the live stack.

## Recovery and rollback

1. Preserve the monitor output and timestamp; do not delete logs.
2. Keep the P2-01 preview and P7-01 staging isolated from the original DEV
   environment.
3. For a service-only fault, let the existing
   `com.hyver.colanode.p701.staging` LaunchAgent perform recovery, then rerun
   the monitor.
4. For suspected data or file damage, stop writes and use
   `scripts/p701/backup-restore.sh restore-test` to verify the latest encrypted
   synthetic backup in a disposable PostgreSQL container. Do not overwrite the
   live volumes during diagnosis.
5. For a code regression, keep the current volumes, record the failing commit
   or change, and roll back the staging image/config through the normal Git
   workflow. Re-run build, tests, backup/restore, and the P7-03 preflight.
6. Escalate unresolved critical findings as an A3 NO-GO. Real Notion migration
   remains locked until a separate owner authorization follows full parity and
   recovery evidence.

## Current local boundary

- P2-01 preview: `http://127.0.0.1:4300/`
- P7-01 staging: `http://127.0.0.1:4500/`
- P7-01 API: `http://127.0.0.1:3500/config`
- LaunchAgent: `com.hyver.colanode.p701.staging`
