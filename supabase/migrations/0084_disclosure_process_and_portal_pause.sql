-- Accidental disclosure of patient information.
--
-- PsyAlliance is designed not to hold patient identifiers, and flags the
-- patterns it can recognise (emails, phone numbers, dates, record numbers,
-- addresses). It can't reliably recognise names. So members can report
-- anything that identifies a patient, and admins can redact it at once:
-- the text is replaced everywhere it lives in the app, the redaction is
-- logged without keeping the removed text, and related reports close.
-- Email notifications never include free text, so nothing needs recalling.

alter table public.reports add column if not exists category text not null default 'other';
do $$ begin
  alter table public.reports add constraint reports_category_check check (category in ('patient_information', 'conduct', 'other'));
exception when duplicate_object then null; end $$;
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in (
  'consultation', 'consultation_response', 'message', 'profile', 'user', 'library_document',
  'referral', 'referral_response', 'cover_request'
));

create table if not exists public.content_redactions (
  id bigint generated always as identity primary key,
  target_type text not null,
  target_id text not null,
  reason text not null,
  redacted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists content_redactions_redacted_by_idx on public.content_redactions(redacted_by);
alter table public.content_redactions enable row level security;
drop policy if exists "admins read redactions" on public.content_redactions;
create policy "admins read redactions" on public.content_redactions
  for select to authenticated using (private.is_admin_user((select auth.uid())));

create or replace function public.admin_redact(p_target_type text, p_target_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  placeholder constant text := '[Removed by PsyAlliance: this contained patient information]';
  tid bigint := nullif(p_target_id, '')::bigint;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_target_type = 'message' then
    update conversation_messages set body = placeholder, mentioned_profile_ids = '{}', deleted_at = coalesce(deleted_at, now()) where id = tid;
  elsif p_target_type = 'consultation' then
    update consultations set question = placeholder, context = null, case_detail = '{}'::jsonb, tags = '{}', status = 'removed' where id = tid;
  elsif p_target_type = 'consultation_response' then
    update consultation_responses set body = placeholder where id = tid;
  elsif p_target_type = 'referral' then
    update referral_requests set notes = placeholder where id = tid;
  elsif p_target_type = 'referral_response' then
    update referral_responses set message = placeholder where id = tid;
  elsif p_target_type = 'cover_request' then
    update coverage_requests set message = placeholder where id = tid;
  else
    raise exception 'That kind of content can''t be redacted here.' using errcode = 'P0001';
  end if;
  insert into content_redactions (target_type, target_id, reason, redacted_by)
  values (p_target_type, p_target_id, coalesce(nullif(trim(p_reason), ''), 'Patient information'), auth.uid());
  update reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), action_taken = 'redacted'
  where target_type = p_target_type and target_id = p_target_id and status in ('open', 'reviewing');
end;
$$;
revoke execute on function public.admin_redact(text, text, text) from public, anon;
grant execute on function public.admin_redact(text, text, text) to authenticated;

-- The physician referral portal is paused before launch: it collected
-- patient initials and contact details. No new registrations or referrals.
do $$
declare pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('referring_providers', 'provider_referrals') and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Admins can read reported content, and only reported content, to judge it.
create or replace function public.admin_reported_content(p_report_id bigint)
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare r record; tid bigint; txt text;
begin
  if not private.is_admin_user(auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into r from reports where id = p_report_id;
  if r.id is null then return null; end if;
  tid := case when r.target_id ~ '^\d+$' then r.target_id::bigint end;
  txt := case r.target_type
    when 'message' then (select body from conversation_messages where id = tid)
    when 'consultation' then (select question || coalesce(E'\n\n' || context, '') from consultations where id = tid)
    when 'consultation_response' then (select body from consultation_responses where id = tid)
    when 'referral' then (select notes from referral_requests where id = tid)
    when 'referral_response' then (select message from referral_responses where id = tid)
    when 'cover_request' then (select message from coverage_requests where id = tid)
    else null end;
  return txt;
end;
$$;
revoke execute on function public.admin_reported_content(bigint) from public, anon;
grant execute on function public.admin_reported_content(bigint) to authenticated;
