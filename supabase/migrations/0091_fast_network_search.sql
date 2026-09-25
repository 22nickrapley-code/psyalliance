-- Faster network search (25 Sept 2026). The invoker versions in 0090 read
-- public_directory, which calls three per-row functions; at 1,200 members
-- that took four seconds. These definer versions apply the same rules
-- once per request: the viewer must be able to view the network; members
-- must be verified, active, clinicians, listed, in the viewer's partition
-- (demo or real), hold an active reviewed licence and not be blocked
-- either way. They return only the non-sensitive directory fields.
--
-- Also fixes the demo seed's insurance picks (every member got the first
-- plans in the list).

create or replace function private.visible_members(viewer uuid)
 returns table(id uuid, states text[])
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with me as (
    select coalesce((select is_demo or demo_view from profiles where profiles.id = viewer), false) demo,
           private.can_view_network(viewer) ok
  ),
  blocked as (
    select blocked_profile_id b from blocked_members where profile_id = viewer
    union select profile_id from blocked_members where blocked_profile_id = viewer
  ),
  lic as (
    select l.profile_id, array_agg(distinct upper(trim(l.state))) states from licenses l
    where l.status = 'active' and l.reviewed_at is not null and (l.expiration_date is null or l.expiration_date >= current_date)
    group by 1
  )
  select p.id, lic.states
  from profiles p join lic on lic.profile_id = p.id cross join me
  where me.ok and p.verification_status = 'verified' and p.account_status = 'active' and p.account_kind = 'clinician'
    and p.directory_visible and p.is_demo = me.demo and p.id <> viewer
    and p.id not in (select b from blocked);
$function$;
revoke execute on function private.visible_members(uuid) from public, anon, authenticated;

create or replace function public.network_directory(p jsonb default '{}'::jsonb)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with vm as (select * from private.visible_members(auth.uid())),
  facts as (
    select v.profile_id,
      array_agg(lv.value order by v.rank nulls last, lv.value) filter (where lv.category = 'treatment_specialism') focus,
      array_agg(lv.value) filter (where lv.category = 'insurance') insurance,
      array_agg(lv.value) filter (where lv.category = 'age_group_specialism') ages,
      array_agg(lv.value) filter (where lv.category = 'language') languages,
      array_agg(lv.value) filter (where lv.category = 'treatment_modality') modalities,
      array_agg(lv.value) filter (where lv.category = 'session_type') sessions
    from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id in (select id from vm)
    group by v.profile_id
  ),
  ppl as (
    select pr.id, pr.full_name, pr.credential_prefix, pr.qualification_level::text qualification_level,
      pr.primary_practice_city city, pr.primary_state state, pr.psypact_participating psypact,
      pr.referral_availability, pr.availability_confirmed_at confirmed_at, pr.availability_paused_until paused_until, pr.avatar_path, vm.states lic_states,
      coalesce(fa.focus, '{}') focus, coalesce(fa.insurance, '{}') insurance, coalesce(fa.ages, '{}') ages,
      coalesce(fa.languages, '{}') languages, coalesce(fa.modalities, '{}') modalities, coalesce(fa.sessions, '{}') sessions,
      (pr.referral_availability = 'yes' and pr.availability_confirmed_at >= now() - interval '30 days'
        and (pr.availability_paused_until is null or pr.availability_paused_until < current_date)) fresh
    from vm join profiles pr on pr.id = vm.id left join facts fa on fa.profile_id = vm.id
  ),
  visible as (
    select * from ppl where not (ppl.id::text in (select jsonb_array_elements_text(coalesce(p -> 'exclude', '[]'))))
  ),
  f as (
    select v.* from visible v
    where (p -> 'only' is null or v.id::text in (select jsonb_array_elements_text(p -> 'only')))
      and (coalesce(p ->> 'q', '') = '' or v.full_name ilike '%' || (p ->> 'q') || '%'
           or exists (select 1 from unnest(v.focus || v.languages || v.modalities) x where x ilike '%' || (p ->> 'q') || '%'))
      and (coalesce(p ->> 'focus', '') = '' or (p ->> 'focus') = any (v.focus))
      and (coalesce(p ->> 'state', '') = '' or v.state = (p ->> 'state') or (p ->> 'state') = any (v.lic_states))
      and (coalesce((p ->> 'available')::boolean, false) = false or v.fresh)
      and (coalesce(p ->> 'profession', '') = '' or ((p ->> 'profession') = 'psychiatrist') = (v.qualification_level in ('MD', 'DO')))
      and (coalesce(p ->> 'insurance', '') = '' or (p ->> 'insurance') = any (v.insurance))
      and (coalesce(p ->> 'age', '') = '' or (p ->> 'age') = any (v.ages))
      and (coalesce(p ->> 'language', '') = '' or (p ->> 'language') = any (v.languages))
      and (coalesce(p ->> 'modality', '') = '' or (p ->> 'modality') = any (v.modalities))
      and (coalesce(p ->> 'session', '') = '' or (p ->> 'session') = any (v.sessions))
      and (coalesce((p ->> 'psypact')::boolean, false) = false or v.psypact)
  ),
  ranked as (
    select f.*, row_number() over (
      order by (f.id::text in (select jsonb_array_elements_text(coalesce(p -> 'first', '[]')))) desc, f.fresh desc, f.full_name) ord
    from f
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'all', (select count(*) from visible),
    'people', coalesce((
      select jsonb_agg(to_jsonb(r) - 'insurance' - 'ages' - 'sessions' order by r.ord) from ranked r
      where r.ord > coalesce((p ->> 'offset')::int, 0) and r.ord <= coalesce((p ->> 'offset')::int, 0) + coalesce((p ->> 'limit')::int, 25)
    ), '[]'::jsonb),
    'options', case when coalesce((p ->> 'with_options')::boolean, false) then jsonb_build_object(
      'focus', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.focus) x),
      'insurance', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.insurance) x),
      'age', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.ages) x),
      'language', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.languages) x),
      'modality', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.modalities) x),
      'session', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.sessions) x),
      'states', (select coalesce(jsonb_agg(distinct x order by x), '[]') from visible, unnest(visible.lic_states) x)
    ) end
  );
$function$;

create or replace function public.match_pool(p_state text, p_focus integer[], p_telehealth boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with vm as (select * from private.visible_members(auth.uid())),
  c as (
    select p.id, p.full_name, p.credential_prefix, p.qualification_level::text qualification_level, p.primary_state, p.primary_practice_city,
      p.psypact_participating, p.referral_availability, p.coverage_availability, p.availability_confirmed_at, p.availability_paused_until,
      p.approx_spaces, p.last_active_at, p.open_to_give_supervision, p.avatar_path, vm.states
    from vm join profiles p on p.id = vm.id
    where (p_state is null or upper(p_state) = any (vm.states) or (coalesce(p_telehealth, true) and p.psypact_participating))
      and (coalesce(cardinality(p_focus), 0) = 0
           or exists (select 1 from profile_lookup_values v where v.profile_id = p.id and v.lookup_value_id = any (p_focus)))
  )
  select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('facts', (
    select coalesce(jsonb_agg(jsonb_build_object('id', v.lookup_value_id, 'rank', v.rank, 'cat', lv.category, 'val', lv.value)), '[]')
    from profile_lookup_values v join lookup_values lv on lv.id = v.lookup_value_id
    where v.profile_id = c.id))), '[]'::jsonb)
  from c;
$function$;

create or replace function public.network_coverage()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with m as (
    select vm.id, vm.states from private.visible_members(auth.uid()) vm join profiles p on p.id = vm.id
    where p.referral_availability in ('yes', 'limited') and p.availability_confirmed_at >= now() - interval '90 days'
  ),
  st as (select x st from m, unnest(m.states) x group by x having count(*) >= 10),
  fc as (
    select v.lookup_value_id id, s.st, count(distinct m.id) n
    from m join profile_lookup_values v on v.profile_id = m.id
    join lookup_values lv on lv.id = v.lookup_value_id and lv.category = 'treatment_specialism'
    join st s on s.st = any (m.states)
    group by 1, 2
  ),
  vals as (
    select lv.category, lv.id, count(distinct m.id) n
    from m join profile_lookup_values v on v.profile_id = m.id join lookup_values lv on lv.id = v.lookup_value_id
    where lv.category in ('insurance', 'language')
    group by 1, 2
  )
  select jsonb_build_object(
    'states', (select coalesce(jsonb_agg(st order by st), '[]') from st),
    'focus', (select coalesce(jsonb_agg(id order by id), '[]') from (
      select id from fc group by id having count(*) = (select count(*) from st) and min(n) >= 3) z),
    'insurance', (select coalesce(jsonb_agg(id order by id), '[]') from vals where category = 'insurance' and n >= 10),
    'language', (select coalesce(jsonb_agg(id order by id), '[]') from vals where category = 'language' and n >= 3)
  );
$function$;

revoke execute on function public.network_directory(jsonb), public.match_pool(text, integer[], boolean), public.network_coverage() from public, anon;
grant execute on function public.network_directory(jsonb), public.match_pool(text, integer[], boolean), public.network_coverage() to authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('private.seed_demo_network(uuid)'::regprocedure);
  def := replace(def,
    'plans := national_plans || string_to_array(regional_plans[s], ''|'') || string_to_array(regional_plans[s], ''|'');',
    'select array_agg(v order by rk) into plans from (select v, random() rk from unnest(national_plans || string_to_array(regional_plans[s], ''|'') || string_to_array(regional_plans[s], ''|'')) v) z;');
  def := replace(def,
    'lv.value in (select distinct v from (select unnest(plans) v order by random() limit 2 + floor(random() * 4)::int) z)',
    'lv.value = any (plans[1:2 + floor(random() * 4)::int])');
  execute def;
end $$;
