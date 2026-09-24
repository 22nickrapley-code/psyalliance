-- Critical fix found by the two-account test: consultation_groups and
-- consultation_group_members policies referred to each other, so any read
-- of a group raised "infinite recursion detected in policy". Checks now
-- go through security-definer helpers.

create or replace function private.is_group_creator(p_group bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from consultation_groups where id = p_group and created_by = auth.uid());
$$;

create or replace function private.has_group_membership(p_group bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from consultation_group_members
    where group_id = p_group and profile_id = auth.uid() and status in ('invited', 'joined')
  );
$$;

grant execute on function private.is_group_creator(bigint), private.has_group_membership(bigint) to authenticated;

drop policy if exists "consultation groups are visible to members, or their creator" on public.consultation_groups;
create policy "consultation groups are visible to members, or their creator" on public.consultation_groups
  for select using ((select auth.uid()) = created_by or private.has_group_membership(id));

drop policy if exists "group creator manages membership" on public.consultation_group_members;
create policy "group creator manages membership" on public.consultation_group_members
  for all using (private.is_group_creator(group_id)) with check (private.is_group_creator(group_id));

drop policy if exists "members see their own group's membership list" on public.consultation_group_members;
create policy "members see their own group's membership list" on public.consultation_group_members
  for select using (
    (select auth.uid()) = profile_id
    or private.is_group_creator(group_id)
    or private.is_consultation_group_member(group_id, (select auth.uid()))
  );
