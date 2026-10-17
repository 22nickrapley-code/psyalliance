#!/usr/bin/env bash
# Restore rehearsal on the disposable staging stack (never a hosted project):
#   1. take a snapshot of the database and the stored files together
#   2. record a fingerprint: row counts of the main tables, the stored-file
#      list and a hash of every file's bytes
#   3. damage things on purpose: delete messages and cover requests, remove
#      a stored file from disk, corrupt another
#   4. restore the snapshot and record the fingerprint again
#   5. check the two match and that database and files agree (every file
#      row has its bytes, every file on disk has its row)
# Writes reports/<run>/restore.json. Usage: E2E_RUN=name bash tools/restore-rehearsal.sh
set -euo pipefail
cd "$(dirname "$0")/.."
STAGE=${STAGE:-/opt/stage}
RUN=${E2E_RUN:-restore-$(date +%Y%m%d-%H%M)}
OUT="reports/$RUN"; mkdir -p "$OUT"
PSQL="psql -h 127.0.0.1 -p 54322 -U supabase_admin -d postgres -tAX"
FILES="$STAGE/storage-files/stub/stub"

fingerprint() {
  {
    echo "tables:"
    for t in profiles licenses coverage_plans coverage_plan_cases coverage_requests referral_requests referral_responses consultations consultation_responses conversations conversation_messages notification_events notification_deliveries documents; do
      echo "  $t $($PSQL -c "select count(*) || ':' || coalesce(md5(string_agg(id::text, ',' order by id)), '') from public.$t")"
    done
    echo "auth.users $($PSQL -c "select count(*) || ':' || md5(coalesce(string_agg(id::text, ',' order by id), '')) from auth.users")"
    echo "objects:"
    $PSQL -c "select bucket_id || '/' || name || '/' || version from storage.objects order by 1" | sed 's/^/  /'
    echo "bytes:"
    (cd "$FILES" 2>/dev/null && find . -type f -print0 | sort -z | xargs -0 -r sha256sum | sed 's/^/  /') || true
  }
}

consistency() {
  local rows disk
  rows=$($PSQL -c "select bucket_id || '/' || name || '/' || version from storage.objects order by 1")
  disk=$(cd "$FILES" 2>/dev/null && find . -type f | sed 's#^\./##' | sort || true)
  echo "rows_without_bytes=$(comm -23 <(echo "$rows" | sed '/^$/d' | sort) <(echo "$disk" | sed '/^$/d' | sort) | wc -l)"
  echo "bytes_without_rows=$(comm -13 <(echo "$rows" | sed '/^$/d' | sort) <(echo "$disk" | sed '/^$/d' | sort) | wc -l)"
}

echo "1. snapshot"
bash staging/stage.sh snapshot rehearsal > /dev/null 2>&1 < /dev/null
fingerprint > "$OUT/restore-before.txt"
consistency > "$OUT/restore-consistency-before.txt"

echo "2. damage"
$PSQL -c "delete from public.conversation_messages where id in (select id from public.conversation_messages order by id desc limit 5)" > /dev/null
$PSQL -c "delete from public.coverage_requests where id in (select id from public.coverage_requests order by id desc limit 5)" > /dev/null
victims=$(cd "$FILES" && find . -type f | sort | head -2)
first=$(echo "$victims" | sed -n 1p); second=$(echo "$victims" | sed -n 2p)
[ -n "$first" ] && rm -f "$FILES/$first"
[ -n "$second" ] && printf 'corrupted' > "$FILES/$second"
fingerprint > "$OUT/restore-damaged.txt"

echo "3. restore"
start=$(date +%s)
bash staging/stage.sh restore rehearsal > /dev/null 2>&1 < /dev/null
took=$(( $(date +%s) - start ))
fingerprint > "$OUT/restore-after.txt"
consistency > "$OUT/restore-consistency-after.txt"

same=false; diff -q "$OUT/restore-before.txt" "$OUT/restore-after.txt" > /dev/null && same=true
damaged=false; diff -q "$OUT/restore-before.txt" "$OUT/restore-damaged.txt" > /dev/null || damaged=true
cat > "$OUT/restore.json" <<EOF
{
  "run": "$RUN",
  "damageWasVisible": $damaged,
  "restoredMatchesSnapshot": $same,
  "restoreSeconds": $took,
  "consistencyBefore": "$(tr '\n' ' ' < "$OUT/restore-consistency-before.txt")",
  "consistencyAfter": "$(tr '\n' ' ' < "$OUT/restore-consistency-after.txt")"
}
EOF
cat "$OUT/restore.json"
