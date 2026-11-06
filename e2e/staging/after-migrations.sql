-- Staging configuration after the app migrations, run as supabase_admin.
-- Mirrors the live project's app_config (checked read-only 16 Oct 2026),
-- with staging addresses. The provider key below is a local test value that
-- only the staging provider mock accepts.
\set ON_ERROR_STOP on
insert into public.app_config (key, value) values
  ('site_url', 'http://localhost:3600'),
  ('email_from', 'PsyAlliance <notifications@psyalliance.org>'),
  ('email_provider', 'resend'),
  ('signup_mode', 'open')
on conflict (key) do update set value = excluded.value;

insert into public.open_states (state, open) values ('NY', true), ('MA', true)
on conflict (state) do update set open = excluded.open;
-- v4: the live sites start NY and MA as "building the founding circle". Staging tests run with the circles complete,
-- so referrals to the whole network work; e2e/tests/staging/v13/v4.spec.ts V4-12 checks the building state.
update public.open_states set founding_circle = false where state in ('NY', 'MA');

select vault.create_secret('re_staging_test_key', 'email_api_key', 'staging provider mock key')
where not exists (select 1 from vault.secrets where name = 'email_api_key');
