-- PsyAlliance 1.0 corrections. Safe to run more than once.

-- 1. Lifecycle events (review F09) ----------------------------------------------------------------
-- A visitor (anon) can no longer write the "real" namespace; only a signed-in member's own product
-- actions can. "demo_started" separates opening a demo from completing an exercise.
alter table public.lifecycle_events drop constraint if exists lifecycle_events_event_check;
alter table public.lifecycle_events add constraint lifecycle_events_event_check check (event in (
  'guide_start', 'guide_choice', 'demo_started', 'interaction_complete', 'interaction_skip', 'recipient_preview', 'summary_continue',
  'handoff_adopted', 'handoff_cleared', 'task_start', 'first_result', 'review_send', 'first_response', 'collaboration_complete',
  'return_resume', 'pause', 'delivery_failure'));

create or replace function public.log_lifecycle_event(p_namespace text, p_event text, p_need text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_namespace not in ('demo', 'practice', 'real') then return; end if;
  -- Real product events come only from a signed-in member, never from an anonymous caller.
  if p_namespace = 'real' and auth.uid() is null then return; end if;
  insert into lifecycle_events (namespace, event, need) values (p_namespace, p_event, nullif(p_need, ''));
exception when check_violation then null;  -- an unknown event is ignored, never an error for the visitor
end;
$$;
revoke all on function public.log_lifecycle_event(text, text, text) from public;
grant execute on function public.log_lifecycle_event(text, text, text) to anon, authenticated;

-- 2. Matching sees each colleague's own service choices (review F05) ---------------------------------
-- workspace_people gains "participation": whether the colleague is open to NEW referral, cover and consult
-- requests right now (open and not paused). The workspace hides closed colleagues from matching and says
-- why in bulk selection; the server still checks on send (private.cover_exclusions, consult send guard).
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
    'selectedOnly', p.referral_availability = 'limited',
    'pausedUntil', case when p.availability_paused_until >= current_date then p.availability_paused_until end,
    'cover', case p.coverage_availability when 'yes' then 'yes' when 'ask_me' then 'ask' when 'no' then 'no' end,
    'consult', p.consultation_availability is distinct from 'no',
    'participation', jsonb_build_object(
      'referral', private.service_open(p.id, 'referral') and not private.service_paused(p.id, 'referral'),
      'cover', private.service_open(p.id, 'cover') and not private.service_paused(p.id, 'cover'),
      'consult', private.service_open(p.id, 'consult') and not private.service_paused(p.id, 'consult')),
    'bio', coalesce(p.bio, ''),
    'referralMode', coalesce(p.referral_availability, 'yes'),
    'consultMode', coalesce(p.consultation_availability, 'yes'),
    'boardCertified', coalesce(p.board_certified, false),
    'founding', (select jsonb_build_object('state', fp.state, 'place', fp.place) from founding_places fp where fp.profile_id = p.id),
    'avatarPath', p.avatar_path
  ) order by p.full_name), '[]'::jsonb)
  from vm join profiles p on p.id = vm.id
  left join facts f on f.profile_id = p.id
  left join lic on lic.profile_id = p.id
  where auth.uid() is not null;
$function$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;
