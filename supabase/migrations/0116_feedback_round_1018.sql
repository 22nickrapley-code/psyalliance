-- Feedback round of 18 Oct 2026 (Nick). Runs on both projects.
--   1. Suggested by PsyAlliance: the list kept per member, so every avatar
--      on every page can show it in the same colour.
--   2. Reactions and "useful" marks nudge your own suggestions and matches.
--   3. Editing your own message for 15 minutes; removing it at any time.
--   4. Consult "Not now": you aren't asked and get no consult alerts.
--   5. Founding members: the first 40 in each state (was 50).
--   6. Sandbox: arrivals at least 6 minutes apart.

-- 1. Suggested colleagues --------------------------------------------------
create table if not exists public.suggested_colleagues (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  colleague_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null,
  primary key (profile_id, colleague_id)
);
create index if not exists suggested_colleagues_colleague_idx on public.suggested_colleagues(colleague_id);
create table if not exists public.suggestion_runs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  computed_at timestamptz not null default now()
);
alter table public.suggested_colleagues enable row level security;
alter table public.suggestion_runs enable row level security;
revoke all on public.suggested_colleagues from anon, authenticated;
revoke all on public.suggestion_runs from anon, authenticated;
grant select on public.suggested_colleagues to authenticated;
grant select on public.suggestion_runs to authenticated;
drop policy if exists "members read their own suggestions" on public.suggested_colleagues;
create policy "members read their own suggestions" on public.suggested_colleagues
  for select to authenticated using (profile_id = (select auth.uid()));
drop policy if exists "members read their own suggestion run" on public.suggestion_runs;
create policy "members read their own suggestion run" on public.suggestion_runs
  for select to authenticated using (profile_id = (select auth.uid()));

-- Replaces the member's own list (at most 20, in order). Only ever their own.
create or replace function public.set_my_suggestions(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from suggested_colleagues where profile_id = me;
  insert into suggested_colleagues (profile_id, colleague_id, position)
  select me, x.id, min(x.ord)::smallint
    from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as x(id, ord)
   where x.ord <= 20 and x.id is not null and x.id <> me
     and exists (select 1 from profiles p where p.id = x.id)
   group by x.id;
  insert into suggestion_runs (profile_id, computed_at) values (me, now())
  on conflict (profile_id) do update set computed_at = excluded.computed_at;
end;
$function$;
revoke all on function public.set_my_suggestions(uuid[]) from public, anon;
grant execute on function public.set_my_suggestions(uuid[]) to authenticated;

-- 2. Affinity: your own reactions and useful marks, as a small number per
-- colleague (-6 to +6). Only you see it; it only moves your own lists.
create or replace function public.my_colleague_affinity()
returns table (colleague_id uuid, score integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with r as (
    select m.author_id as colleague_id,
           sum(case when mr.reaction in ('like', 'heart') then 2 when mr.reaction = 'dislike' then -2 else 0 end) as s
      from message_reactions mr
      join conversation_messages m on m.id = mr.message_id
     where mr.profile_id = auth.uid() and m.author_id <> auth.uid() and m.deleted_at is null
     group by m.author_id
  ), u as (
    select cr.responder_profile_id as colleague_id, 2 * count(*) as s
      from consultation_responses cr
      join consultations c on c.id = cr.consultation_id
     where c.author_profile_id = auth.uid() and cr.marked_useful and cr.responder_profile_id <> auth.uid()
     group by cr.responder_profile_id
  )
  select x.colleague_id, greatest(-6, least(6, sum(x.s)))::integer
    from (select * from r union all select * from u) x
   where auth.uid() is not null
   group by x.colleague_id;
$function$;
revoke all on function public.my_colleague_affinity() from public, anon;
grant execute on function public.my_colleague_affinity() to authenticated;

-- 3. Editing and removing your own messages ---------------------------------
-- An edit is allowed for 15 minutes after sending (a minute's grace for slow
-- connections) and is marked edited. Removing clears the text and is always
-- allowed. A removed message can't be changed again. Admin removals (a
-- security-definer path, not the author) are untouched by this.
create or replace function public.guard_message_change()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or auth.uid() is distinct from old.author_id then
    return new;
  end if;
  if new.author_id is distinct from old.author_id or new.conversation_id is distinct from old.conversation_id or new.created_at is distinct from old.created_at then
    raise exception 'That can''t be changed.' using errcode = '42501';
  end if;
  if old.deleted_at is not null then
    raise exception 'This message was removed, so it can''t be changed.' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    new.body := '';
    new.mentioned_profile_ids := '{}';
    return new;
  end if;
  if new.body is distinct from old.body then
    if now() - old.created_at > interval '16 minutes' then
      raise exception 'Messages can be edited for 15 minutes after sending. You can still remove it.' using errcode = 'P0001';
    end if;
    if length(trim(coalesce(new.body, ''))) = 0 then
      raise exception 'A message can''t be empty. Remove it instead.' using errcode = 'P0001';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$function$;
drop trigger if exists guard_message_change on public.conversation_messages;
create trigger guard_message_change before update on public.conversation_messages
  for each row execute function public.guard_message_change();

-- 5. Founding members: 40 per state --------------------------------------
do $$
begin
  if exists (select 1 from public.founding_places where place > 40) then
    raise exception 'A state already has more than 40 founding places. Nothing was changed.';
  end if;
end $$;
alter table public.founding_places drop constraint if exists founding_places_place_check;
alter table public.founding_places add constraint founding_places_place_check check (place between 1 and 40);

create or replace function private.grant_founding_place(uid uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare st text; nxt int;
begin
  if uid is null or exists (select 1 from founding_places where profile_id = uid) then
    return;
  end if;
  select upper(trim(p.primary_state)) into st
    from profiles p
   where p.id = uid
     and p.account_kind = 'clinician'
     and p.verification_status = 'verified'
     and p.account_status = 'active'
     and not p.is_demo
     and not coalesce(p.demo_view, false)
     and not private.is_sandbox_guest(p.id)
     and exists (
       select 1 from licenses l
        where l.profile_id = p.id
          and upper(trim(l.state)) = upper(trim(p.primary_state))
          and l.status = 'active'
          and l.reviewed_at is not null
          and (l.expiration_date is null or l.expiration_date >= current_date));
  if st is null or st !~ '^[A-Z]{2}$' then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('founding_places:' || st));
  select coalesce(max(place), 0) + 1 into nxt from founding_places where state = st;
  if nxt > 40 then
    return;
  end if;
  insert into founding_places (state, place, profile_id) values (st, nxt, uid) on conflict do nothing;
  if found then
    insert into system_notifications (profile_id, title, body)
    values (uid, 'You''re a founding member',
            'You''re founding member #' || nxt || ' in your state. You never pay for membership, for as long as you remain a member. It shows on your profile.');
  end if;
exception when others then
  raise warning 'grant_founding_place(%): %', uid, sqlerrm;
end;
$function$;
revoke all on function private.grant_founding_place(uuid) from public, anon, authenticated;

create or replace function public.founding_places_left()
returns table (state text, taken integer, places_left integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select f.state, count(*)::integer, (40 - count(*))::integer
    from founding_places f
   group by f.state
  having count(*) >= 10
   order by f.state;
$function$;
revoke all on function public.founding_places_left() from public;
grant execute on function public.founding_places_left() to anon, authenticated;

-- 6. A calmer sandbox: at least 6 minutes between arrivals ----------------
create or replace function public.sandbox_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  st record;
  result jsonb;
begin
  if coalesce(private.cfg('app_env'), '') <> 'demo' or me is null or not private.is_sandbox_guest(me) then
    return null;
  end if;
  select * into st from private.sandbox_story where profile_id = me for update skip locked;
  if st.profile_id is null or st.step >= 5 or now() < st.next_at then
    return null;
  end if;
  -- Never within 6 minutes of something else arriving.
  if exists (select 1 from notification_deliveries where recipient_profile_id = me and delivered_at > now() - interval '6 minutes') then
    return null;
  end if;
  result := private.sandbox_story_event(me, st.step + 1);
  update private.sandbox_story
     set step = st.step + 1,
         next_at = now() + (array[interval '6 minutes', interval '7 minutes', interval '8 minutes', interval '10 minutes', interval '0 seconds'])[st.step + 1]
   where profile_id = me;
  return result;
end;
$function$;

-- The first arrival waits four minutes rather than three.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.seed_demo_viewer_story'::regproc);
  if strpos(d, 'interval ''180 seconds''') > 0 then
    execute replace(d, 'interval ''180 seconds''', 'interval ''240 seconds''');
  end if;
end $$;

-- ------------------------------------------------------------------ checks
-- Every column should be true.
select
  to_regclass('public.suggested_colleagues') is not null and to_regclass('public.suggestion_runs') is not null as suggestions_kept,
  to_regprocedure('public.set_my_suggestions(uuid[])') is not null as suggestions_save,
  to_regprocedure('public.my_colleague_affinity()') is not null as reactions_nudge,
  exists (select 1 from pg_trigger where tgname = 'guard_message_change' and tgrelid = 'public.conversation_messages'::regclass) as message_edit_rule,
  position('nxt > 40' in pg_get_functiondef('private.grant_founding_place(uuid)'::regprocedure)) > 0 as founding_40,
  position('40 - count' in pg_get_functiondef('public.founding_places_left()'::regprocedure)) > 0 as founding_40_left,
  position('interval ''6 minutes'') then' in pg_get_functiondef('public.sandbox_tick()'::regprocedure)) > 0 as sandbox_6_minutes,
  position('240 seconds' in pg_get_functiondef('private.seed_demo_viewer_story'::regproc)) > 0 as sandbox_first_at_4;
