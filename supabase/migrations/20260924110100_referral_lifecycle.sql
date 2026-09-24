-- A referral's connection, handoff, and outcome are non-identifying workflow
-- facts. The clinical handoff itself always happens off platform.
alter table public.referral_requests
  add column if not exists selected_profile_id uuid references public.profiles(id),
  add column if not exists outcome text
    check (outcome in ('matched', 'no_match', 'withdrawn', 'other'));

create index if not exists referral_requests_selected_profile_idx
  on public.referral_requests (selected_profile_id) where selected_profile_id is not null;

-- Direct inserts are only drafts with an empty selected audience or a
-- newly sent trusted/network request; no member may forge a later state.
create policy "referral insert begins at the start of its lifecycle"
  on public.referral_requests as restrictive for insert to authenticated
  with check (
    selected_profile_id is null and closed_at is null and outcome is null
    and coalesce(array_length(audience_profile_ids, 1), 0) = 0
    and ((audience_type = 'selected' and status = 'open')
      or (audience_type in ('trusted', 'suggested', 'wider_network') and status = 'sent'))
  );

create or replace function public.advance_referral_request(
  p_request_id bigint, p_action text, p_responder uuid default null, p_outcome text default null
)
returns table(target_profile_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.referral_requests%rowtype;
begin
  if not private.is_active_verified_member() then
    raise exception 'A verified active account is required';
  end if;
  select * into v_request from public.referral_requests
    where id = p_request_id for update;
  if not found or v_request.requesting_profile_id is distinct from auth.uid() then
    raise exception 'Referral request not found';
  end if;

  if p_action = 'connect' then
    if v_request.status not in ('open', 'sent', 'matched') or p_responder is null
      or not exists (select 1 from public.referral_responses
        where referral_request_id = p_request_id and responding_profile_id = p_responder
          and status in ('interested', 'offered', 'accepted'))
      or not exists (select 1 from public.profiles p where p.id = p_responder
        and p.verification_status = 'verified' and p.account_status = 'active') then
      raise exception 'Choose a clinician who expressed interest in this open request';
    end if;
    update public.referral_requests set status = 'connected', selected_profile_id = p_responder
      where id = p_request_id;
    update public.referral_responses set status = 'accepted', responded_at = now()
      where referral_request_id = p_request_id and responding_profile_id = p_responder;
  elsif p_action = 'handoff' then
    if v_request.status <> 'connected' or v_request.selected_profile_id is null then
      raise exception 'Connect with an interested clinician before recording the handoff';
    end if;
    update public.referral_requests set status = 'handoff' where id = p_request_id;
  elsif p_action = 'close' then
    if v_request.status not in ('open', 'sent', 'matched', 'connected', 'handoff')
      or p_outcome not in ('matched', 'no_match', 'withdrawn', 'other')
      or (p_outcome = 'matched' and v_request.selected_profile_id is null) then
      raise exception 'Choose an outcome appropriate for this open referral';
    end if;
    update public.referral_requests set status = 'closed', closed_at = now(), outcome = p_outcome
      where id = p_request_id;
  else
    raise exception 'Invalid referral transition';
  end if;
  return query select case when p_action = 'connect' then p_responder else v_request.selected_profile_id end;
end;
$$;
revoke all on function public.advance_referral_request(bigint, text, uuid, text) from public, anon;
grant execute on function public.advance_referral_request(bigint, text, uuid, text) to authenticated;

create or replace function public.add_referral_recipients(p_request_id bigint, p_recipients uuid[])
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_request public.referral_requests%rowtype;
  v_added uuid[];
begin
  if not private.is_active_verified_member() then
    raise exception 'A verified active account is required';
  end if;
  select * into v_request from public.referral_requests
    where id = p_request_id for update;
  if not found or v_request.requesting_profile_id is distinct from auth.uid()
    or v_request.audience_type <> 'selected' or v_request.status not in ('open', 'sent') then
    raise exception 'Selected referral request not found or no longer open';
  end if;
  if coalesce(array_length(p_recipients, 1), 0) > 25 then
    raise exception 'Choose no more than 25 recipients at a time';
  end if;
  if exists (select 1 from unnest(p_recipients) as recipient(id)
    where recipient.id is null or recipient.id = auth.uid() or not exists (
      select 1 from public.profiles p where p.id = recipient.id
        and p.verification_status = 'verified' and p.account_status = 'active'
    ) or exists (
      select 1 from public.do_not_work_with b
        where (b.profile_id = auth.uid() and b.blocked_profile_id = recipient.id)
           or (b.profile_id = recipient.id and b.blocked_profile_id = auth.uid())
    )) then
    raise exception 'Choose active verified clinicians you can work with';
  end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_added
    from (select distinct recipient.id from unnest(p_recipients) as recipient(id)
      where recipient.id <> all(v_request.audience_profile_ids)) new_recipients;
  if coalesce(array_length(v_added, 1), 0) = 0 then return '{}'::uuid[]; end if;
  if coalesce(array_length(v_request.audience_profile_ids, 1), 0) + array_length(v_added, 1) > 25 then
    raise exception 'A selected referral can reach at most 25 clinicians';
  end if;
  update public.referral_requests set
    audience_profile_ids = v_request.audience_profile_ids || v_added,
    status = 'sent' where id = p_request_id;
  return v_added;
end;
$$;
revoke all on function public.add_referral_recipients(bigint, uuid[]) from public, anon;
grant execute on function public.add_referral_recipients(bigint, uuid[]) to authenticated;

-- Read only while an invitation is open, except the selected clinician who
-- needs to follow the subsequent handoff. The owner sees every stage.
drop policy if exists "verified recipient sees chosen referral audience" on public.referral_requests;
create policy "verified recipient sees chosen referral audience" on public.referral_requests
  for select to authenticated using (
    requesting_profile_id = (select auth.uid()) or
    (exists (select 1 from public.profiles viewer where viewer.id = (select auth.uid())
      and viewer.verification_status = 'verified' and viewer.account_status = 'active')
     and ((status in ('connected', 'handoff') and selected_profile_id = (select auth.uid()))
       or (status in ('open', 'sent') and (
         audience_type in ('wider_network', 'suggested')
         or (audience_type = 'selected' and (select auth.uid()) = any(audience_profile_ids))
         or (audience_type = 'trusted' and exists (
           select 1 from public.connections c where c.tier = 'trusted_colleague'
             and c.status = 'accepted' and
             ((c.requester_id = requesting_profile_id and c.addressee_id = (select auth.uid()))
              or (c.addressee_id = requesting_profile_id and c.requester_id = (select auth.uid())))
         ))
       ))))
  );

drop policy if exists "respond to open requests that aren't your own" on public.referral_responses;
create policy "verified recipient responds to open referral" on public.referral_responses
  for insert to authenticated with check (
    responding_profile_id = (select auth.uid())
    and private.is_active_verified_member()
    and status in ('interested', 'unavailable', 'question', 'waitlist')
    and (message is null or char_length(message) <= 500)
    and (status <> 'question' or nullif(trim(message), '') is not null)
    and exists (select 1 from public.referral_requests r
      where r.id = referral_request_id and r.status in ('open', 'sent')
        and r.requesting_profile_id <> (select auth.uid()))
  );

-- Legacy client writes could move the status without recording which
-- interested clinician was selected. All transitions now use the RPC.
revoke update on public.referral_requests from authenticated;
revoke update on public.referral_responses from authenticated;

-- External physicians may send a professional availability inquiry, not
-- patient-linked information. Existing rows remain accessible for controlled
-- export/retention; this restrictive policy applies only to new inserts.
create policy "provider registration starts pending review"
  on public.referring_providers as restrictive for insert to authenticated
  with check (
    approval_status = 'pending' and reviewed_at is null and reviewed_by is null
    and email = (select auth.jwt() ->> 'email')
  );

create policy "provider referral contains office-only context"
  on public.provider_referrals as restrictive for insert to authenticated
  with check (
    patient_initials is null and patient_age_range is null and status = 'sent'
    and responded_at is null and status_note is null
    and reason in ('Assessment inquiry', 'Therapy inquiry', 'Medication consultation inquiry', 'Other professional inquiry')
    and contact_details = (select provider.email from public.referring_providers provider
      where provider.id = referring_provider_id and provider.approval_status = 'approved')
    and exists (select 1 from public.profiles recipient
      where recipient.id = target_profile_id and recipient.account_status = 'active'
        and recipient.verification_status = 'verified'
        and recipient.accepting_referrals and recipient.referral_availability <> 'no')
  );

create or replace function private.guard_provider_referral_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() is distinct from old.target_profile_id or old.status <> 'sent'
    or new.status not in ('acknowledged', 'declined') or new.responded_at is null
    or new.status_note is not null
    or (new.id, new.referring_provider_id, new.target_profile_id,
        new.patient_initials, new.patient_age_range, new.reason,
        new.urgency, new.contact_details, new.created_at)
      is distinct from
       (old.id, old.referring_provider_id, old.target_profile_id,
        old.patient_initials, old.patient_age_range, old.reason,
        old.urgency, old.contact_details, old.created_at) then
    raise exception 'Only a specialist response to a sent inquiry is permitted';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_provider_referral_update() from public, anon, authenticated;
drop trigger if exists guard_provider_referral_update on public.provider_referrals;
create trigger guard_provider_referral_update before update on public.provider_referrals
  for each row execute function private.guard_provider_referral_update();

-- Group consultations must stay inside their group. Earlier permissive
-- audience rules also let an author's trusted colleagues see a group post.
create policy "group posts require current group membership"
  on public.consultations as restrictive for select to authenticated using (
    group_id is null or author_profile_id = (select auth.uid())
      or private.is_consultation_group_member(group_id, (select auth.uid()))
  );
