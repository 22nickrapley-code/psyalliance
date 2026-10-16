-- Disposable staging: the Supabase platform pieces the app's migrations
-- expect, recreated on a plain PostgreSQL 17 cluster. Run as the cluster
-- superuser (supabase_admin) on an empty database, before Auth, Storage
-- and the app migrations. Fictional, local-only; never run on a hosted
-- project.
--
-- Matches the live project's roles (checked read-only 16 Oct 2026):
-- postgres is not a superuser but bypasses RLS and owns the app's tables
-- and functions; service_role bypasses RLS; anon and authenticated do not.
-- pg_cron, pg_net and Supabase Vault are not available as extensions
-- here, so they are replaced by small SQL stand-ins with the same
-- signatures (see the bottom of this file). The staging runner executes
-- the scheduled jobs and the HTTP queue itself, so tests can drive them.

\set ON_ERROR_STOP on

create role postgres login createrole createdb replication bypassrls;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit;
create role supabase_auth_admin login noinherit createrole;
create role supabase_storage_admin login noinherit createrole;
create role dashboard_user nologin createrole createdb replication;
create role pgbouncer login;

grant anon, authenticated, service_role to authenticator;
-- Storage switches to the caller's role for every request, as on the platform.
grant anon, authenticated, service_role to supabase_storage_admin;
grant anon, authenticated, service_role, authenticator to postgres;
grant pg_read_all_data, pg_signal_backend, pg_monitor to postgres;

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
alter role postgres set search_path = "$user", public, extensions;
alter role supabase_auth_admin set search_path = auth;
alter role supabase_auth_admin set idle_in_transaction_session_timeout = 60000;
alter role supabase_storage_admin set search_path = storage;
alter role supabase_admin set search_path = "$user", public, auth, extensions;
alter database postgres set "app.settings.jwt_exp" = '3600';

grant create, connect, temporary on database postgres to postgres, supabase_auth_admin, supabase_storage_admin;

-- extensions
create schema extensions authorization postgres;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
grant execute on all functions in schema extensions to postgres, anon, authenticated, service_role;
alter default privileges in schema extensions grant execute on functions to postgres, anon, authenticated, service_role;

-- public
grant usage, create on schema public to postgres;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;

-- auth (Auth creates its own tables as supabase_auth_admin)
create schema auth authorization supabase_admin;
grant all on schema auth to supabase_auth_admin;
grant usage on schema auth to postgres, anon, authenticated, service_role, dashboard_user;
alter default privileges for role supabase_auth_admin in schema auth grant all on tables to postgres, dashboard_user, service_role;
alter default privileges for role supabase_auth_admin in schema auth grant all on sequences to postgres, dashboard_user;
alter default privileges for role supabase_auth_admin in schema auth grant all on functions to postgres, dashboard_user;

-- storage (Storage creates its own tables as supabase_storage_admin)
create schema storage authorization supabase_storage_admin;
grant usage on schema storage to postgres, anon, authenticated, service_role, dashboard_user;
alter default privileges for role supabase_storage_admin in schema storage grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_storage_admin in schema storage grant all on functions to postgres, anon, authenticated, service_role;

-- migration bookkeeping, as on the hosted projects
create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
alter table supabase_migrations.schema_migrations owner to postgres;

-- ------------------------------------------------------------------
-- pg_cron stand-in: same catalog tables and schedule()/unschedule()
-- signatures. Jobs are run by the staging runner (scripts/stage.mjs
-- run-jobs), so a test decides exactly when a dispatcher fires.
create schema cron authorization supabase_admin;
grant usage on schema cron to postgres;
create table cron.job (
  jobid bigserial primary key,
  schedule text not null,
  command text not null,
  nodename text not null default 'localhost',
  nodeport int not null default 5432,
  database text not null default current_database(),
  username text not null default current_user,
  active boolean not null default true,
  jobname text unique
);
create table cron.job_run_details (
  jobid bigint, runid bigserial primary key, job_pid int, database text, username text,
  command text, status text, return_message text, start_time timestamptz, end_time timestamptz
);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command, active = true
  returning jobid
$$;
create function cron.schedule(schedule text, command text) returns bigint
language sql as $$ insert into cron.job (schedule, command) values (schedule, command) returning jobid $$;
create function cron.unschedule(job_name text) returns boolean
language plpgsql as $$ begin delete from cron.job where jobname = job_name; return found; end $$;
create function cron.unschedule(job_id bigint) returns boolean
language plpgsql as $$ begin delete from cron.job where jobid = job_id; return found; end $$;
grant all on all tables in schema cron to postgres;
grant all on all sequences in schema cron to postgres;
grant execute on all functions in schema cron to postgres;

-- ------------------------------------------------------------------
-- pg_net stand-in: http_post() queues the request and returns its id,
-- like pg_net. The staging runner sends queued requests to the local
-- provider mock (never a real provider) and writes net._http_response.
create schema net authorization supabase_admin;
grant usage on schema net to postgres;
create table net.http_request_queue (
  id bigserial primary key,
  method text not null,
  url text not null,
  headers jsonb,
  body bytea,
  timeout_milliseconds int not null,
  created timestamptz not null default now()
);
create table net._http_response (
  id bigint primary key,
  status_code int,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz not null default now()
);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language sql security definer set search_path = net as $$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, convert_to(body::text, 'UTF8'), timeout_milliseconds)
  returning id
$$;
create function net.http_get(
  url text,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language sql security definer set search_path = net as $$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('GET', url, headers, null, timeout_milliseconds)
  returning id
$$;
grant select on net._http_response, net.http_request_queue to postgres;
grant execute on all functions in schema net to postgres;

-- ------------------------------------------------------------------
-- Supabase Vault stand-in (local only; secrets here are test values).
create schema vault authorization supabase_admin;
grant usage on schema vault to postgres;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  key_id uuid,
  nonce bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql security definer set search_path = vault as $$
  insert into vault.secrets (secret, name, description, key_id) values (new_secret, new_name, new_description, new_key_id) returning id
$$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql security definer set search_path = vault as $$
  update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name),
    description = coalesce(new_description, description), updated_at = now() where id = secret_id
$$;
grant select on vault.decrypted_secrets, vault.secrets to postgres;
grant execute on all functions in schema vault to postgres;
