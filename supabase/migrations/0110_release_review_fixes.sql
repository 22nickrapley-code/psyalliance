-- Release review, 11 October 2026 (R01, R05, R06, R08, R16).
--
-- R01 (P0): an invited member could move their own consultation-group
-- membership into an unrelated private group by changing group_id, and then
-- read that group. The same pattern (a row the member may update, carrying
-- the foreign key that decides what they can see) exists on other tables, so
-- every such table now allows updates only to the columns the app changes,
-- and group membership also checks every update, not just status changes.

-- ---------- R01: group membership ----------
revoke update on public.consultation_group_members from anon, authenticated;
grant update (status, responded_at) on public.consultation_group_members to authenticated;

create or replace function public.guard_group_membership_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Database jobs and definer functions (no signed-in caller) are trusted.
  if auth.uid() is null then
    return new;
  end if;
  if new.group_id is distinct from old.group_id
     or new.profile_id is distinct from old.profile_id
     or new.role is distinct from old.role
     or new.external_email is distinct from old.external_email
     or new.invited_at is distinct from old.invited_at
     or new.id is distinct from old.id then
    raise exception 'A group membership can''t be moved or changed.' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if auth.uid() = old.profile_id then
      -- Your own membership: accept or decline an invitation, or leave.
      if not ((old.status = 'invited' and new.status in ('joined', 'declined'))
              or (old.status = 'joined' and new.status = 'left')) then
        raise exception 'That change isn''t possible for this group.' using errcode = 'P0001';
      end if;
    elsif private.is_group_creator(old.group_id) then
      -- The group's creator can close someone's membership, never join them.
      if new.status = 'joined' then
        raise exception 'Members join a group themselves, from their invitation.' using errcode = 'P0001';
      end if;
    else
      raise exception 'That change isn''t possible for this group.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_group_membership_change on public.consultation_group_members;
create trigger guard_group_membership_change
  before update on public.consultation_group_members
  for each row execute function public.guard_group_membership_change();

-- ---------- Same pattern elsewhere: only the columns the app changes ----------
revoke update on public.coverage_requests from anon, authenticated;
grant update (status, responded_at) on public.coverage_requests to authenticated;

revoke update on public.referral_responses from anon, authenticated;
grant update (status, message, responded_at) on public.referral_responses to authenticated;

revoke update on public.conversation_participants from anon, authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;

revoke update on public.conversation_messages from anon, authenticated;
grant update (body, deleted_at, edited_at, mentioned_profile_ids) on public.conversation_messages to authenticated;

revoke update on public.conversations from anon, authenticated;
grant update (last_message_at) on public.conversations to authenticated;

revoke update on public.notification_deliveries from anon, authenticated;
grant update (read_at) on public.notification_deliveries to authenticated;

revoke update on public.system_notifications from anon, authenticated;
grant update (read_at) on public.system_notifications to authenticated;

revoke update on public.connections from anon, authenticated;
grant update (status, responded_at, reminder_sent_at, tier) on public.connections to authenticated;

revoke update on public.document_ratings from anon, authenticated;
grant update (rating) on public.document_ratings to authenticated;

revoke update on public.planner_offers from anon, authenticated;
grant update (status, message, responded_at) on public.planner_offers to authenticated;

revoke update on public.provider_referrals from anon, authenticated;
grant update (status, status_note, responded_at) on public.provider_referrals to authenticated;

revoke update on public.referral_assignments from anon, authenticated;
grant update (status, message, satisfaction_rating, sent_to_patient, sent_to_patient_at) on public.referral_assignments to authenticated;

revoke update on public.town_hall_reactions from anon, authenticated;
grant update (reaction) on public.town_hall_reactions to authenticated;

-- TRUNCATE ignores row-level security; nobody signs in to truncate tables.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- ---------- R05: practice facts saved in one step ----------
-- The profile form replaced its specialties, approaches and other facts with
-- a delete then an insert; a failure between the two left them empty. One
-- function call is one transaction: all of it or none of it. It runs as the
-- caller, so the usual "own rows only" rules apply.
create or replace function public.set_my_practice_facts(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  delete from profile_lookup_values where profile_id = me;
  insert into profile_lookup_values (profile_id, lookup_value_id, rank)
  select me, (r->>'lookup_value_id')::bigint, nullif(r->>'rank', '')::int
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.set_my_practice_facts(jsonb) from public, anon;
grant execute on function public.set_my_practice_facts(jsonb) to authenticated;

-- ---------- R06: sandbox replies come from the people asked ----------
-- A consultation sent to one colleague was answered by someone else. Replies
-- now come only from the intended audience: the selected colleagues, the
-- group's members, or the guest's trusted colleagues; the wider network can
-- be answered by anyone open to consult. If no one fits, it stays pending.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.demo_autorespond'::regproc);
  if strpos(d, 'and p.consultation_availability = ''yes'' order by random() limit 1;') > 0 then
    d := replace(d,
      'select p.id into responder from profiles p where p.is_demo and not private.is_sandbox_guest(p.id) and p.consultation_availability = ''yes'' order by random() limit 1;',
      'responder := null;
    select p.id into responder from profiles p, consultations cc
    where cc.id = r.id and p.is_demo and not private.is_sandbox_guest(p.id) and p.id <> r.owner
      and case
        when cc.group_id is not null then exists (select 1 from consultation_group_members gm where gm.group_id = cc.group_id and gm.profile_id = p.id and gm.status = ''joined'')
        when cc.audience_type = ''selected'' then p.id = any(coalesce(cc.audience_profile_ids, ''{}''::uuid[]))
        when cc.audience_type = ''trusted'' then exists (select 1 from trusted_colleagues t where t.profile_id = r.owner and t.colleague_id = p.id)
        else p.consultation_availability = ''yes''
      end
    order by (p.consultation_availability = ''yes'') desc, random() limit 1;
    continue when responder is null;');
  end if;
  -- Trusted referrals: trusted colleagues are their own list now (0107).
  d := replace(d,
    'when r.audience_type = ''trusted'' then p.referral_availability in (''yes'', ''limited'') and exists (
            select 1 from connections c where c.tier = ''trusted_colleague'' and c.status = ''accepted''
              and ((c.requester_id = r.owner and c.addressee_id = p.id) or (c.addressee_id = r.owner and c.requester_id = p.id)))',
    'when r.audience_type = ''trusted'' then p.referral_availability in (''yes'', ''limited'') and exists (
            select 1 from trusted_colleagues t where t.profile_id = r.owner and t.colleague_id = p.id)');
  execute d;
end $$;

-- ---------- R08: storage limits on the buckets themselves ----------
update storage.buckets
   set file_size_limit = 20 * 1024 * 1024,
       allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/msword',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv']
 where id = 'documents';
update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'avatars';

-- ---------- R16: fixed search paths ----------
alter function private.documents_public_download_guard() set search_path = public;
alter function private.psypact_states() set search_path = public;
alter function private.psypact_eligible(text, text) set search_path = public;
alter function private.normalise_psypact() set search_path = public;
alter function private.continuity_guard() set search_path = public;
alter function private.stamp_first_availability() set search_path = public;
