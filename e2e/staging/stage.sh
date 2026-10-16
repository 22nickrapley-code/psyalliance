#!/usr/bin/env bash
# Disposable local staging for PsyAlliance: PostgreSQL 17.6, Supabase Auth
# (GoTrue v2.197.0, same migration level as live), PostgREST 13, Supabase
# Storage v1.80.2 (same migration level as live), Mailpit as the only mail
# server, a local email-provider mock, and a gateway on :54321 that looks like
# a Supabase project URL. Everything is fictional and local; nothing here
# talks to the hosted projects or to a real mail provider.
#
#   e2e/staging/stage.sh setup     download binaries into $STAGE (once)
#   e2e/staging/stage.sh rebuild   new empty database, all migrations, fixtures
#   e2e/staging/stage.sh start     start the services
#   e2e/staging/stage.sh stop      stop them
#   e2e/staging/stage.sh status
#   e2e/staging/stage.sh snapshot NAME / restore NAME   database + stored files
#
# Keys are generated per machine into $STAGE/secrets (never committed).
set -euo pipefail

STAGE=${STAGE:-/opt/stage}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
PGX=${PGX:-/opt/pgx/package/native}
NODE24=${NODE24:-/opt/node24/package/bin}
PGPORT=54322
PSQL="psql -h 127.0.0.1 -p $PGPORT -d postgres -v ON_ERROR_STOP=1 -q"
AUTH_VERSION=v2.197.0
REST_VERSION=v13.0.8
STORAGE_TAG=v1.80.2
MAILPIT_VERSION=v1.31.6

pg() { su postgres -s /bin/bash -c "LD_LIBRARY_PATH=$PGX/lib $PGX/bin/$*"; }

setup() {
  mkdir -p "$STAGE"/{bin,logs,run,secrets,storage-files,snapshots}
  chmod 700 "$STAGE/secrets"
  cd "$STAGE/bin"
  [ -x auth/auth ] || { curl -fsSL -o auth.tgz "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz"; mkdir -p auth; tar xzf auth.tgz -C auth; }
  [ -x postgrest ] || { curl -fsSL -o pgrst.txz "https://github.com/PostgREST/postgrest/releases/download/$REST_VERSION/postgrest-$REST_VERSION-linux-static-x86-64.tar.xz"; tar xJf pgrst.txz; }
  [ -x mailpit ] || { curl -fsSL -o mailpit.tgz "https://github.com/axllent/mailpit/releases/download/$MAILPIT_VERSION/mailpit-linux-amd64.tar.gz"; tar xzf mailpit.tgz mailpit; }
  [ -x "$PGX/bin/postgres" ] || { mkdir -p /opt/pgx && cd /opt/pgx && npm pack @embedded-postgres/linux-x64@17.6.0-beta.15 && tar xzf embedded-postgres-linux-x64-17.6.0-beta.15.tgz && (cd package && node scripts/hydrate-symlinks.js); }
  # pg_cron and pg_net are replaced by SQL stand-ins (init-platform.sql);
  # these empty extensions let the migrations' "create extension" succeed.
  local ext="$PGX/share/postgresql/extension"
  printf "comment = 'staging stand-in'\ndefault_version = '1.6.4'\nrelocatable = false\nsuperuser = false\n" > "$ext/pg_cron.control"
  echo "-- staging stand-in, see e2e/staging/init-platform.sql" > "$ext/pg_cron--1.6.4.sql"
  printf "comment = 'staging stand-in'\ndefault_version = '0.20.4'\nrelocatable = true\nsuperuser = false\n" > "$ext/pg_net.control"
  echo "-- staging stand-in, see e2e/staging/init-platform.sql" > "$ext/pg_net--0.20.4.sql"
  [ -x "$NODE24/node" ] || { mkdir -p /opt/node24 && cd /opt/node24 && npm pack node-linux-x64@24 && tar xzf node-linux-x64-24*.tgz; }
  if [ ! -f "$STAGE/storage/dist/start/server.js" ]; then
    git clone -q --depth 1 --branch "$STORAGE_TAG" https://github.com/supabase/storage.git "$STAGE/storage"
    (cd "$STAGE/storage" && export PATH="$NODE24:$PATH" && npx -y npm@11 ci --ignore-scripts && npm_config_nodedir="$(dirname "$NODE24")" npx -y npm@11 rebuild && node ./build.js && npx resolve-tspaths)
  fi
  [ -f "$STAGE/secrets/keys.env" ] || node "$REPO/e2e/staging/keys.mjs" > "$STAGE/secrets/keys.env"
  chmod 600 "$STAGE/secrets/keys.env"
  echo "setup done"
}

envfiles() {
  # shellcheck disable=SC1091
  set -a; . "$STAGE/secrets/keys.env"; set +a
  cat > "$STAGE/run/auth.env" <<EOF
GOTRUE_API_HOST=127.0.0.1
PORT=9999
API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1
GOTRUE_DB_DRIVER=postgres
DATABASE_URL="postgres://supabase_auth_admin@127.0.0.1:$PGPORT/postgres?search_path=auth&sslmode=disable"
GOTRUE_DB_MIGRATIONS_PATH=$STAGE/bin/auth/migrations
GOTRUE_SITE_URL=${STAGE_SITE_URL:-http://localhost:3600}
GOTRUE_URI_ALLOW_LIST="http://localhost:3600/**,http://localhost:3601/**,http://localhost:3610/**"
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_SECRET=$STAGE_JWT_SECRET
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=false
GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true
GOTRUE_SMTP_HOST=127.0.0.1
GOTRUE_SMTP_PORT=1025
GOTRUE_SMTP_ADMIN_EMAIL=no-reply@staging.psyalliance.test
GOTRUE_SMTP_SENDER_NAME="PsyAlliance staging"
GOTRUE_SMTP_MAX_FREQUENCY=60s
GOTRUE_RATE_LIMIT_EMAIL_SENT=${STAGE_EMAIL_RATE:-1000}
GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
GOTRUE_EXTERNAL_PHONE_ENABLED=false
GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true
GOTRUE_PASSWORD_MIN_LENGTH=8
GOTRUE_LOG_LEVEL=info
EOF
  cat > "$STAGE/run/rest.env" <<EOF
PGRST_DB_URI=postgres://authenticator@127.0.0.1:$PGPORT/postgres
PGRST_DB_SCHEMAS=public
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=$STAGE_JWT_SECRET
PGRST_DB_USE_LEGACY_GUCS=false
PGRST_DB_EXTRA_SEARCH_PATH=public,extensions
PGRST_DB_MAX_ROWS=1000
PGRST_SERVER_HOST=127.0.0.1
PGRST_SERVER_PORT=3001
PGRST_ADMIN_SERVER_PORT=3002
PGRST_DB_POOL=20
EOF
  cat > "$STAGE/run/storage.env" <<EOF
SERVER_HOST=127.0.0.1
SERVER_PORT=5000
SERVER_ADMIN_PORT=5001
AUTH_JWT_SECRET=$STAGE_JWT_SECRET
PGRST_JWT_SECRET=$STAGE_JWT_SECRET
ANON_KEY=$STAGE_ANON_KEY
SERVICE_KEY=$STAGE_SERVICE_KEY
DATABASE_URL=postgres://supabase_storage_admin@127.0.0.1:$PGPORT/postgres
DB_INSTALL_ROLES=false
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=$STAGE/storage-files
STORAGE_S3_BUCKET=stub
GLOBAL_S3_BUCKET=stub
TENANT_ID=stub
REGION=stub
FILE_SIZE_LIMIT=52428800
UPLOAD_FILE_SIZE_LIMIT=52428800
IMAGE_TRANSFORMATION_ENABLED=false
STORAGE_PUBLIC_URL=http://127.0.0.1:54321/storage/v1
LOG_LEVEL=info
EOF
  chmod 600 "$STAGE"/run/*.env
}

daemon() { # name, dir, envfile|-, command...
  local name=$1 dir=$2 envfile=$3; shift 3
  if [ -f "$STAGE/run/$name.pid" ] && kill -0 "$(cat "$STAGE/run/$name.pid")" 2>/dev/null; then return; fi
  (cd "$dir" && setsid nohup bash -c 'if [ "$0" != - ]; then set -a; . "$0"; set +a; fi; exec "$@"' "$envfile" "$@" >> "$STAGE/logs/$name.log" 2>&1 < /dev/null & echo $! > "$STAGE/run/$name.pid")
}

withenv() { # envfile, command...
  local envfile=$1; shift
  (set -a; . "$envfile"; set +a; "$@")
}

start_pg() {
  pg "pg_ctl -D $STAGE/pgdata status" > /dev/null 2>&1 || pg "pg_ctl -D $STAGE/pgdata -l $STAGE/logs/postgres.log -w start" > /dev/null
}

start() {
  envfiles
  start_pg
  daemon mailpit "$STAGE" - "$STAGE/bin/mailpit" --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --smtp-auth-accept-any --smtp-auth-allow-insecure
  daemon auth "$STAGE/bin/auth" "$STAGE/run/auth.env" ./auth serve
  daemon rest "$STAGE" "$STAGE/run/rest.env" "$STAGE/bin/postgrest"
  daemon storage "$STAGE/storage" "$STAGE/run/storage.env" env NODE_ENV=production "$NODE24/node" dist/start/server.js
  daemon provider "$REPO" - node e2e/staging/provider-mock.mjs
  daemon gateway "$REPO" - node e2e/staging/gateway.mjs
  for i in $(seq 1 60); do
    curl -sf 127.0.0.1:54321/auth/v1/health > /dev/null && curl -sf 127.0.0.1:5000/status > /dev/null && break
    sleep 1
  done
  status
}

killport() { # kill whatever listens on a local port
  fuser -k -n tcp "$1" > /dev/null 2>&1 || true
}

stop() {
  for n in gateway provider storage rest auth mailpit; do
    [ -f "$STAGE/run/$n.pid" ] && kill "$(cat "$STAGE/run/$n.pid")" 2>/dev/null || true
    rm -f "$STAGE/run/$n.pid"
  done
  for p in 54321 54400 5000 5001 3001 3002 9999 8025 1025; do killport $p; done
  sleep 1
  pg "pg_ctl -D $STAGE/pgdata -m fast stop" > /dev/null 2>&1 || true
}

status() {
  printf 'postgres  '; psql -h 127.0.0.1 -p $PGPORT -U supabase_admin -d postgres -tAc "select version()" 2>/dev/null | cut -c1-16 || echo down
  printf 'auth      '; curl -s 127.0.0.1:9999/health | head -c 60; echo
  printf 'rest      '; curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:3001/
  printf 'storage   '; curl -s 127.0.0.1:5000/status; echo
  printf 'mailpit   '; curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8025/
  printf 'provider  '; curl -s 127.0.0.1:54400/health; echo
  printf 'gateway   '; curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:54321/auth/v1/health
}

rebuild() {
  stop
  rm -rf "$STAGE/pgdata" "$STAGE/storage-files"
  mkdir -p "$STAGE/pgdata" "$STAGE/storage-files" "$STAGE/logs"
  chown -R postgres "$STAGE/pgdata" "$STAGE/logs"
  pg "initdb -D $STAGE/pgdata -U supabase_admin --auth=trust -E UTF8 --locale=C.UTF-8" > /dev/null
  cat >> "$STAGE/pgdata/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $PGPORT
max_connections = 300
timezone = 'UTC'
log_timezone = 'UTC'
log_min_messages = warning
shared_buffers = 256MB
EOF
  envfiles
  start_pg
  $PSQL -U supabase_admin -f "$REPO/e2e/staging/init-platform.sql"
  (cd "$STAGE/bin/auth" && withenv "$STAGE/run/auth.env" ./auth migrate > "$STAGE/logs/auth-migrate.log" 2>&1)
  # Storage runs its own migrations when it starts.
  daemon storage "$STAGE/storage" "$STAGE/run/storage.env" env NODE_ENV=production "$NODE24/node" dist/start/server.js
  for i in $(seq 1 60); do curl -sf 127.0.0.1:5000/status > /dev/null && break; sleep 1; done
  migrate
  $PSQL -U supabase_admin -f "$REPO/e2e/staging/after-migrations.sql"
  start
  node "$REPO/e2e/staging/fixtures.mjs"
}

migrate() {
  # The app migrations run as postgres, the owner on the hosted projects.
  # postgres briefly joins the Auth and Storage owner roles so it can add
  # its policies and triggers on their tables, as supautils allows on the
  # hosted platform; membership is removed again afterwards.
  $PSQL -U supabase_admin -c "grant supabase_storage_admin, supabase_auth_admin to postgres"
  local f n=0
  for f in $(ls "$REPO"/supabase/migrations/*.sql | sort); do
    if ! $PSQL -U postgres -1 -f "$f" > "$STAGE/logs/migrate-last.log" 2>&1; then
      echo "migration failed: $(basename "$f")"; grep -v NOTICE "$STAGE/logs/migrate-last.log" | head -20; exit 1
    fi
    $PSQL -U postgres -c "insert into supabase_migrations.schema_migrations(version, name) values ('$(basename "$f" .sql | cut -d_ -f1)', '$(basename "$f" .sql)') on conflict do nothing"
    n=$((n + 1))
  done
  $PSQL -U supabase_admin -c "revoke supabase_storage_admin, supabase_auth_admin from postgres"
  # PostgREST picks up new functions (the hosted platform does this itself).
  $PSQL -U supabase_admin -c "notify pgrst, 'reload schema'"
  echo "applied $n migrations"
}

snapshot() {
  local name=${1:?name}; stop
  mkdir -p "$STAGE/snapshots"
  tar czf "$STAGE/snapshots/$name.tgz" -C "$STAGE" pgdata storage-files
  start > /dev/null
  echo "snapshot $name: $(du -h "$STAGE/snapshots/$name.tgz" | cut -f1)"
}

restore() {
  local name=${1:?name}; stop
  rm -rf "$STAGE/pgdata" "$STAGE/storage-files"
  tar xzf "$STAGE/snapshots/$name.tgz" -C "$STAGE"
  chown -R postgres "$STAGE/pgdata"
  start > /dev/null
  echo "restored $name"
}

cmd=${1:-status}; shift || true
case "$cmd" in
  setup) setup ;;
  rebuild) rebuild ;;
  migrate) migrate ;;
  start) start ;;
  stop) stop ;;
  status) status ;;
  snapshot) snapshot "$@" ;;
  restore) restore "$@" ;;
  *) echo "unknown command: $cmd"; exit 2 ;;
esac
