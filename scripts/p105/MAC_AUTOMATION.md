# P1-05 off-Mac encrypted automation — synthetic-only, activation gated

The owner confirmed a separate password-manager copy of the synthetic Restic
key. Do not copy passwords into this repository, Notion, ChatGPT, or NAS.
A second-device vault check is owner-reported, not yet independently restore-tested.

**Safety:** this implementation is for a dedicated persistent *synthetic*
P1-05 source only, never actual Notion or existing Colanode DEV content.
The source container name, temporary source directory and fixture marker
are required. All recoveries create an isolated PostgreSQL container with
no network or host ports. Existing Colanode databases and NAS data are untouched.

## Required owner-controlled one-time setup

1. In a local Mac Terminal, run `rclone config` and create WebDAV remote
   `colanode-nas` with URL `https://files.hyverstudio.com/`, vendor `other`,
   and a dedicated NAS account permitted only on `home/Colanode-Backups`.
   Enter NAS credentials *in Terminal only*. Never paste them into chat.
   Restrict local Rclone configuration permissions and test the remote with
   `rclone lsf colanode-nas:home/Colanode-Backups/`.
2. Maintain the synthetic Restic key under the local Mac Keychain service
   `Colanode-P1-05-Synology-Synthetic-Restic`. The independent password-manager
   vault must be retrievable from another device without access to this Mac.
3. Prepare a durable isolated synthetic staging fixture using
   `./mac-synthetic-source.sh --prepare` exactly once. The script refuses
   existing Docker volume/container/storage, creates only fake data,
   publishes no ports, and writes a 0600 configuration. Do not reuse DEV.
   The earlier ephemeral Mac drill still destroys its own source.
4. The synthetic-source prepare script writes the private configuration
   `$HOME/Library/Application Support/ColanodeBackups/p105.env` (0600).
   `mac-automation-config.example` is available for review; never put a
   password into the configuration.
5. Independently initialize a **new**, empty encrypted repository in a
   dedicated subfolder with Restic (using the Keychain password command),
   after verifying the folder is empty. The script intentionally refuses
   to initialize/overwrite a repository itself.

## Commands (from this scripts/p105 directory)

- `./mac-offsite-backup.sh --preflight` validates remote, Keychain, running
  synthetic source and existing encrypted repository without writing data.
- `./mac-offsite-backup.sh --backup` creates a DB dump + uploads manifest,
  encrypts directly into a Restic repository accessed through Rclone (no
  mounted WebDAV path and no 15 MB connector upload limit), verifies the
  repository and removes disposable plaintext staging files.
- `./mac-offsite-backup.sh --verify` downloads a snapshot from the remote,
  checks SHA-256 of restored files, and restores PostgreSQL/pgvector in a new
  disposable container. It does not require the source DB to be running.
- `./mac-automation-install.sh --install` ONLY installs a 03:00 local-time
  launchd agent when all of preflight, backup, and independent restore PASS.
  `--install-verified` uses the last hour of recorded backup and clean-restore
  results plus fresh preflight, avoiding an unnecessary repeated large transfer.
  The agent is not installed by merely creating these code files.

## Retention and recovery

Proposed retention: 7 daily, 4 weekly, 6 monthly. No pruning or deletion
is enabled; the owner must approve disk budget, automated retention, and
separate tested recovery evidence before adding it. Review backup logs at
`~/Library/Logs/ColanodeBackups`. macOS notifications are best-effort only;
independent NAS missed-backup alerting remains a separate hardening item.

No real Notion migration or production cutover is authorized by P1-05.

## P1-05 foundation operational hardening — 2026-11-12

For the **dedicated synthetic-only** Restic repo, `mac-retention.sh` verifies the
exact immutable repo ID and Synology WebDAV backend, checks recent backup and
restore evidence, and applies 7 daily / 4 weekly / 3 monthly retention with a
48-hour minimum preservation window, grouped by tags (not ephemeral temp path).
The `--preview` mode does not mutate files; `--apply` includes `restic prune`
and a new repository-integrity check. No real application data is allowed.

`mac-maintenance-install.sh --install` adds two macOS LaunchAgents (after a
successful policy dry run): synthetic-only retention every **Sunday at 04:00**
and a clean off-Mac recovery drill on the **first of each month at 05:00**.
The already-installed daily backup at **03:00** remains separate.

An independent ChatGPT condition monitor checks the live Synology encrypted
snapshot folder daily at 05:00 and alerts if a backup is missed/unreachable.
This alert only proves snapshot freshness, *not* that the archived data restores.

The password-manager escrow and second-device access were confirmed by the
owner; password material is never committed, sent to Notion, or uploaded to NAS.
A restore explicitly using the separate password-manager-retrieved key (rather
than Mac Keychain) remains a future recovery drill before any real-data
production use. Synology free volume capacity and eventual integrated app/live
backup consistency must be reverified before migration or production reliance.
