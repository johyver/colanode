# P7-01 private Mac staging

This is an isolated, synthetic-only Colanode staging stack for the Mac/Colima
host. It is separate from the existing P2-01 preview project.

- UI: `http://127.0.0.1:4500/`
- API: `http://127.0.0.1:3500/config`
- Database and Valkey: internal Docker network only; no host ports
- Compose project: `colanode-p701-staging`
- Volumes: `colanode-p701-staging_p701_postgres_data`,
  `colanode-p701-staging_p701_valkey_data`, `colanode-p701-staging_uploads`
- Credentials: local ignored `.env` and `secrets/` files only
- AI/cloud providers: disabled; no real Notion data or credentials

## Start and stop

```sh
cd hosting/environments/p701-staging
/opt/homebrew/bin/docker-compose --env-file .env -f compose.yaml up -d --build --wait
/opt/homebrew/bin/docker-compose --env-file .env -f compose.yaml ps
/opt/homebrew/bin/docker-compose --env-file .env -f compose.yaml down
```

`down` does not remove volumes. Never use `down -v` for this environment.

## Automatic startup

`service.command` is installed as the user LaunchAgent
`com.hyver.colanode.p701.staging`. It starts the existing Colima profile and
brings up this Compose project after login without touching the P2-01 preview.

## Backup and restore

Use `scripts/p701/backup-restore.sh backup` to create an encrypted Restic
snapshot containing a PostgreSQL dump, upload volume and manifest. The
verified default destination is the dedicated private WebDAV remote folder
`colanode-nas:home/Colanode-Backups/P7-01-Automation/p701-restic`. The Finder
WebDAV mount is read-only on this Mac, so the script uses the existing
authenticated `rclone` remote directly. Override `P701_RESTIC_REPOSITORY`
only with another dedicated off-Mac repository.

Use `scripts/p701/backup-restore.sh restore-test` to restore the newest
snapshot into a fresh disposable PostgreSQL container and temporary upload
directory, then verify hashes and row counts. The test container and temporary
files are removed after verification.
