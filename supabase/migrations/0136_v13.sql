-- 0136_v13.sql: Nick's 15 Nov review. A calmer sandbox. Safe to run more than once.
-- Run on the sandbox project (it only does anything on the demo site). Running it on live is harmless.
--
-- Five colleagues get in touch instead of eight, about seven to eight minutes apart (the first still after two
-- minutes, so a visitor sees how it works). The five: Eli asks for cover, Lena sends a referral, Marcus asks a
-- consult question, James thanks Rachel for her reply (a small win), and Imani sends a message. The screen also
-- holds back a new arrival while three or more things already need the visitor on the Hub.
-- Rollback: run sandbox_tick and sandbox_info from 0131_v5.sql again.

create or replace function public.sandbox_tick(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  st record;
  result jsonb;
  story integer[] := array[1, 2, 5, 8, 7];
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    return null;
  end if;
  select * into st from private.sandbox_story where profile_id = me for update skip locked;
  if st.profile_id is null or st.step >= array_length(story, 1) then
    return null;
  end if;
  if not coalesce(p_force, false) and now() < st.next_at then
    return null;
  end if;
  result := private.sandbox_story_event(me, story[st.step + 1]);
  if result is not null then
    result := result || jsonb_build_object('step', st.step + 1);
  end if;
  update private.sandbox_story
     set step = st.step + 1, next_at = now() + interval '7 minutes' + (random() * interval '60 seconds')
   where profile_id = me;
  return result;
end;
$function$;
revoke all on function public.sandbox_tick(boolean) from public, anon;
grant execute on function public.sandbox_tick(boolean) to authenticated;

create or replace function public.sandbox_info()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('label', s.label, 'expiresAt', s.expires_at,
                            'arrivals', jsonb_build_object('done', least(coalesce(st.step, 0), 5), 'total', 5, 'nextAt', st.next_at))
    from sandbox_passes s left join private.sandbox_story st on st.profile_id = s.guest_id
   where s.guest_id = auth.uid() and coalesce(private.cfg('app_env'), '') = 'demo';
$function$;
revoke all on function public.sandbox_info() from public, anon;
grant execute on function public.sandbox_info() to authenticated;

-- Security pass (15 Nov). -------------------------------------------------------------------------------------------
-- 1. Library files ("shared" in the documents bucket) could be downloaded by any signed-in account through the storage
--    API, which skipped the rule that templates open once a member's license is verified. Now only verified members and
--    admins can read them. Files the admin has published for public download keep their own rule.
drop policy if exists "shared documents are readable by any authenticated user" on storage.objects;
drop policy if exists "shared documents are readable by verified members" on storage.objects;
create policy "shared documents are readable by verified members" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'shared'
    and (
      exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.verification_status = 'verified')
      or private.is_admin_user((select auth.uid()))
    )
  );

-- 2. Fixed search paths for the small helper functions the security adviser lists (it only warns; this quiets it).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.proname in ('demo_discussions', 'referral_label', 'initials', 'role_label', 'count_word', 'cover_event_text',
                         'state_name', 'referral_title_problem', 'ai_daily_limit', 'demo_cast', 'demo_threads', 'demo_client')
       and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions', f.sig);
  end loop;
end $$;

-- 3. The public demo's anonymous step counter can't be used to flood the database: past 300 events a minute,
--    extra ones are quietly dropped.
create or replace function public.log_lifecycle_event(p_namespace text, p_event text, p_need text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_namespace not in ('demo', 'practice', 'real') then return; end if;
  -- Real product events come only from a signed-in member, never from an anonymous caller.
  if p_namespace = 'real' and auth.uid() is null then return; end if;
  if (select count(*) from lifecycle_events where at > now() - interval '1 minute') >= 300 then return; end if;
  insert into lifecycle_events (namespace, event, need) values (p_namespace, left(p_event, 40), nullif(left(coalesce(p_need, ''), 60), ''));
exception when check_violation then null;  -- an unknown event is ignored, never an error for the visitor
end;
$$;
revoke all on function public.log_lifecycle_event(text, text, text) from public;
grant execute on function public.log_lifecycle_event(text, text, text) to anon, authenticated;
