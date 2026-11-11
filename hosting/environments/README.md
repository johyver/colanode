# P1-05 | Colanode backup, restore and environment separation

PREPARATION ONLY. Neither Synology staging nor production is deployed.
Do not export/import/sync real Notion pages, restart the running Mac
Colanode app, or modify existing Synology Container Manager projects.

## Separation model

| Tier | Intended location | Status | Data and volumes |
| --- | --- | --- | --- |
| DEV | Existing Mac at ~/Projects/colanode-clone and colanode-dev Compose | Running; untouched by P1-05 | Existing disposable dev PostgreSQL and Valkey only |
| STAGING | Proposed Synology project colanode-p105-staging | NO approval or capacity verification | Separate database, Valkey, files, secrets, backups and TLS route |
| PROD | Future separately authorized stack | NOT deployed | Independent database, files, networks and credentials |

The staging candidate blueprint is staging.compose.yaml. It has unique
project volumes, an internal private backend network, no host-published ports,
out-of-Git secret files and non-default approved-staging-only profiles.
Server and web images use invalid registry placeholders deliberately. The
blueprint is NOT deployable as supplied; it needs independently verified
ARM64 immutable image digests, TLS routing, server configuration and an
owner-approved NAS capacity plan.

Candidate NAS paths, NOT CREATED:
- /volume1/colanode-p105/staging/
- /volume1/colanode-p105/staging-secrets/
- /volume1/colanode-p105/staging-backups/

No secret or backup should reside in the Git repository or web root. Existing
DSM projects retain their exact names, paths and services.

## Synology read-only preflight, 2026-11-12

DSM admin API and WebDAV connected, Container Manager 24.0.2-1706 running.
Six existing projects must be preserved:
hostaway-browser, synology-chatgpt-mcp, synology-smb-gateway,
hyver-browser-agent, openclaw-agent and hyver-agent.

SYNO.Core.System.Utilization returned total_real=501548 KiB (about 490 MiB
physical RAM), real_usage=52 to 54 percent, and swap_usage=31 percent.
This is INADEQUATE/UNVERIFIED capacity for another four-service application.
Confirm the NAS model, potential RAM expansion and real available memory
before approving any staging deployment.

Disk I/O utilization was about 98 to 100 percent during sampling; this is
not an indicator of disk space fullness. Actual free volume capacity remains
UNKNOWN because the DSM Storage Volume API returned errors and the Mac's NAS
mount was inaccessible. Never infer capacity from the indexed file sitemap.

Container Manager's offered package has an ARMv8 build. Local Mac
pgvector:pg17 and valkey:8.1 images are linux/arm64; actual NAS server/web
image availability, signatures and digests require verification before
creating a NAS project. No DSM containers, volumes or files were modified.

## Encrypted synthetic recovery test

Run:

    bash scripts/p105/smoke-test.sh

Requirements: Docker daemon, pgvector/pgvector:pg17, Restic, Python 3 and
OpenSSL. The test creates a tiny PostgreSQL source container and a separate
target container with NO published host ports, fake upload files, a temporary
encrypted Restic repository and a random password available only during the
test. It does the following:

1. Create an isolated database with two synthetic rows and pgvector.
2. Dump the database in pg_dump custom format and copy the fake uploaded
   files. Generate a SHA-256 inventory over all payload files.
3. Create an encrypted Restic snapshot, validate the repository and erase
   the temporary plaintext dump.
4. Alter the source database and files AFTER the backup, then restore to
   the new disposable target, confirming the original two rows and vector
   extension are intact.
5. Confirm restored file hashes; deliberately corrupt a file to verify
   tampering is detected; reject overwrite and rejects the existing DEV
   Postgres container as a synthetic backup source.
6. Delete both disposable containers, test folder and random password.

Backup.sh and restore.sh are intentionally SYNTHETIC-ONLY, with guardrails
on container names and temporary paths. They are NOT currently approved
for production or staging content. This prevents the preparation work
from accidentally accessing real records or existing NAS projects.

## Proposed policy: not activated

- Run daily application-consistent encrypted PostgreSQL and upload backups
  once a staging environment is separately approved. Coordinate a quiet
  file/database checkpoint so uploads agree with the database snapshot.
- Suggest 7 daily, 4 weekly and 6 monthly snapshots for discussion. Do not
  enable prune/forget operations before approval, offsite capacity checks
  and a legal/data-retention review.
- Keep an independent encrypted OFF-NAS copy with separate credentials,
  for example a separate owner-controlled SFTP or S3-compatible destination.
  NAS-only backups do not protect from NAS hardware failure.
- Store the Restic password in a restricted secret manager or offline escrow;
  losing it renders encrypted backups unrecoverable. Never print passwords
  in logs or commit them.
- Alert on failed backups and test full clean restore periodically, then
  verify database row counts, attachments and CRDT content consistency.
- Proposed targets (not promises): RPO <= 24 hours and RTO <= 4 hours,
  pending realistic data-volume and recovery-duration measurements.
- Valkey session/cache state and unfinished upload jobs need a separately
  documented recovery policy; database/files alone are not a full
  production disaster-recovery strategy.

## No-go gates before NAS staging deployment

1. Confirm NAS model, physical RAM, CPU/ARM64 details, actual free storage
   and current workloads. Existing Synology projects must not be degraded.
2. Verify the exact container image architectures/digests on the NAS,
   including web and server, and test TLS routing behind a private proxy.
3. Obtain separate approval BEFORE creating NAS folders, credentials,
   networks, containers, volumes, schedules or offsite replication.
4. Implement staging-specific backup commands with app-consistent snapshots,
   configure an off-NAS encrypted destination, and perform an actual
   isolated staging recovery drill.
5. Continue P2-01A CRDT undo/data-loss repair and all other product,
   desktop, responsive, integration and release QA.
6. Obtain a future explicit migration/cutover approval. Until then,
   Notion remains the unchanged source of truth.

The synthetic test proves the recovery mechanism, NOT that Synology hosting,
backups, a go-live, or Notion migration have been completed.
