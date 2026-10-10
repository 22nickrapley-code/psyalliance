-- 0105: from the 10 October user test. Applied to both projects.

-- 1. Sandbox guests never see each other: each sandbox is its own copy of
-- Alex's practice among the fictional colleagues. (Another guest appeared
-- as a second "Alex Rivers" in matches.)
do $$ declare d text; begin
  select pg_get_functiondef('private.visible_members'::regproc) into d;
  if position('sandbox_passes' in d) = 0 then
    execute replace(d, 'and p.id not in (select b from blocked);', 'and p.id not in (select b from blocked)
    and p.id not in (select guest_id from sandbox_passes where guest_id is not null);');
  end if;
  select pg_get_functiondef('private.can_see_profile'::regproc) into d;
  if position('is_sandbox_guest' in d) = 0 then
    execute replace(d, 'and p.account_status = ''active''', 'and p.account_status = ''active''
          and not private.is_sandbox_guest(p.id)');
  end if;
end $$;

-- 2. The "verified network" audience count: the members who can actually
-- see a network-wide request, counted directly (the old count went through
-- the directory view and could come back empty).
create or replace function public.eligible_network_count()
 returns integer
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select count(*)::integer from private.visible_members(auth.uid());
$function$;
