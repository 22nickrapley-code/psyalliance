-- Security advisor review: two SECURITY DEFINER helper functions
-- (is_admin_user, is_conversation_participant) lived in the public schema,
-- which PostgREST auto-exposes over the REST API. That's not itself a
-- privilege escalation (both are read-only checks), but Supabase's advisor
-- flags SECURITY DEFINER functions in an API-exposed schema as a lint
-- finding, and the documented fix is relocating them to a schema PostgREST
-- doesn't expose - not merely tightening grants (revoking EXECUTE from
-- `authenticated` breaks every RLS policy that calls them, since a
-- function referenced inside a policy expression needs the QUERYING
-- role's EXECUTE privilege, not the definer's).
--
-- This creates a `private` schema (not in PostgREST's exposed schema
-- list), recreates both helpers there, points every RLS policy and the
-- admin-column-protection trigger at the new location, and drops the old
-- public versions. Recorded here to match what's already live on
-- vvmulsyvyjsxhcpqfpyo - applied and verified directly via the Supabase
-- MCP tools during the Sept 23 security review, not through this file.

create schema if not exists private;

create or replace function private.is_admin_user(check_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select is_admin from profiles where id = check_id), false);
$$;

create or replace function private.is_conversation_participant(p_conversation_id bigint, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and profile_id = p_profile_id
  );
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin_user(uuid) to authenticated, service_role;
grant execute on function private.is_conversation_participant(bigint, uuid) to authenticated, service_role;

create or replace function public.protect_admin_controlled_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not private.is_admin_user((select auth.uid())) then
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$function$;

-- channel_requests
drop policy if exists "admins can see all channel requests" on channel_requests;
create policy "admins can see all channel requests" on channel_requests
  for select using (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can update channel requests" on channel_requests;
create policy "admins can update channel requests" on channel_requests
  for update using (private.is_admin_user((select auth.uid())));

-- conversation_messages
drop policy if exists "participants can read messages" on conversation_messages;
create policy "participants can read messages" on conversation_messages
  for select using (private.is_conversation_participant(conversation_id, (select auth.uid())));

drop policy if exists "participants can send messages" on conversation_messages;
create policy "participants can send messages" on conversation_messages
  for insert with check (
    author_id = (select auth.uid())
    and private.is_conversation_participant(conversation_id, (select auth.uid()))
  );

-- conversation_participants
drop policy if exists "participants can view the participant list" on conversation_participants;
create policy "participants can view the participant list" on conversation_participants
  for select using (private.is_conversation_participant(conversation_id, (select auth.uid())));

-- conversations
drop policy if exists "participants can touch last_message_at" on conversations;
create policy "participants can touch last_message_at" on conversations
  for update
  using (private.is_conversation_participant(id, (select auth.uid())))
  with check (private.is_conversation_participant(id, (select auth.uid())));

drop policy if exists "participants can view their conversations" on conversations;
create policy "participants can view their conversations" on conversations
  for select using (
    created_by = (select auth.uid())
    or private.is_conversation_participant(id, (select auth.uid()))
  );

-- credential_verifications
drop policy if exists "admins can see all credential verifications" on credential_verifications;
create policy "admins can see all credential verifications" on credential_verifications
  for select using (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can update credential verifications" on credential_verifications;
create policy "admins can update credential verifications" on credential_verifications
  for update using (private.is_admin_user((select auth.uid())));

-- documents
drop policy if exists "admins can delete any document" on documents;
create policy "admins can delete any document" on documents
  for delete using (private.is_admin_user((select auth.uid())));

-- founding_cohorts
drop policy if exists "admins manage founding cohorts" on founding_cohorts;
create policy "admins manage founding cohorts" on founding_cohorts
  for all
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

-- insurance_requests
drop policy if exists "admins can see all insurance requests" on insurance_requests;
create policy "admins can see all insurance requests" on insurance_requests
  for select using (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can update insurance requests" on insurance_requests;
create policy "admins can update insurance requests" on insurance_requests
  for update using (private.is_admin_user((select auth.uid())));

-- lookup_values
drop policy if exists "admins can add lookup values" on lookup_values;
create policy "admins can add lookup values" on lookup_values
  for insert with check (private.is_admin_user((select auth.uid())));

-- profiles
drop policy if exists "admins can see all profiles" on profiles;
create policy "admins can see all profiles" on profiles
  for select using (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can update any profile's verification status" on profiles;
create policy "admins can update any profile's verification status" on profiles
  for update using (private.is_admin_user((select auth.uid())));

-- referring_providers
drop policy if exists "admins can review provider registrations" on referring_providers;
create policy "admins can review provider registrations" on referring_providers
  for update
  using (private.is_admin_user((select auth.uid())))
  with check (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can see every provider registration" on referring_providers;
create policy "admins can see every provider registration" on referring_providers
  for select using (private.is_admin_user((select auth.uid())));

-- system_notifications
drop policy if exists "admins can create notifications" on system_notifications;
create policy "admins can create notifications" on system_notifications
  for insert with check (private.is_admin_user((select auth.uid())));

drop policy if exists "admins can see all notifications" on system_notifications;
create policy "admins can see all notifications" on system_notifications
  for select using (private.is_admin_user((select auth.uid())));

-- town_hall_channels
drop policy if exists "admins can create channels" on town_hall_channels;
create policy "admins can create channels" on town_hall_channels
  for insert with check (private.is_admin_user((select auth.uid())));

-- storage.objects
drop policy if exists "admins can delete any shared document file" on storage.objects;
create policy "admins can delete any shared document file" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'shared'
    and private.is_admin_user((select auth.uid()))
  );

drop function if exists public.is_admin_user(uuid);
drop function if exists public.is_conversation_participant(bigint, uuid);
