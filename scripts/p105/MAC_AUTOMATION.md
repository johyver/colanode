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
3. A dedicated synthetic staging fixture must be running/persistent. The
   existing ephemeral Mac drill intentionally destroys its own source and
   therefore **cannot** be scheduled as-is.
4. Copy `mac-automation-config.example` to
   `$HOME/Library/Application Support/ColanodeBackups/p105.env`, substitute
   the exact synthetic source and destination, `chmod 600` the config, and
   never include any passwords in it.
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
  The agent is not installed by merely creating these code files.

## Retention and recovery

Proposed retention: 7 daily, 4 weekly, 6 monthly. No pruning or deletion
is enabled; the owner must approve disk budget, automated retention, and
separate tested recovery evidence before adding it. Review backup logs at
`~/Library/Logs/ColanodeBackups`. macOS notifications are best-effort only;
independent NAS missed-backup alerting remains a separate hardening item.

No real Notion migration or production cutover is authorized by P1-05.
