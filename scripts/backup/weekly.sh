#!/usr/bin/env bash
# Weekly backup of the real project: the database (roles, schema, data) and
# every stored file, copied together into one dated folder in a private
# Cloudflare R2 bucket, so a restore gets files and data from the same moment.
# Runs from .github/workflows/backup.yml. Restoring: scripts/backup/README.md.
#
# Needs (all from GitHub secrets, never in the repo):
#   SUPABASE_DB_URL                 session pooler connection string
#   RCLONE_CONFIG_SUPA_*            Supabase Storage S3 endpoint and access key
#   RCLONE_CONFIG_R2_*              R2 endpoint and API token
#   R2_BUCKET                       the backup bucket's name
# Optional: KEEP_WEEKS (default 12).
#
# Prints counts only: never file names, keys or data.
set -euo pipefail
export RCLONE_CONFIG=/dev/null # remotes come from RCLONE_CONFIG_* variables

: "${SUPABASE_DB_URL:?missing}" "${R2_BUCKET:?missing}"
KEEP_WEEKS=${KEEP_WEEKS:-12}
# BACKUP_DUMP_CMD and BACKUP_PSQL are for the staging rehearsal only.
dump() {
  if [ -n "${BACKUP_DUMP_CMD:-}" ]; then "$BACKUP_DUMP_CMD" "$@"
  else supabase db dump --db-url "$SUPABASE_DB_URL" "$@"; fi
}
PSQL=${BACKUP_PSQL:-psql}

STAMP=$(date -u +%Y-%m-%d)
DEST="r2:$R2_BUCKET/$STAMP"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/db"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY" || true; }
fail() { log "FAILED: $*"; summary "**Backup failed:** $*. Older backups were left as they were."; exit 1; }
trap 'log "FAILED at line $LINENO"; summary "**Backup failed** at line $LINENO of weekly.sh. Older backups were left as they were."' ERR

# 1. Database, with Supabase's documented commands.
log "Dumping the database"
dump -f "$WORK/db/roles.sql" --role-only
dump -f "$WORK/db/schema.sql"
dump -f "$WORK/db/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
for f in roles schema data; do [ -s "$WORK/db/$f.sql" ] || fail "$f.sql is empty"; done
grep -qE '^COPY "?auth"?\."?users"? ' "$WORK/db/data.sql" || fail "data.sql has no member accounts"
grep -qE '^COPY "?public"?\."?profiles"? ' "$WORK/db/data.sql" || fail "data.sql has no profiles"
grep -qE '^COPY "?storage"?\."?objects"? ' "$WORK/db/data.sql" || fail "data.sql has no file records"

# Which files the database says exist, at the moment of the dump.
"$PSQL" "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -Atc \
  "select bucket_id || '/' || name from storage.objects order by 1" | sort > "$WORK/db-files.txt"

# 2. Every stored file, bucket by bucket.
buckets=$(rclone lsf --dirs-only supa: | sed 's:/$::')
[ -n "$buckets" ] || fail "no buckets found in Storage"
for b in $buckets; do
  log "Copying bucket $b"
  rclone copy "supa:$b" "$DEST/files/$b" --transfers 8 --retries 3 --low-level-retries 3 --no-update-modtime
  # Byte-for-byte comparison of what was copied with the source.
  rclone check "supa:$b" "$DEST/files/$b" --one-way --download --log-level ERROR \
    || fail "copied files in $b don't match Storage"
done
rclone lsf -R --files-only "$DEST/files" | sort > "$WORK/copied.txt"

# 3. Files and data must match: every file the database lists is in the copy.
missing=$(comm -23 "$WORK/db-files.txt" "$WORK/copied.txt" | wc -l)
extra=$(comm -13 "$WORK/db-files.txt" "$WORK/copied.txt" | wc -l)
[ "$missing" -eq 0 ] || fail "$missing file(s) listed in the database are not in the copy"

# 4. The dump next to the files, with a manifest.
{
  echo "PsyAlliance backup $STAMP"
  echo "taken_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: ${GITHUB_SHA:-local}"
  echo "files_in_database: $(wc -l < "$WORK/db-files.txt")"
  echo "files_copied: $(wc -l < "$WORK/copied.txt")"
  echo "files_added_after_dump: $extra"
  for b in $buckets; do echo "bucket_$b: $(grep -c "^$b/" "$WORK/copied.txt" || true) files"; done
  (cd "$WORK/db" && sha256sum roles.sql schema.sql data.sql)
} > "$WORK/db/manifest.txt"
log "Uploading the database dump"
rclone copy "$WORK/db" "$DEST/db" --retries 3 --low-level-retries 3 --no-update-modtime
rclone check "$WORK/db" "$DEST/db" --one-way --download --log-level ERROR || fail "uploaded dump doesn't match"

# 5. Keep the last $KEEP_WEEKS weeks. Only dated folders older than the cutoff
#    go, and only after this week's copy has been checked.
cutoff=$(date -u -d "$STAMP - $((KEEP_WEEKS * 7)) days" +%Y-%m-%d)
pruned=0
for d in $(rclone lsf --dirs-only "r2:$R2_BUCKET" | sed 's:/$::'); do
  [[ $d =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
  if [[ $d < $cutoff ]]; then rclone purge "r2:$R2_BUCKET/$d"; pruned=$((pruned + 1)); fi
done
kept=$(rclone lsf --dirs-only "r2:$R2_BUCKET" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' || true)

log "Done: $STAMP, $(wc -l < "$WORK/copied.txt") files and the database; $kept weekly backups kept, $pruned removed"
summary "**Backup $STAMP done.** $(wc -l < "$WORK/copied.txt") files across $(echo $buckets | wc -w) buckets, plus the database (roles, schema, data). Files and data checked against each other. $kept weekly backups kept, $pruned older removed."
