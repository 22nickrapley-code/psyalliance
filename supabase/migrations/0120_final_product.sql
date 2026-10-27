-- 0120: the final product. Nick's decisions D-05 to D-17 (docs/psyalliance-v13-parity/
-- final_product_decisions.md), made in the database so every screen, and anyone
-- calling the database directly, gets the same rules.
--
--   1. Who counts as licensed for a need: a reviewed licence in the client's
--      state, or PSYPACT telehealth between member states (D-17).
--   2. Eligibility also honours a pause-until date and "not open to cover" (D-05).
--   3. A lapsed licence can still say "not available"; nothing else (D-10).
--   4. Referral numbers per member and a private, guarded title (D-09, D-13).
--   5. Availability: pause-until and Cover / Consult openness (D-05).
--   6. Invitations: the inviter trusts the joiner; the joiner chooses (D-12).
--   7. Consult: the asker can mark a question resolved (D-14).
--   8. Worked with before is agreed work only (D-08).
--   9. A message can be edited for 15 minutes (D-22).
--
-- Additive and safe to run again. Apply after 0117 and 0118.

-- 1. Helpers ---------------------------------------------------------------------
-- A verified, active clinician, licence or not: someone who may still say
-- "not available". Suspended, closed and unverified accounts are not.
create or replace function private.is_active_clinician(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select p.account_kind = 'clinician' and p.verification_status = 'verified' and p.account_status = 'active'
      from profiles p where p.id = p_uid
  ), false);
$function$;
revoke all on function private.is_active_clinician(uuid) from public, anon, authenticated;

-- How a member can take on a client in a state: 'licence' (a reviewed licence
-- in that state), 'psypact' (telehealth from a PSYPACT home state into another
-- member state, virtual only) or null.
create or replace function private.licence_route(p_member uuid, p_state text, p_setting text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when exists (select 1 from private.member_state_settings s where s.profile_id = p_member and s.state = upper(coalesce(p_state, ''))) then 'licence'
    when coalesce(p_setting, 'either') in ('virtual', 'either')
     and upper(coalesce(p_state, '')) = any (private.psypact_states())
     and exists (select 1 from profiles p where p.id = p_member and p.psypact_participating
                  and private.psypact_eligible(p.primary_state, p.qualification_level::text))
     and exists (select 1 from private.member_state_settings s where s.profile_id = p_member and s.virtual)
    then 'psypact'
  end;
$function$;
revoke all on function private.licence_route(uuid, text, text) from public, anon, authenticated;

-- 2. Eligibility -----------------------------------------------------------------
-- Same checks as before, with the licence step widened for PSYPACT and two
-- additions: someone paused until a date is not asked (cover or referral), and
-- someone who set cover to "No" is not asked for cover. p_kind says which.
drop function if exists private.cover_exclusions(uuid, text, text, boolean, text, text, text, text, text, text);
create or replace function private.cover_exclusions(
  p_candidate uuid, p_state text, p_setting text, p_prescribing boolean,
  p_focus text, p_secondary text, p_age text, p_insurance text, p_language text, p_city text,
  p_kind text default 'cover')
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cand as (
    select p.id, private.role_label(p.qualification_level::text) as role, lower(coalesce(p.primary_practice_city, '')) as city,
           p.coverage_availability as cover,
           case when p.availability_paused_until >= current_date then p.availability_paused_until end as paused
      from profiles p where p.id = p_candidate
  ), route as (
    select private.licence_route(p_candidate, p_state, p_setting) as r
  ), lic as (
    select * from private.member_state_settings s where s.profile_id = p_candidate and s.state = upper(coalesce(p_state, ''))
  ), f as (
    select coalesce(array_agg(lv.value) filter (where lv.category = 'treatment_specialism'), '{}') spec,
           coalesce(array_agg(lv.value) filter (where lv.category = 'age_group_specialism'), '{}') ages,
           coalesce(array_agg(lv.value) filter (where lv.category = 'insurance'), '{}') ins,
           coalesce(array_agg(lv.value) filter (where lv.category = 'language'), '{}') langs
      from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
     where v.profile_id = p_candidate
  )
  select case when not exists (select 1 from cand) then array['Not a colleague you can ask']
  else array_remove(array[
    case when (select r from route) is null then 'No reviewed ' || upper(coalesce(p_state, '')) || ' license'
         when (select r from route) = 'licence' and (
              (p_setting = 'virtual' and not (select virtual from lic))
           or (p_setting = 'in_person' and not (select in_person from lic))
           or (p_setting = 'either' and not (select virtual from lic) and not (select in_person from lic)))
         then (case p_setting when 'virtual' then 'Virtual' when 'in_person' then 'In person' else 'Virtual or in person' end) || ' setting unavailable' end,
    case when coalesce(p_prescribing, false) and (select role from cand) <> 'Psychiatrist' then 'Prescribing required' end,
    case when nullif(p_focus, '') is not null and not ((select spec from f) @> array[p_focus]) then p_focus || ' not listed' end,
    case when nullif(p_secondary, '') is not null and not ((select spec from f) @> array[p_secondary]) then p_secondary || ' not listed' end,
    case when nullif(p_age, '') is not null and not ((select ages from f) @> array[p_age]) then p_age || ' not supported' end,
    case when nullif(p_insurance, '') is not null and not ((select ins from f) @> array[p_insurance]) then 'Insurance does not match' end,
    case when nullif(p_language, '') is not null and not ((select langs from f) @> array[p_language]) then p_language || ' not listed' end,
    case when nullif(p_city, '') is not null and p_setting = 'in_person'
          and position(lower(p_city) in (select city from cand)) = 0
          and position(lower(p_city) in lower(coalesce((select l.city from lic l), ''))) = 0
         then 'In-person city does not match' end,
    case when (select paused from cand) is not null then 'Paused until ' || to_char((select paused from cand), 'Mon FMDD') end,
    case when coalesce(p_kind, 'cover') = 'cover' and (select cover from cand) = 'no' then 'Not open to cover' end
  ], null) end;
$function$;
revoke all on function private.cover_exclusions(uuid, text, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function private.cover_case_exclusions(p_case bigint, p_candidate uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select private.cover_exclusions(
    p_candidate,
    coalesce(c.jurisdiction_state, pl.jurisdiction_state),
    coalesce(c.modality, 'either'),
    c.prescribing_needed,
    (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[1]),
    case when c.via_hub then (select lv.value from lookup_values lv where lv.id = c.specialism_lookup_ids[2]) end,
    c.age_band, c.insurance, c.language, c.city, 'cover')
  from coverage_plan_cases c join coverage_plans pl on pl.id = c.coverage_plan_id
  where c.id = p_case;
$function$;
revoke all on function private.cover_case_exclusions(bigint, uuid) from public, anon, authenticated;

create or replace function private.referral_exclusions(p_referral bigint, p_candidate uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select private.cover_exclusions(
    p_candidate, r.state,
    case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end,
    r.prescribing,
    (select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)),
    (select lv.value from lookup_values lv where lv.id = r.specialism_lookup_ids[2]),
    r.age_band, r.insurance,
    (select lv.value from lookup_values lv where lv.id = r.language_lookup_id),
    r.city, 'referral')
  from referral_requests r where r.id = p_referral;
$function$;
revoke all on function private.referral_exclusions(bigint, uuid) from public, anon, authenticated;

-- 3. A lapsed licence can still decline ----------------------------------------------
-- The table-level rules that sit under the screens say the same thing: the
-- PSYPACT route only reaches member states, and a first "not available" is
-- accepted from any active clinician.
create or replace function private.licensed_for(uid uuid, st text, telehealth boolean)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select case
    when private.profile_is_demo(uid) then true
    when st is null or trim(st) = '' then public.has_active_licence(uid)
    else exists (
      select 1 from licenses l
      where l.profile_id = uid
        and upper(trim(l.state)) = upper(trim(st))
        and l.status = 'active'
        and l.reviewed_at is not null
        and (l.expiration_date is null or l.expiration_date >= current_date)
    ) or (
      coalesce(telehealth, false)
      and upper(trim(st)) = any (private.psypact_states())
      and public.has_active_licence(uid)
      and coalesce((select psypact_participating from profiles where id = uid), false)
    )
  end;
$function$;

create or replace function public.guard_referral_response()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  if auth.uid() is null or auth.uid() <> new.responding_profile_id then
    return new;
  end if;
  select * into r from referral_requests where id = new.referral_request_id;
  if new.status::text = 'unavailable' then
    if not private.is_active_clinician(new.responding_profile_id) then
      raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
    end if;
  else
    if not private.is_network_member(new.responding_profile_id) then
      raise exception 'Your account needs to be verified, with a reviewed license, before you can reply to referrals.' using errcode = 'P0001';
    end if;
    if r.id is not null and not private.licensed_for(new.responding_profile_id, r.state, coalesce(r.modality, 'either') in ('virtual', 'either', 'telehealth')) then
      raise exception 'You need a reviewed license in % to take this referral.' , r.state using errcode = 'P0001';
    end if;
  end if;
  if r.id is not null and private.profile_is_demo(r.requesting_profile_id) <> public.viewer_is_demo() then
    raise exception 'That referral isn''t available.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

create or replace function public.cover_answer(p_request bigint, p_response text, p_question text default null, p_client_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  rq coverage_requests%rowtype;
  cs coverage_plan_cases%rowtype;
  pl coverage_plans%rowtype;
  changed boolean := false;
  q text := btrim(coalesce(p_question, ''));
  conv bigint;
  msg bigint;
  ckey text;
  excl text[];
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_response not in ('accepted', 'declined', 'discussing') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select * into rq from coverage_requests where id = p_request;
  if not found or rq.requested_profile_id <> me then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  -- One answer at a time per client: two colleagues answering together queue here.
  select * into cs from coverage_plan_cases where id = rq.coverage_plan_case_id for update;
  select * into pl from coverage_plans where id = cs.coverage_plan_id;
  select * into rq from coverage_requests where id = p_request;
  if public.is_blocked_between(me, pl.profile_id) then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  -- A lapsed licence can still say "not available"; nothing else. A closed or
  -- suspended account can do nothing.
  if not private.is_active_clinician(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  if p_response <> 'declined' and not private.is_network_member(me) then
    raise exception 'Your license isn''t current, so you can only decline this request.' using errcode = 'P0001';
  end if;
  if p_response = 'discussing' then
    if q = '' then
      raise exception 'Write your question first.' using errcode = 'P0001';
    end if;
    if length(q) > 2000 then
      raise exception 'Keep the question under 2,000 characters.' using errcode = 'P0001';
    end if;
  end if;

  if rq.status::text <> p_response then
    if p_response = 'accepted' then
      excl := private.cover_case_exclusions(cs.id, me);
      if excl[1] like 'No reviewed %' then
        raise exception 'Your license for % isn''t current, so you can''t take on this client.', coalesce(cs.jurisdiction_state, pl.jurisdiction_state) using errcode = 'P0001';
      end if;
    end if;
    update coverage_requests set status = p_response::coverage_request_status, responded_at = now() where id = p_request;
    changed := true;
  end if;

  if p_response = 'discussing' then
    ckey := 'cover-' || pl.id || '-' || cs.id || '-' || me;
    conv := private.context_conversation(ckey, pl.title || ' · ' || cs.case_reference, array[pl.profile_id, me], me,
                                         pl.profile_id, private.cover_request_text(pl.id, cs.id), rq.sent_at);
    msg := private.post_message(conv, me, q, p_client_message_id, '/dashboard/messages?thread=' || ckey);
  end if;

  if changed then
    perform private.professional_event('coverage_response', me, pl.profile_id, 'responded "' || p_response || '" to a coverage request',
                                       jsonb_build_object('coverageRequestId', p_request, 'response', p_response),
                                       greatest(0, extract(epoch from now() - rq.sent_at)::integer));
    if p_response = 'accepted' then
      perform private.professional_event('coverage_confirmed', me, pl.profile_id, null,
                                         jsonb_build_object('coverageRequestId', p_request, 'coveragePlanCaseId', cs.id));
    end if;
    perform private.notify_member(case when p_response = 'accepted' then 'coverage_confirmed' else 'coverage_response' end,
                                  pl.profile_id, me,
                                  case p_response when 'accepted' then 'confirmed they can cover your client'
                                                  when 'discussing' then 'asked a question about your coverage request'
                                                  else 'responded "declined" to your coverage request' end,
                                  '/dashboard/cover?plan=' || pl.id, 'coverage_response:' || p_request || ':' || p_response,
                                  jsonb_build_object('coverageRequestId', p_request, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;
revoke all on function public.cover_answer(bigint, text, text, uuid) from public, anon;
grant execute on function public.cover_answer(bigint, text, text, uuid) to authenticated;

create or replace function public.referral_answer(p_referral bigint, p_response text, p_capacity boolean default false, p_question text default null, p_client_message_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  r referral_requests%rowtype;
  rc referral_recipients%rowtype;
  rs referral_responses%rowtype;
  new_status text;
  q text := btrim(coalesce(p_question, ''));
  changed boolean := false;
  conv bigint;
  msg bigint;
  ckey text;
  secs integer;
  lic boolean;
  has_rs boolean;
  new_id bigint;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if p_response not in ('interested', 'declined', 'discussing') then
    raise exception 'Choose a response.' using errcode = 'P0001';
  end if;
  select * into r from referral_requests where id = p_referral for update;
  if not found or r.requesting_profile_id = me or public.is_blocked_between(me, r.requesting_profile_id) then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  select * into rc from referral_recipients where referral_request_id = p_referral and profile_id = me;
  if not found then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  select * into rs from referral_responses where referral_request_id = p_referral and responding_profile_id = me;
  has_rs := found;
  if has_rs and rs.status::text = 'accepted' then
    raise exception 'You''ve already been chosen for this referral.' using errcode = 'P0001';
  end if;
  if r.status::text not in ('open', 'sent', 'matched') then
    raise exception 'This referral is no longer taking replies.' using errcode = 'P0001';
  end if;
  -- A lapsed licence can still say "not available"; nothing else.
  if not private.is_active_clinician(me) then
    raise exception 'Your account isn''t active in the network right now.' using errcode = 'P0001';
  end if;
  if p_response <> 'declined' and not private.is_network_member(me) then
    raise exception 'Your license isn''t current, so you can only decline this referral.' using errcode = 'P0001';
  end if;

  if p_response = 'interested' then
    if not coalesce(p_capacity, false) then
      raise exception 'Confirm your current capacity to express interest.' using errcode = 'P0001';
    end if;
    lic := private.licence_route(me, r.state,
             case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end) is not null;
    if not lic then
      raise exception 'You need a reviewed license in % to take this referral.', r.state using errcode = 'P0001';
    end if;
  elsif p_response = 'discussing' then
    if q = '' then
      raise exception 'Write your question first.' using errcode = 'P0001';
    end if;
    if length(q) > 2000 then
      raise exception 'Keep the question under 2,000 characters.' using errcode = 'P0001';
    end if;
  end if;

  new_status := case p_response when 'interested' then 'interested' when 'declined' then 'unavailable' else 'question' end;
  if not has_rs then
    insert into referral_responses (referral_request_id, responding_profile_id, status, message, responded_at, capacity_confirmed_at)
    values (p_referral, me, new_status::referral_response_status, case when p_response = 'discussing' then q end, now(),
            case when p_response = 'interested' then now() end)
    on conflict (referral_request_id, responding_profile_id) do nothing
    returning id into new_id;
    changed := new_id is not null;
  elsif rs.status::text <> new_status then
    update referral_responses
       set status = new_status::referral_response_status, responded_at = now(),
           message = case when p_response = 'discussing' then q else message end,
           capacity_confirmed_at = case when p_response = 'interested' then now() else capacity_confirmed_at end
     where id = rs.id;
    changed := true;
  end if;

  if p_response = 'discussing' then
    ckey := 'referral-' || p_referral || '-' || me;
    conv := private.context_conversation(ckey, private.referral_label(p_referral) || ' · ' || coalesce((select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)), 'Client need'),
                                         array[r.requesting_profile_id, me], me,
                                         r.requesting_profile_id, private.referral_request_text(p_referral), rc.sent_at);
    msg := private.post_message(conv, me, q, p_client_message_id, '/dashboard/messages?thread=' || ckey);
  end if;

  if changed then
    secs := greatest(0, extract(epoch from now() - rc.sent_at)::integer);
    perform private.professional_event('referral_response', me, r.requesting_profile_id, 'responded "' || p_response || '" to a referral request',
                                       jsonb_build_object('referralRequestId', p_referral, 'response', p_response), secs);
    perform private.notify_member('referral_response', r.requesting_profile_id, me,
                                  case p_response when 'interested' then 'is interested in your referral request'
                                                  when 'discussing' then 'asked a question about your referral request'
                                                  else 'is not available for your referral request' end,
                                  '/dashboard/referrals?referral=' || p_referral, 'referral_response:' || p_referral || ':' || me || ':' || p_response,
                                  jsonb_build_object('referralRequestId', p_referral, 'response', p_response));
  end if;
  return jsonb_build_object('status', p_response, 'unchanged', not changed, 'conversationKey', ckey, 'messageId', msg);
end;
$function$;
revoke all on function public.referral_answer(bigint, text, boolean, text, uuid) from public, anon;
grant execute on function public.referral_answer(bigint, text, boolean, text, uuid) to authenticated;

-- 4. Referral numbers and private titles ----------------------------------------
-- Each member's referrals are numbered from 1 in the order they were made. The
-- number is shown to both sides ("Referral 3"); the title is the referrer's own
-- note to themselves and is never sent to anyone else.
alter table public.referral_requests add column if not exists member_seq integer;
update public.referral_requests r
   set member_seq = x.n
  from (select id, row_number() over (partition by requesting_profile_id order by created_at, id) as n
          from public.referral_requests) x
 where x.id = r.id and r.member_seq is null;
create unique index if not exists referral_requests_member_seq_idx on public.referral_requests (requesting_profile_id, member_seq);

create or replace function private.referral_assign_number()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.member_seq is null then
    perform pg_advisory_xact_lock(hashtext('referral_seq:' || new.requesting_profile_id::text));
    select coalesce(max(member_seq), 0) + 1 into new.member_seq from referral_requests where requesting_profile_id = new.requesting_profile_id;
  end if;
  return new;
end;
$function$;
revoke all on function private.referral_assign_number() from public, anon, authenticated;
drop trigger if exists referral_assign_number on public.referral_requests;
create trigger referral_assign_number before insert on public.referral_requests
  for each row execute function private.referral_assign_number();

-- The title lives in its own table so it can never be read by anyone but its
-- owner, through the table or through a referral the other side can see.
create table if not exists public.referral_titles (
  referral_request_id bigint primary key references public.referral_requests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table public.referral_titles enable row level security;
revoke all on public.referral_titles from anon, authenticated;

-- Why a title can't be used, or null when it can. A reminder to the referrer,
-- not a promise: titles are private, but a client's name, initials or contact
-- details do not belong in them.
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
    if tok ~ '^[A-Z]{2}$' and private.state_name(tok) = tok then
      return 'Please don''t use a client''s initials. Describe the need instead, for example "Anxiety, evenings".';
    end if;
  end loop;
  return null;
end;
$function$;
revoke all on function private.referral_title_problem(text) from public, anon, authenticated;

create or replace function private.referral_label(p_id bigint)
returns text
language sql
stable
as $function$
  select 'Referral ' || coalesce((select r.member_seq from referral_requests r where r.id = p_id), p_id)::text;
$function$;
revoke all on function private.referral_label(bigint) from public, anon, authenticated;

-- Existing conversations about a referral carry the new number.
update public.conversations c
   set title = regexp_replace(c.title, '^Referral [0-9]+', private.referral_label(substring(c.context_key from '^referral-([0-9]+)-')::bigint))
 where c.context_key ~ '^referral-[0-9]+-' and c.title ~ '^Referral [0-9]+';

-- Set, change or clear (empty) the title. Only the referrer, any time.
create or replace function public.referral_set_title(p_referral bigint, p_title text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  t text := btrim(coalesce(p_title, ''));
  problem text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from referral_requests where id = p_referral and requesting_profile_id = me) then
    raise exception 'Referral not found.' using errcode = 'P0001';
  end if;
  if t = '' then
    delete from referral_titles where referral_request_id = p_referral;
    return jsonb_build_object('title', null);
  end if;
  problem := private.referral_title_problem(t);
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
  insert into referral_titles (referral_request_id, profile_id, title, updated_at) values (p_referral, me, t, now())
  on conflict (referral_request_id) do update set title = excluded.title, updated_at = now();
  return jsonb_build_object('title', t);
end;
$function$;
revoke all on function public.referral_set_title(bigint, text) from public, anon;
grant execute on function public.referral_set_title(bigint, text) to authenticated;

create or replace function public.referral_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  req_id uuid;
  ref_id bigint;
  st text;
  setting text;
  focus_name text;
  sec_name text;
  focus_id integer;
  sec_id integer;
  age_v text;
  ins_v text;
  lang_v text;
  lang_id integer;
  v_city text;
  aud text;
  tf text;
  msg text;
  ttl text;
  cand uuid[];
  kept uuid[] := '{}';
  pid uuid;
  excl text[];
  dropped jsonb := '[]'::jsonb;
  n integer := 0;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can make a referral.' using errcode = 'P0001';
  end if;
  req_id := nullif(p_payload ->> 'requestId', '')::uuid;
  if req_id is not null then
    perform pg_advisory_xact_lock(hashtext('referral_create:' || me::text || req_id::text));
    select id into ref_id from referral_requests where requesting_profile_id = me and client_request_id = req_id;
    if found then
      return jsonb_build_object('referralId', ref_id, 'unchanged', true, 'dropped', '[]'::jsonb);
    end if;
  end if;

  st := upper(coalesce(p_payload ->> 'state', ''));
  if st !~ '^[A-Z]{2}$' then
    raise exception 'Choose the client''s state.' using errcode = 'P0001';
  end if;
  setting := coalesce(nullif(p_payload ->> 'setting', ''), 'either');
  if setting not in ('virtual', 'in_person', 'either') then
    raise exception 'Choose a setting.' using errcode = 'P0001';
  end if;
  focus_name := btrim(coalesce(p_payload ->> 'focus', ''));
  select id into focus_id from lookup_values where category = 'treatment_specialism' and value = focus_name;
  if focus_id is null then
    raise exception 'Choose a main treatment area.' using errcode = 'P0001';
  end if;
  sec_name := btrim(coalesce(p_payload ->> 'secondary', ''));
  if sec_name <> '' then
    select id into sec_id from lookup_values where category = 'treatment_specialism' and value = sec_name;
    if sec_id is null or sec_name = focus_name then
      raise exception 'Choose a different second treatment area.' using errcode = 'P0001';
    end if;
  end if;
  age_v := nullif(btrim(coalesce(p_payload ->> 'age', '')), '');
  if age_v is not null and not exists (select 1 from lookup_values where category = 'age_group_specialism' and value = age_v) then
    raise exception 'Choose an age group from the list.' using errcode = 'P0001';
  end if;
  ins_v := nullif(btrim(coalesce(p_payload ->> 'insurance', '')), '');
  if ins_v is not null and not exists (select 1 from lookup_values where category = 'insurance' and value = ins_v) then
    raise exception 'Choose insurance from the list.' using errcode = 'P0001';
  end if;
  lang_v := nullif(btrim(coalesce(p_payload ->> 'language', '')), '');
  if lang_v is not null then
    select id into lang_id from lookup_values where category = 'language' and value = lang_v;
    if lang_id is null then
      raise exception 'Choose a language from the list.' using errcode = 'P0001';
    end if;
  end if;
  v_city := nullif(btrim(coalesce(p_payload ->> 'city', '')), '');
  if length(coalesce(v_city, '')) > 80 then
    raise exception 'Shorten the city.' using errcode = 'P0001';
  end if;
  aud := coalesce(nullif(p_payload ->> 'audience', ''), 'selected');
  if aud not in ('selected', 'trusted', 'network') then
    raise exception 'Choose who receives this referral.' using errcode = 'P0001';
  end if;
  tf := case lower(btrim(coalesce(p_payload ->> 'timeframe', '')))
          when 'as soon as possible' then 'urgent' when 'urgent' then 'urgent'
          when 'within two weeks' then 'within_two_weeks' when 'within_two_weeks' then 'within_two_weeks'
          when 'within a month' then 'within_month' when 'within_month' then 'within_month'
          when 'flexible' then 'flexible' else null end;
  if tf is null then
    raise exception 'Choose a timeframe.' using errcode = 'P0001';
  end if;
  ttl := btrim(coalesce(p_payload ->> 'title', ''));
  if ttl <> '' and private.referral_title_problem(ttl) is not null then
    raise exception '%', private.referral_title_problem(ttl) using errcode = 'P0001';
  end if;
  msg := btrim(coalesce(p_payload ->> 'message', ''));
  if length(msg) > 600 then
    raise exception 'Keep the note under 600 characters.' using errcode = 'P0001';
  end if;

  insert into referral_requests (requesting_profile_id, specialism_lookup_id, specialism_lookup_ids, state, insurance, notes, status, city,
                                 audience_type, audience_profile_ids, age_band, modality, language_lookup_id, timeframe, prescribing, client_request_id)
  values (me, focus_id, array_remove(array[focus_id, sec_id], null), st, ins_v, nullif(msg, ''), 'sent', v_city,
          case aud when 'network' then 'wider_network' else aud end, '{}', age_v, setting, lang_id, tf,
          coalesce((p_payload ->> 'prescribing')::boolean, false), req_id)
  returning id into ref_id;
  if ttl <> '' then
    insert into referral_titles (referral_request_id, profile_id, title) values (ref_id, me, ttl);
  end if;

  -- The people the audience names (never the referrer), in the order chosen.
  if aud = 'selected' then
    select coalesce(array_agg(x.id order by x.o), '{}') into cand
      from (select (e.value)::uuid as id, min(e.ordinality) as o
              from jsonb_array_elements_text(coalesce(p_payload -> 'selected', '[]'::jsonb)) with ordinality e(value, ordinality)
             where (e.value)::uuid <> me
             group by (e.value)::uuid) x;
    if array_length(cand, 1) > 100 then
      raise exception 'Ask up to 100 colleagues at once.' using errcode = 'P0001';
    end if;
  elsif aud = 'trusted' then
    select coalesce(array_agg(t.colleague_id order by t.created_at, t.colleague_id), '{}') into cand
      from trusted_colleagues t where t.profile_id = me and t.colleague_id <> me;
  else
    select coalesce(array_agg(vm.id order by private.member_name(vm.id), vm.id), '{}') into cand
      from private.visible_members(me) vm where vm.id <> me;
  end if;
  if array_length(cand, 1) > 500 then
    raise exception 'That audience is too wide to notify at once. Choose selected colleagues or a narrower need.' using errcode = 'P0001';
  end if;

  -- Each one is checked against this client's needs now, not when they were shown.
  foreach pid in array cand loop
    excl := case when exists (select 1 from private.visible_members(me) vm where vm.id = pid)
                 then private.referral_exclusions(ref_id, pid)
                 else array['Not a colleague you can ask'] end;
    if array_length(excl, 1) is null then
      kept := kept || pid;
    elsif aud = 'selected' then
      dropped := dropped || jsonb_build_object('person', pid, 'reasons', to_jsonb(excl));
    end if;
  end loop;
  if aud = 'selected' and array_length(kept, 1) is null then
    raise exception 'Select at least one eligible colleague, or choose a wider audience.' using errcode = 'P0001';
  end if;

  if array_length(kept, 1) is not null then
    insert into referral_recipients (referral_request_id, profile_id, ord, sent_at)
    select ref_id, k.id, k.o::integer, now() from unnest(kept) with ordinality as k(id, o)
    on conflict do nothing;
    if aud = 'selected' then
      update referral_requests set audience_profile_ids = kept where id = ref_id;
    end if;
    foreach pid in array kept loop
      n := n + 1;
      perform private.notify_member('referral_sent', pid, me, 'sent you a referral request',
                                    '/dashboard/referrals?referral=' || ref_id, 'referral:' || ref_id || ':' || pid,
                                    jsonb_build_object('referralRequestId', ref_id));
    end loop;
  end if;
  perform private.professional_event('referral_sent', me, null, 'sent a referral request',
                                     jsonb_build_object('referralRequestId', ref_id, 'audienceType', aud));
  return jsonb_build_object('referralId', ref_id, 'number', (select member_seq from referral_requests where id = ref_id), 'unchanged', false, 'dropped', dropped, 'asked', n);
end;
$function$;
revoke all on function public.referral_create(jsonb) from public, anon;
grant execute on function public.referral_create(jsonb) to authenticated;

create or replace function private.referral_json(p_referral bigint, p_viewer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r referral_requests%rowtype;
  own boolean;
  st text;
  chosen uuid;
  reqs jsonb;
begin
  select * into r from referral_requests where id = p_referral;
  own := r.requesting_profile_id = p_viewer;
  select responding_profile_id into chosen from referral_responses where referral_request_id = r.id and status = 'accepted' limit 1;
  st := case when r.status::text in ('connected', 'handoff') then 'placed'
             when r.status::text = 'closed' then case when chosen is not null then 'placed' else 'withdrawn' end
             else 'discussion' end;
  select coalesce(jsonb_agg(x.j order by x.ord, x.sent, x.k), '[]'::jsonb) into reqs
    from (
      select rc.ord, rc.sent_at as sent, rc.profile_id as k,
             jsonb_build_object(
               'id', r.id || '-' || rc.profile_id,
               'person', case when rc.profile_id = p_viewer then 'me' else rc.profile_id::text end,
               'status', case when b.base in ('awaiting', 'interested', 'discussing') and st <> 'discussion' then 'closed' else b.base end,
               'order', rc.ord, 'sentAt', rc.sent_at, 'respondedAt', rs.responded_at, 'capacityConfirmedAt', rs.capacity_confirmed_at,
               'beforeWithdrawal', case when st = 'withdrawn' and b.base in ('awaiting', 'interested', 'discussing') then b.base end) as j
        from referral_recipients rc
        left join referral_responses rs on rs.referral_request_id = rc.referral_request_id and rs.responding_profile_id = rc.profile_id
        cross join lateral (select case rs.status::text when 'accepted' then 'placed' when 'interested' then 'interested' when 'offered' then 'interested'
                                                       when 'question' then 'discussing' when 'unavailable' then 'declined' when 'withdrawn' then 'declined'
                                                       else 'awaiting' end as base) b
       where rc.referral_request_id = r.id and (own or rc.profile_id = p_viewer)
    ) x;
  return jsonb_build_object(
    'id', r.id,
    'number', coalesce(r.member_seq, r.id),
    'label', 'Referral ' || coalesce(r.member_seq, r.id),
    'title', case when own then (select t.title from referral_titles t where t.referral_request_id = r.id) end,
    'owner', case when own then 'me' else r.requesting_profile_id::text end,
    'focus', coalesce((select lv.value from lookup_values lv where lv.id = coalesce(r.specialism_lookup_ids[1], r.specialism_lookup_id)), ''),
    'secondary', coalesce((select lv.value from lookup_values lv where lv.id = r.specialism_lookup_ids[2]), ''),
    'state', upper(coalesce(r.state, '')),
    'city', coalesce(r.city, ''),
    'age', coalesce(r.age_band, ''),
    'setting', case when r.modality in ('virtual', 'telehealth') then 'virtual' when r.modality in ('in_person', 'in-person', 'face_to_face', 'f2f') then 'in_person' else 'either' end,
    'insurance', coalesce(r.insurance, ''),
    'language', coalesce((select lv.value from lookup_values lv where lv.id = r.language_lookup_id), ''),
    'prescribing', r.prescribing,
    'status', st,
    'audience', case r.audience_type when 'wider_network' then 'network' when 'suggested' then 'selected' else r.audience_type end,
    'timeframe', case r.timeframe when 'urgent' then 'As soon as possible' when 'within_two_weeks' then 'Within two weeks'
                                  when 'within_month' then 'Within a month' else 'Flexible' end,
    'message', coalesce(r.notes, ''),
    'requests', reqs,
    'placedWith', case when chosen is null then null when own then chosen::text when chosen = p_viewer then 'me' else null end,
    'placedElsewhere', (not own and st = 'placed' and chosen is distinct from p_viewer),
    'createdAt', r.created_at,
    'withdrawnAt', case when st = 'withdrawn' then coalesce(r.withdrawn_at, r.closed_at) end);
end;
$function$;
revoke all on function private.referral_json(bigint, uuid) from public, anon, authenticated;

-- 5. Availability: pause-until, Cover and Consult openness -----------------------
-- "open" is now what the member chose (accepting referrals); a pause-until date
-- is shown beside it and closes referrals and cover until that day.
create or replace function public.my_availability()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'open', p.referral_availability in ('yes', 'limited'),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'ask_me' then 'ask' when 'no' then 'no' else 'yes' end,
    'consult', p.consultation_availability is distinct from 'no',
    'states', coalesce((
      select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
        from private.member_state_settings s where s.profile_id = p.id
    ), '{}'::jsonb))
  from public.profiles p where p.id = auth.uid();
$function$;
revoke all on function public.my_availability() from public, anon;
grant execute on function public.my_availability() to authenticated;

-- One overall number, settings per licensed state, and the extras. p_states is
-- {"NY": {"virtual": true, "inPerson": false, "city": ""}, ...}. The screen
-- always sends the whole form: an empty p_paused_until clears a pause; p_cover
-- ('yes', 'ask', 'no') and p_consult ('yes', 'no') left out keep what is saved.
drop function if exists public.set_my_availability(boolean, integer, jsonb);
create or replace function public.set_my_availability(
  p_open boolean, p_spaces integer, p_states jsonb,
  p_paused_until date default null, p_cover text default null, p_consult text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  k text;
  v jsonb;
  any_setting boolean := false;
  cur text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if not private.is_network_member(me) then
    raise exception 'Your account needs to be verified, with a reviewed license, before you can set availability.' using errcode = 'P0001';
  end if;
  if p_spaces is null or p_spaces < 0 or p_spaces > 100 then
    raise exception 'Spaces must be a number from 0 to 100.' using errcode = 'P0001';
  end if;
  if p_paused_until is not null and (p_paused_until < current_date or p_paused_until > current_date + 365) then
    raise exception 'Choose a pause end date between today and a year from now.' using errcode = 'P0001';
  end if;
  if p_cover is not null and p_cover not in ('yes', 'ask', 'no') then
    raise exception 'Choose yes, ask me first or no for cover.' using errcode = 'P0001';
  end if;
  if p_consult is not null and p_consult not in ('yes', 'no') then
    raise exception 'Choose yes or no for consultation.' using errcode = 'P0001';
  end if;
  p_states := coalesce(p_states, '{}'::jsonb);
  if jsonb_typeof(p_states) <> 'object' then
    raise exception 'Choose settings for your licensed states.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_states) loop
    if not exists (select 1 from private.member_state_settings s where s.profile_id = me and s.state = upper(k)) then
      raise exception 'You have no reviewed license in %.', k using errcode = 'P0001';
    end if;
    if coalesce((v ->> 'inPerson')::boolean, false) and length(trim(coalesce(v ->> 'city', ''))) = 0 then
      raise exception 'Add the in-person city for %.', k using errcode = 'P0001';
    end if;
    if coalesce((v ->> 'virtual')::boolean, false) or coalesce((v ->> 'inPerson')::boolean, false) then
      any_setting := true;
    end if;
  end loop;
  if p_open and p_spaces > 0 and not any_setting then
    raise exception 'Choose at least one state and setting for your available spaces.' using errcode = 'P0001';
  end if;
  for k, v in select * from jsonb_each(p_states) loop
    insert into profile_state_settings (profile_id, state, virtual, in_person, city, updated_at)
    values (me, upper(k), coalesce((v ->> 'virtual')::boolean, false), coalesce((v ->> 'inPerson')::boolean, false),
            nullif(trim(coalesce(v ->> 'city', '')), ''), now())
    on conflict (profile_id, state) do update
      set virtual = excluded.virtual, in_person = excluded.in_person, city = excluded.city, updated_at = now();
  end loop;
  select referral_availability into cur from profiles where id = me;
  update profiles
     set approx_spaces = p_spaces,
         referral_availability = case when p_open then (case when cur = 'limited' then 'limited' else 'yes' end) else 'no' end,
         availability_paused_until = p_paused_until,
         accepting_referrals = p_open and p_paused_until is null,
         coverage_availability = case p_cover when 'yes' then 'yes' when 'ask' then 'ask_me' when 'no' then 'no' else coverage_availability end,
         consultation_availability = case p_consult when 'yes' then 'yes' when 'no' then 'no' else consultation_availability end,
         availability_confirmed_at = now()
   where id = me;
  return public.my_availability();
end;
$function$;
revoke all on function public.set_my_availability(boolean, integer, jsonb, date, text, text) from public, anon;
grant execute on function public.set_my_availability(boolean, integer, jsonb, date, text, text) to authenticated;

create or replace function public.workspace_me()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', 'me',
    'profileId', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce((select jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state)
                            from private.member_state_settings s where s.profile_id = p.id), '{}'::jsonb),
    'specialties', coalesce((select jsonb_agg(lv.value order by v.rank nulls last, lv.value)
                               from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
                              where v.profile_id = p.id and lv.category = 'treatment_specialism'), '[]'::jsonb),
    'slots', coalesce(p.approx_spaces, 0),
    'confirmedAt', p.availability_confirmed_at,
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'ask_me' then 'ask' when 'no' then 'no' else 'yes' end,
    'consult', p.consultation_availability is distinct from 'no',
    'psypact', p.psypact_participating,
    'avatarPath', p.avatar_path,
    'isAdmin', p.is_admin
  )
  from profiles p where p.id = auth.uid();
$function$;
revoke all on function public.workspace_me() from public, anon;
grant execute on function public.workspace_me() to authenticated;

create or replace function public.workspace_people()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with vm as (select * from private.visible_members(auth.uid())),
  facts as (
    select v.profile_id,
      array_agg(lv.value order by v.rank nulls last, lv.value) filter (where lv.category = 'treatment_specialism') focus,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'insurance') insurance,
      array_agg(lv.value order by lv.id) filter (where lv.category = 'age_group_specialism') ages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'language') languages,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'treatment_modality') modalities,
      array_agg(lv.value order by lv.value) filter (where lv.category = 'session_type') sessions
    from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id in (select id from vm)
    group by v.profile_id
  ),
  lic as (
    select s.profile_id, jsonb_object_agg(s.state, jsonb_build_object('virtual', s.virtual, 'inPerson', s.in_person, 'city', coalesce(s.city, '')) order by s.state) licenses
      from private.member_state_settings s
     where s.profile_id in (select id from vm)
     group by s.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', regexp_replace(p.full_name, '^(dr\.?)\s+', '', 'i'),
    'initials', private.initials(p.full_name),
    'credential', coalesce(p.qualification_level::text, ''),
    'role', private.role_label(p.qualification_level::text),
    'state', coalesce(upper(trim(p.primary_state)), ''),
    'city', coalesce(p.primary_practice_city, ''),
    'licenses', coalesce(lic.licenses, '{}'::jsonb),
    'specialties', to_jsonb(coalesce(f.focus, '{}'::text[])),
    'slots', case when p.referral_availability = 'no' or (p.availability_paused_until is not null and p.availability_paused_until >= current_date) then 0 else coalesce(p.approx_spaces, 0) end,
    'confirmedAt', p.availability_confirmed_at,
    'languages', to_jsonb(coalesce(f.languages, '{}'::text[])),
    'ages', to_jsonb(coalesce(f.ages, '{}'::text[])),
    'insurance', to_jsonb(coalesce(f.insurance, '{}'::text[])),
    'modalities', to_jsonb(coalesce(f.modalities, '{}'::text[])),
    'sessionTypes', to_jsonb(coalesce(f.sessions, '{}'::text[])),
    'psypact', p.psypact_participating,
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'yes' then 'yes' when 'ask_me' then 'ask' when 'no' then 'no' end,
    'consult', p.consultation_availability is distinct from 'no',
    'bio', coalesce(p.bio, ''),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;

-- 6. Invitations -----------------------------------------------------------------
-- The person who invited a colleague trusts them from the day they are both in
-- the network. The colleague chooses: the inviter is at the top of their
-- Suggested list, one tap from being added. (Connections made by earlier
-- invitations are left as they are.)
create or replace function private.activate_member_invites(p_uid uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare u record; n int := 0;
begin
  if p_uid is null then return 0; end if;
  for u in
    select * from member_invite_uses
    where connected_at is null and (invitee = p_uid or inviter = p_uid)
    for update skip locked
  loop
    continue when not (private.is_network_member(u.inviter) and private.is_network_member(u.invitee));
    continue when (select is_demo from profiles where id = u.inviter) is distinct from (select is_demo from profiles where id = u.invitee);
    continue when public.is_blocked_between(u.inviter, u.invitee);
    perform set_config('pa.invite_activation', 'on', true);
    insert into trusted_colleagues (profile_id, colleague_id) values (u.inviter, u.invitee) on conflict do nothing;
    perform set_config('pa.invite_activation', '', true);
    insert into suggested_colleagues (profile_id, colleague_id, position) values (u.invitee, u.inviter, -1)
    on conflict (profile_id, colleague_id) do update set position = least(suggested_colleagues.position, -1);
    update member_invite_uses set connected_at = now() where id = u.id;
    perform private.notify_member(u.inviter, u.invitee, 'joined through your invitation and is now in your trusted colleagues', '/dashboard/people/' || u.invitee);
    perform private.notify_member(u.invitee, u.inviter, 'invited you to PsyAlliance. You can add them to your trusted colleagues', '/dashboard/people/' || u.inviter);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- 7. Consult: resolved questions ------------------------------------------------
-- The asker marks their own question resolved (and can reopen it). A resolved
-- question takes no new replies, wherever the reply comes from.
create or replace function public.consult_resolve(p_consultation bigint, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  c consultations%rowtype;
  st text;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  select * into c from consultations where id = p_consultation for update;
  if not found or c.author_profile_id <> me or c.status not in ('open', 'responses_received', 'resolved') then
    raise exception 'Only the person who asked can do this.' using errcode = 'P0001';
  end if;
  if coalesce(p_on, false) then
    st := 'resolved';
  else
    st := case when exists (select 1 from consultation_responses r where r.consultation_id = c.id) then 'responses_received' else 'open' end;
  end if;
  update consultations set status = st, resolved_at = case when st = 'resolved' then coalesce(resolved_at, now()) end where id = c.id;
  return jsonb_build_object('status', st);
end;
$function$;
revoke all on function public.consult_resolve(bigint, boolean) from public, anon;
grant execute on function public.consult_resolve(bigint, boolean) to authenticated;

create or replace function private.consult_no_reply_when_resolved()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('pa.seeding', true) = 'on' then
    return new;
  end if;
  if exists (select 1 from consultations c where c.id = new.consultation_id and c.status = 'resolved') then
    raise exception 'This question has been marked resolved, so it is not taking new replies.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
revoke all on function private.consult_no_reply_when_resolved() from public, anon, authenticated;
drop trigger if exists consult_no_reply_when_resolved on public.consultation_responses;
create trigger consult_no_reply_when_resolved before insert on public.consultation_responses
  for each row execute function private.consult_no_reply_when_resolved();

-- 8. Worked with before ----------------------------------------------------------
-- Agreed work only: completed cover, a placed referral, a recorded
-- collaboration. A reply to someone's consult question does not count.
create or replace view public.worked_with_before as
with completed as (
  select actor_profile_id as profile_id, related_profile_id as colleague_id, created_at
    from professional_events
   where event_type in ('coverage_completed', 'referral_outcome')
     and related_profile_id is not null
  union all
  select related_profile_id as profile_id, actor_profile_id as colleague_id, created_at
    from professional_events
   where event_type in ('coverage_completed', 'referral_outcome')
     and actor_profile_id is not null
)
select profile_id, colleague_id, count(*) as interaction_count, max(created_at) as last_interaction_at
  from completed
 where profile_id <> colleague_id
 group by profile_id, colleague_id;
alter view public.worked_with_before set (security_invoker = true);

-- 9. Messages: edit for 15 minutes ------------------------------------------------
create or replace function public.message_edit(p_key text, p_message text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  conv bigint := private.thread_conversation(p_key, me);
  mid bigint;
  txt text := btrim(coalesce(p_body, ''));
begin
  if conv is null then
    raise exception 'Conversation not found.' using errcode = 'P0001';
  end if;
  mid := private.thread_message(conv, p_message);
  if mid is null or not exists (select 1 from conversation_messages where id = mid and author_id = me and deleted_at is null) then
    raise exception 'Message not found.' using errcode = 'P0001';
  end if;
  if exists (select 1 from conversation_messages where id = mid and created_at < now() - interval '15 minutes') then
    raise exception 'A message can only be edited for 15 minutes after it is sent. You can still remove it.' using errcode = 'P0001';
  end if;
  if txt = '' then
    raise exception 'A message can''t be empty. Remove it instead.' using errcode = 'P0001';
  end if;
  if length(txt) > 4000 then
    raise exception 'Keep the message under 4,000 characters.' using errcode = 'P0001';
  end if;
  if exists (select 1 from message_attachments where message_id = mid and kind = 'audio') then
    raise exception 'A voice note can''t be edited.' using errcode = 'P0001';
  end if;
  update conversation_messages set body = txt where id = mid and body is distinct from txt;
  return jsonb_build_object('ok', true);
end;
$function$;
revoke all on function public.message_edit(text, text, text) from public, anon;
grant execute on function public.message_edit(text, text, text) to authenticated;

notify pgrst, 'reload schema';
