-- 0135_v11.sql: the release QA review of 13 and 14 Nov 2026 (v11).
-- Safe to run more than once. Run on the sandbox project first, then on live.
--
-- 1. S3: founding_places_before_v4, the empty backup table made in v4, was readable and writable through the public
--    API. It is now closed to everyone but the database itself (row-level security on, no grants to members or
--    visitors). The table and anything in it are kept.
-- 2. M1: a referral's private title may use ordinary abbreviations such as QA, ED or PM; two capitals are still
--    refused as possible initials otherwise. The screen uses the same list.
-- 3. C1: plan history no longer says "Handover is still to be confirmed" when cover is agreed, because agreeing
--    cover records the handover in the same step.
-- 4. M13: cancelling a plan before its first day removes its "worked with before" record, and plans already
--    cancelled that way are tidied.

-- 1 ------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.founding_places_before_v4') is not null then
    execute 'alter table public.founding_places_before_v4 enable row level security';
    execute 'revoke all on table public.founding_places_before_v4 from public, anon, authenticated';
  end if;
end $$;

-- 2 ------------------------------------------------------------------------------------------------------------
create or replace function private.referral_title_problem(p_title text)
returns text
language plpgsql
immutable
as $function$
declare
  t text := btrim(coalesce(p_title, ''));
  tok text;
begin
  if t = '' then
    return 'Write a short title, or leave it empty to use the default.';
  end if;
  if char_length(t) > 40 then
    return 'Keep the title to 40 characters.';
  end if;
  if t ~* '(@|https?:|www\.)' then
    return 'Please don''t put an email address or a link in the title.';
  end if;
  if t ~ '[0-9]{4,}' or char_length(regexp_replace(t, '[^0-9]', '', 'g')) > 6 then
    return 'Please don''t put a phone number, date of birth or ID in the title.';
  end if;
  if t ~ '[0-9]{1,2}[/.-][0-9]{1,2}[/.-][0-9]{2,4}' then
    return 'Please don''t put a date of birth in the title.';
  end if;
  if t ~ '(^|\s)([A-Za-z]\.){2,}' or t ~ '(^|\s)[A-Z]\s[A-Z](\s|$)' then
    return 'Please don''t use a client''s initials. Describe the need instead, for example "Anxiety, evenings".';
  end if;
  foreach tok in array regexp_split_to_array(t, '[^A-Za-z]+') loop
    if tok ~ '^[A-Z]{2}$' and private.state_name(tok) = tok
       and tok <> all (array['QA', 'ED', 'ER', 'OT', 'PT', 'SW', 'NP', 'AM', 'PM', 'HR', 'IT', 'UK', 'US', 'EU', 'GP', 'TV', 'OK', 'DO', 'MD', 'PA']) then
      return 'Please don''t use a client''s initials. Describe the need instead, for example "Anxiety, evenings".';
    end if;
  end loop;
  return null;
end;
$function$;
revoke all on function private.referral_title_problem(text) from public, anon, authenticated;

-- 3 ------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cover_event_text(p_kind text, p_owner_view boolean, p_label text, p_owner_first text, p_subject text, p_meta jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_owner_view then
    case p_kind
      when 'created' then 'Plan created with ' || private.count_word(coalesce((p_meta ->> 'clients')::integer, 0)) || ' anonymous client need' || case when coalesce((p_meta ->> 'clients')::integer, 0) = 1 then '' else 's' end || '.'
      when 'invited' then case when p_meta ->> 'mode' = 'parallel' then 'Parallel' else 'Sequential' end || ' invitations sent. Response deadline: ' || coalesce(p_meta ->> 'hours', '48') || ' hours.'
      when 'asked' then case when coalesce((p_meta ->> 'retry')::boolean, false) then p_label || ': a new request was sent to ' || p_subject || '.' else p_label || ': ' || p_subject || ' asked next.' end
      when 'declined' then p_label || ': ' || p_subject || ' is not available.'
      when 'declined_owner' then p_label || ': you declined ' || p_subject || ' and continued the search.'
      when 'arranged' then 'Cover arranged. Every client has an agreed colleague and a ready handover.'
      when 'absence_completed' then 'Absence completed. The plan moved to your history.'
      when 'discussing' then p_label || ': ' || p_subject || ' asked to discuss the arrangement. Automatic progression is paused.'
      when 'accepted' then p_label || ': cover agreed with ' || p_subject || '.'
      when 'expired' then p_label || ': ' || p_subject || ' did not reply before the deadline.'
      when 'skipped' then p_label || ': ' || p_subject || ' could not be asked because they are no longer an eligible match.'
      when 'handover_ready' then p_label || ': ' || p_owner_first || ' confirmed the handover with ' || p_subject || ' is ready.'
      when 'completed' then 'Arrangement completed. All handovers were confirmed.'
      when 'cancelled' then 'Plan cancelled. Outstanding invitations closed.'
      else null end
  else
    case p_kind
      when 'asked_you' then p_owner_first || ' asked you to help with ' || private.count_word(coalesce((p_meta ->> 'n')::integer, 1)) || ' client need' || case when coalesce((p_meta ->> 'n')::integer, 1) = 1 then '' else 's' end || '.'
      when 'asked' then p_owner_first || ' asked you about ' || p_label || '.'
      when 'declined' then 'You said you are not available for ' || p_label || '.'
      when 'declined_owner' then p_owner_first || ' made other arrangements for ' || p_label || '.'
      when 'arranged' then p_owner_first || ' confirmed the cover is arranged.'
      when 'absence_completed' then 'The absence has ended.'
      when 'discussing' then 'You asked to discuss ' || p_label || '.'
      when 'accepted' then 'Cover agreed with you for ' || p_label || '.'
      when 'expired' then 'The reply deadline for ' || p_label || ' passed.'
      when 'closed_competing' then p_label || ' is now covered by another colleague.'
      when 'handover_ready' then p_owner_first || ' confirmed the handover arrangements.'
      when 'completed' then 'Arrangement completed. All handovers were confirmed.'
      when 'cancelled' then 'Plan cancelled. Outstanding invitations closed.'
      else null end
  end;
$function$;

-- 4 ------------------------------------------------------------------------------------------------------------
create or replace function public.cover_cancel_plan(p_plan bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  pl coverage_plans%rowtype;
  a uuid;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into pl from coverage_plans where id = p_plan and profile_id = me for update;
  if not found then
    raise exception 'Plan not found.' using errcode = 'P0001';
  end if;
  if pl.status = 'cancelled' then
    return jsonb_build_object('unchanged', true);
  end if;
  if pl.status <> 'active' then
    raise exception 'This plan has ended.' using errcode = 'P0001';
  end if;
  update coverage_plans set status = 'cancelled' where id = pl.id;
  perform private.cover_event(pl.id, null, null, 'cancelled');
  -- v11 (QA M13): cover that never started is not work together. A plan cancelled before its first day leaves no
  -- "worked with before" record; one cancelled part-way through keeps it.
  if pl.starts_on > current_date then
    delete from professional_events
     where event_type = 'coverage_completed' and metadata ->> 'coveragePlanId' = pl.id::text;
  end if;
  -- Open requests close; answers and handover records stay.
  for a in
    select distinct x from (
      select r.requested_profile_id x from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id
       where c.coverage_plan_id = pl.id and r.status in ('sent', 'discussing')
      union
      select c.assigned_clinician_id from coverage_plan_cases c where c.coverage_plan_id = pl.id and c.assigned_clinician_id is not null) q
     where x is not null
  loop
    perform private.notify_member('coverage_response', a, me, 'cancelled the cover plan', '/dashboard/cover?plan=' || pl.id,
                                  'cover_cancel:' || pl.id, jsonb_build_object('coveragePlanId', pl.id));
  end loop;
  update coverage_requests set status = 'expired', closed_reason = 'plan_ended', responded_at = coalesce(responded_at, now())
   where status in ('sent', 'discussing')
     and coverage_plan_case_id in (select id from coverage_plan_cases where coverage_plan_id = pl.id);
  return jsonb_build_object('unchanged', false);
end;
$function$;
revoke all on function public.cover_cancel_plan(bigint) from public, anon;
grant execute on function public.cover_cancel_plan(bigint) to authenticated;

delete from public.professional_events e
 using public.coverage_plans pl
 where e.event_type = 'coverage_completed'
   and e.metadata ->> 'coveragePlanId' = pl.id::text
   and pl.status = 'cancelled'
   and pl.starts_on > coalesce((select min(ev.created_at)::date from public.coverage_plan_events ev
                                 where ev.plan_id = pl.id and ev.kind = 'cancelled'), current_date);
