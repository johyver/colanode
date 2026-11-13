# P7-02 readiness boundary

P7-02 is migration preparation only. Existing Notion remains the source of
truth. No real Notion records, files, credentials, exports, sync, or cutover
are part of this implementation.

The executable rehearsal is
`[scripts/p702/migration_rehearsal.py](../../scripts/p702/migration_rehearsal.py)`.
It generates a synthetic source manifest, maps it into a Colanode-shaped target
manifest, verifies counts and relations, compares attachment SHA-256 hashes,
and simulates target rollback from a disposable snapshot. It has no network or
Notion client and refuses to overwrite an existing rehearsal directory.

The future cutover remains gated on full feature parity, security/data-loss QA,
offline/CRDT and permissions validation, backup/restore evidence, a successful
synthetic rehearsal, and a new explicit owner approval for real migration.
