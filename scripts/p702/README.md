# P7-02 synthetic migration rehearsal

This directory contains the migration-preparation harness for P7-02. It is
intentionally disconnected from Notion and from the running Colanode DEV and
P7-01 environments.

## Run

```sh
python3 scripts/p702/migration_rehearsal.py --output-dir /tmp/colanode-p702-rehearsal
```

The harness refuses to overwrite an existing rehearsal directory. It creates
fabricated page/database-row records and text attachments, maps source IDs to
target IDs, validates parent and cross-record relations, compares attachment
SHA-256 hashes, simulates deleting and restoring the target from a disposable
rollback snapshot, and writes `readiness-report.json` and
`readiness-report.md`.

The script has no Notion SDK, network client, production input flag, or import
path. The synthetic marker is checked at every processing boundary. A passing
run is migration preparation evidence only; it is not approval to export real
Notion data, import records, enable sync, or cut over.

## Future source-to-target design

1. Read a user-approved, versioned source export into an isolated staging
   workspace after the migration lock is explicitly lifted.
2. Normalize stable source IDs, page/database types, properties, parent links,
   relations, and attachment metadata into a versioned intermediate manifest.
3. Create target records in dependency order, persist a source-to-target ID
   map, then resolve parent and relation edges in a second pass.
4. Copy attachments to a quarantined target area and require SHA-256 equality
   before publishing references.
5. Reconcile source/target counts, IDs, relations, properties, page links and
   file hashes; stop on any mismatch.
6. Snapshot the target before cutover and provide a tested reverse mapping and
   restore procedure. Production cutover still requires separate owner
   approval and a completed readiness review.
