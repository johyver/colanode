# Colanode P1-05 — Mac-only environments and encrypted recovery

The owner selected the MacBook M5 as the only application host. Neither
Synology nor Windows is a Colanode-hosting requirement. Notion remains
the current source of truth; real-content transfer is strictly prohibited.

## Mac preflight — 2026-11-12

MacBook M5: ARM64, 10 CPU cores, 16 GB physical RAM, macOS 27.2.
Colima is running with 2 vCPU, 4 GB RAM and an 18 GB Docker VM disk.
VM Docker filesystem had about 15 GB free. However the MAC HOST DISK
was 97% used, with just 14 GiB free. Both existing DEV Postgres and
Valkey containers were healthy; DEV API and web returned HTTP 200.

This is insufficient headroom to start a full second Colanode server
and web build responsibly. Do not clean user files, caches, images,
volumes, or other projects without separate authorization.

## Environment separation

DEV: existing Mac checkout, running Colima Postgres + Valkey and locally
running app; DO NOT restart or alter these services.

SYNTHETIC STAGING TEST: temporary Mac/Colima Compose project with
dedicated PostgreSQL/pgvector, Valkey and upload volumes. It uses unique
project and container names, an internal-only Docker network, NO
published ports, generated disposable credential files, and opt-in
synthetic-staging service profiles. PostgreSQL is limited to 512 MiB
RAM and 0.6 CPU; Valkey to 128 MiB and 0.2 CPU. Completely cleaned up
after testing. This is NOT a full Colanode app deployment.

FULL STAGING: future Mac-local web/API/Postgres/Valkey/file stack,
synthetic data only, separate volumes, ports and secrets. NOT deployed
because host storage headroom is insufficient. P7-01 later covers
integrated application staging and restart/persistence verification.

PRIVATE PROD: future separately reviewed Mac deployment, not approved
or running. Isolate it from DEV and STAGING. Do not migrate Notion until
every required application feature, CRDT integrity and QA gate passes
and the user separately approves migration.

## Mac synthetic staging recovery proof

Run from repository root (free Restic, Docker, Compose, Python and
OpenSSL required):

    python3 scripts/p105/verify-mac-staging.py
    bash scripts/p105/mac-staging-drill.sh

The drill creates fresh PostgreSQL+pgvector and authenticated Valkey
containers with no published host ports, plus dedicated Docker volumes
for database, queue and fake uploaded files. It writes fake rows and
files, dumps the fake PostgreSQL DB and copies the synthetic upload
volume to a temporary directory. It encrypts these with Restic and a
SHA-256 inventory, copies the encrypted repo to a second temporary
location, deletes the primary repo, then changes the source data.

Next it restores the original two rows and pgvector extension to a
fresh disposable PostgreSQL container and restores files into a NEW
upload volume, checking hashes and contents. The existing DEV
Postgres and Valkey remain running and unmodified.

Cleanup removes ONLY this run's uniquely named staging volumes,
containers, temporary encrypted snapshots and generated credentials.
The older independent smoke-test.sh also verifies corruption and
overwrite detection. Both are synthetic-only; no real content or
Notion credentials may enter these tests.

The Backup and restore drill CI job must pass both recovery tests
on a clean hosted runner. The staging blueprint lives at
hosting/environments/mac-staging.compose.yaml, and uses placeholder
environment variables with NO credentials in Git.

## Backup policy — PROPOSED, not activated

Daily consistent database/file snapshots, encrypted at rest, with
proposed 7 daily, 4 weekly and 6 monthly retention, full restore
testing and alerts, subject to user review. No destructive retention
pruning or new schedule has been configured.

The Mac is a single failure domain. A second encrypted backup folder
ON THIS SAME MAC is NOT disaster recovery. A separate off-Mac copy
and a clean restore from that physical external drive or another
independent, user-controlled device remain required for P1-05.
No external backup destination was selected or used.

## Hard no-go gates

- Mac host free space remains about 14 GiB (97% used). Verify adequate
  headroom before full integrated staging, AI models or permanent services.
- Off-Mac encrypted backup plus actual external-copy restore unverified.
- Full local Colanode web/API staging unverified; P7-01 is separate.
- P2-01A CRDT undo/data-loss and other application feature/release
  gates still block real Notion data migration.
- The current DEV checkout, services and secrets must remain untouched.
