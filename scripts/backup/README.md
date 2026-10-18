# Weekly backup

Every Sunday at 05:23 UTC, GitHub copies the real project's database and every stored file into one dated folder in the private R2 bucket `psyalliance-backups`:

```
psyalliance-backups/
  2026-10-18/
    db/roles.sql, db/schema.sql, db/data.sql   Supabase's documented dump
    db/manifest.txt                            counts and checksums
    files/avatars/...                          every stored file, by bucket
    files/documents/...
```

- **Complete backups only:** a folder is a complete backup only if it has `db/manifest.txt`.
  - A rerun on the same day deletes that file before doing anything else.
  - It is uploaded on its own, last, after the files have been compared byte for byte with Storage, every file record in the dump has been found in the copy, and the uploaded dump has been compared with the original.
  - A run that stops partway therefore leaves a folder without it.
- **Timing:** the dump and the file copy are taken a minute or two apart, not at one instant. The check above means no file record is restored without its file. A file uploaded in between is copied without a record and does no harm.
- **Retention:** the last 12 weeks are kept. Older folders are removed only after a new backup has succeeded.
- **Failures:** a failed run leaves older backups untouched, and GitHub emails whoever last changed the workflow.
- **Manual run:** Actions > Weekly backup > Run workflow.

Workflow: `.github/workflows/backup.yml`. Script: `weekly.sh`.

## Secrets (GitHub > Settings > Secrets and variables > Actions)

| Secret | Where it comes from |
|---|---|
| `SUPABASE_DB_URL` | Supabase (real project) > Connect > **Session pooler** connection string, with the database password filled in. GitHub can't reach the direct connection. |
| `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY` | Supabase (real project) > Storage settings, S3 connection section > New access key. These keys can read and write every bucket, so they live only in GitHub secrets. |
| `R2_ACCOUNT_ID` | Cloudflare > R2 overview (Account ID). |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare > R2 > Manage API tokens > Create API token: Object Read & Write, this bucket only. |

## Restoring

Within 7 days of a problem, restore the database from Supabase itself (Database > Backups). Then compare the stored files with the latest backup here, and copy back any that are missing (step 3).

For anything older, or if the project is lost:

1. **Download a complete backup** (one with `db/manifest.txt`). Set the same `RCLONE_CONFIG_R2_*` values as the workflow in your terminal, then run:
   ```
   rclone copy r2:psyalliance-backups/2026-10-18 ./restore
   ```
2. **Restore the database** into a new Supabase project, as in Supabase's [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore):
   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file restore/db/roles.sql --file restore/db/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file restore/db/data.sql --dbname "<new project's connection string>"
   ```
   If it stops on `supabase_admin` ownership lines or a `cli_login_postgres` grant, comment those lines out and run it again (Supabase's guide covers both).
3. **Restore the files**, after the database. Point the `RCLONE_CONFIG_SUPA_*` values at the new project's S3 endpoint and keys. For each bucket, copy the files back and compare them:
   ```
   rclone copy restore/files/documents supa:documents
   rclone check restore/files/documents supa:documents --download
   ```
   The `avatars` and `documents` buckets come from the migrations.
4. **Reconnect the app:**
   - Put the new project's URL and keys into both Workers' settings, then redeploy.
   - Add the Resend key to Vault again: `select vault.create_secret('<key>', 'email_api_key');`. Vault values don't carry over between projects.

To bring back a single file, copy just that path: `rclone copy r2:psyalliance-backups/<date>/files/<bucket>/<path> ...`.

## Rehearsed

Rehearsed on 17 Oct 2026 against the staging copy, with Storage's S3 endpoint and a local folder standing in for R2:

- A full run copied and checked every file.
- A file record with its bytes missing failed the run in 20 seconds, and older backups were kept.
- Two runs on the same day gave one folder.
- Only dated folders past 12 weeks were removed.
- Files deleted from Storage were restored from the backup byte for byte, with their records.

The hardened script was rehearsed again on 18 Oct 2026, the same way:

- A full run wrote the manifest last, with every file record matched to its file.
- A same-day rerun that failed partway left the folder without a manifest, so it can't pass for a good backup.
- A file deleted from Storage was removed from that day's copy on the next run.
- A file record that vanished during the run was handled by taking the data again once; the run then passed.
- A file record whose file never existed failed the run, and no manifest was written.
- Only dated folders past 12 weeks were pruned; other folders were left alone.
