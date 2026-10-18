#!/usr/bin/env bash
# Weekly backup of the real project: the database (roles, schema, data) and
# every stored file, into one dated folder in a private Cloudflare R2 bucket.
# The dump and the file copy are taken a minute or two apart, and every file
# the dump lists is checked to be in the copy, so a restore never has a file
# record without its bytes.
# Runs from .github/workflows/backup.yml. Restoring: scripts/backup/README.md.
#
# A folder is a complete backup only when it has db/manifest.txt. That file
# is removed first thing on a same-day rerun and written last, after every
# check, so a run that stops halfway can't be mistaken for a good backup.
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
# BACKUP_DUMP_CMD is for the staging rehearsal only.
dump() {
  if [ -n "${BACKUP_DUMP_CMD:-}" ]; then "$BACKUP_DUMP_CMD" "$@"
  else supabase db dump --db-url "$SUPABASE_DB_URL" "$@"; fi
}
RC=(--retries 3 --low-level-retries 3)

STAMP=$(date -u +%Y-%m-%d)
DEST="r2:$R2_BUCKET/$STAMP"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/db"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*"; }
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY" || true; }
fail() { log "FAILED: $*"; summary "**Backup failed:** $*. Older backups were left as they were; today's folder is marked incomplete."; exit 1; }
trap 'log "FAILED at line $LINENO"; summary "**Backup failed** at line $LINENO of weekly.sh. Older backups were left as they were; today'"'"'s folder is marked incomplete."' ERR

# 0. A rerun on the same day starts by marking today's folder incomplete.
rclone deletefile "$DEST/db/manifest.txt" "${RC[@]}" 2>/dev/null || true

# The file records in the dump itself: bucket/name for every row of
# storage.objects, read from the COPY block.
dump_files() {
  python3 - "$1" <<'PY'
import re, sys
want = re.compile(r'^COPY "?storage"?\."?objects"? \((.*)\) FROM stdin;$')
def unescape(v):
    return re.sub(r'\\(.)', lambda m: {"t": "\t", "n": "\n", "r": "\r", "\\": "\\"}.get(m.group(1), m.group(1)), v)
rows, cols = [], None
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for line in f:
        line = line.rstrip("\n")
        if cols is None:
            m = want.match(line)
            if m:
                cols = [c.strip().strip('"') for c in m.group(1).split(",")]
                b, n = cols.index("bucket_id"), cols.index("name")
            continue
        if line == "\\.":
            break
        parts = line.split("\t")
        rows.append(f"{unescape(parts[b])}/{unescape(parts[n])}")
print("\n".join(sorted(rows)))
PY
}

take_dump() {
  dump -f "$WORK/db/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
  [ -s "$WORK/db/data.sql" ] || fail "data.sql is empty"
  grep -qE '^COPY "?auth"?\."?users"? ' "$WORK/db/data.sql" || fail "data.sql has no member accounts"
  grep -qE '^COPY "?public"?\."?profiles"? ' "$WORK/db/data.sql" || fail "data.sql has no profiles"
  grep -qE '^COPY "?storage"?\."?objects"? ' "$WORK/db/data.sql" || fail "data.sql has no file records"
  dump_files "$WORK/db/data.sql" | sed '/^$/d' | LC_ALL=C sort > "$WORK/db-files.txt"
}

copy_files() {
  buckets=$(rclone lsf --dirs-only supa: "${RC[@]}" | sed 's:/$::')
  [ -n "$buckets" ] || fail "no buckets found in Storage"
  for b in $buckets; do
    log "Copying bucket $b"
    # sync, not copy: on a same-day rerun, files deleted since are removed
    # from today's folder too, so it matches Storage now.
    rclone sync "supa:$b" "$DEST/files/$b" --transfers 8 "${RC[@]}" --no-update-modtime
    rclone check "supa:$b" "$DEST/files/$b" --download --log-level ERROR "${RC[@]}" \
      || fail "copied files in $b don't match Storage"
  done
  rclone lsf -R --files-only "$DEST/files" "${RC[@]}" | LC_ALL=C sort > "$WORK/copied.txt"
}

# 1. Database, with Supabase's documented commands.
log "Dumping the database"
dump -f "$WORK/db/roles.sql" --role-only
dump -f "$WORK/db/schema.sql"
for f in roles schema; do [ -s "$WORK/db/$f.sql" ] || fail "$f.sql is empty"; done
take_dump

# 2. Every stored file, bucket by bucket, compared byte for byte.
copy_files

# 3. Every file record in the dump must have its bytes in the copy. A file
#    deleted between the dump and the copy would leave a record without
#    bytes: take the data dump again once, then insist.
missing=$(LC_ALL=C comm -23 "$WORK/db-files.txt" "$WORK/copied.txt" | wc -l)
if [ "$missing" -gt 0 ]; then
  log "$missing file record(s) changed during the backup; taking the data again"
  take_dump
  missing=$(LC_ALL=C comm -23 "$WORK/db-files.txt" "$WORK/copied.txt" | wc -l)
  [ "$missing" -eq 0 ] || fail "$missing file record(s) in the dump have no file in the copy"
fi
extra=$(LC_ALL=C comm -13 "$WORK/db-files.txt" "$WORK/copied.txt" | wc -l)

# 4. The dump next to the files, checked after upload.
log "Uploading the database dump"
rclone copy "$WORK/db" "$DEST/db" "${RC[@]}" --no-update-modtime
rclone check "$WORK/db" "$DEST/db" --one-way --download --log-level ERROR "${RC[@]}" || fail "uploaded dump doesn't match"

# 5. Only now: the manifest that marks the folder complete.
{
  echo "PsyAlliance backup $STAMP: complete"
  echo "taken_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: ${GITHUB_SHA:-local}"
  echo "file_records_in_dump: $(wc -l < "$WORK/db-files.txt")"
  echo "files_copied: $(wc -l < "$WORK/copied.txt")"
  echo "files_without_a_record: $extra (uploaded after the dump; harmless on restore)"
  for b in $buckets; do echo "bucket_$b: $(grep -c "^$b/" "$WORK/copied.txt" || true) files"; done
  (cd "$WORK/db" && sha256sum roles.sql schema.sql data.sql)
} > "$WORK/manifest.txt"
rclone copyto "$WORK/manifest.txt" "$DEST/db/manifest.txt" "${RC[@]}" --no-update-modtime
rclone cat "$DEST/db/manifest.txt" "${RC[@]}" | cmp -s - "$WORK/manifest.txt" || fail "the manifest didn't upload"

# 6. Keep the last $KEEP_WEEKS weeks. Only dated folders older than the cutoff
#    go, and only after this week's backup is complete.
cutoff=$(date -u -d "$STAMP - $((KEEP_WEEKS * 7)) days" +%Y-%m-%d)
pruned=0
for d in $(rclone lsf --dirs-only "r2:$R2_BUCKET" "${RC[@]}" | sed 's:/$::'); do
  [[ $d =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
  if [[ $d < $cutoff ]]; then rclone purge "r2:$R2_BUCKET/$d" "${RC[@]}"; pruned=$((pruned + 1)); fi
done
kept=$(rclone lsf --dirs-only "r2:$R2_BUCKET" "${RC[@]}" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' || true)

log "Done: $STAMP, $(wc -l < "$WORK/copied.txt") files and the database; $kept weekly backups kept, $pruned removed"
summary "**Backup $STAMP done.** $(wc -l < "$WORK/copied.txt") files across $(echo $buckets | wc -w) buckets, plus the database (roles, schema, data). Every file record in the dump has its file in the copy. $kept weekly backups kept, $pruned older removed."
