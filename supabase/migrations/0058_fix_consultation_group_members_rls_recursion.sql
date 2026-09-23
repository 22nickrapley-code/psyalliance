-- Fixes a live-breaking bug found while auditing Consult's free-text
-- fields (task #119): consultation_group_members' own SELECT policy
-- queries consultation_group_members from inside itself to check "is the
-- current user already a joined member of this group" - the classic
-- Postgres RLS infinite-recursion footgun, same category this project
-- already fixed once for is_admin_user/is_conversation_participant
-- (migration 0052), just not caught here at the time. Confirmed live: a
-- plain `select * from consultations` as any authenticated user throws
-- "infinite recursion detected in policy for relation
-- consultation_group_members" as soon as any consultation row exists at
-- all (the planner doesn't reliably skip the group_id branch's EXISTS
-- subquery just because group_id is null on that row) - meaning ordinary
-- Consult page loads would error for any authenticated user the moment
-- anyone posts a consultation. The Consult module hadn't been used with
-- real data yet (0 rows in consultations at the time this was found), so
-- this was latent rather than actively breaking anything in front of
-- Nick - but it would have broken the very next real use.
--
-- Same fix as before: a SECURITY DEFINER helper in the `private` schema
-- (bypasses RLS internally, so it doesn't re-trigger the policy it's
-- being called from) replaces the self-referential subquery. Applied live
-- and verified first (recursion gone; a controlled test also confirmed
-- consultation_responses correctly inherits its parent consultation's
-- audience restriction - an unrelated non-trusted user could see neither
-- a 'trusted'-audience consultation nor its response) before being
-- written here to match.

create or replace function private.is_consultation_group_member(p_group_id bigint, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from consultation_group_members
    where group_id = p_group_id and profile_id = p_profile_id and status = 'joined'
  );
$$;

grant execute on function private.is_consultation_group_member(bigint, uuid) to authenticated, service_role;

drop policy if exists "members see their own group's membership list" on consultation_group_members;
create policy "members see their own group's membership list" on consultation_group_members
  for select using (
    (select auth.uid()) = profile_id
    or exists (
      select 1 from consultation_groups g
      where g.id = group_id and g.created_by = (select auth.uid())
    )
    or private.is_consultation_group_member(group_id, (select auth.uid()))
  );

drop policy if exists "consultations are visible per their chosen audience" on consultations;
create policy "consultations are visible per their chosen audience" on consultations
  for select using (
    status not in ('draft', 'removed')
    and (
      audience_type = 'wider_network'
      or (audience_type = 'selected' and (select auth.uid()) = any (audience_profile_ids))
      or (
        audience_type = 'trusted'
        and exists (
          select 1 from connections c
          where c.tier = 'trusted_colleague' and c.status = 'accepted'
            and (
              (c.requester_id = author_profile_id and c.addressee_id = (select auth.uid()))
              or (c.addressee_id = author_profile_id and c.requester_id = (select auth.uid()))
            )
        )
      )
      or (group_id is not null and private.is_consultation_group_member(group_id, (select auth.uid())))
    )
  );
