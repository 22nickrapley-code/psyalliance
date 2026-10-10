-- A colleague can change their own reply to a referral (for example from a
-- question to Interested) while the referral is still open. Only the
-- referrer chooses someone: a colleague can't mark themselves chosen, change
-- a reply once chosen, or move their reply to another referral.

create or replace function public.guard_referral_response_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  if auth.uid() is null or current_setting('pa.seeding', true) = 'on' then
    return new;
  end if;
  select id, requesting_profile_id, status into r from referral_requests where id = old.referral_request_id;
  if r.id is not null and auth.uid() = r.requesting_profile_id then
    return new;
  end if;
  if auth.uid() = old.responding_profile_id then
    if new.responding_profile_id <> old.responding_profile_id or new.referral_request_id <> old.referral_request_id then
      raise exception 'That reply can''t be moved.' using errcode = 'P0001';
    end if;
    if old.status = 'accepted' then
      raise exception 'You''ve already been chosen for this referral.' using errcode = 'P0001';
    end if;
    if new.status = 'accepted' then
      raise exception 'Only the referring colleague can choose who takes a referral.' using errcode = 'P0001';
    end if;
    if r.id is null or r.status not in ('open', 'sent') then
      raise exception 'This referral is no longer taking replies.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger guard_referral_response_change
  before update on public.referral_responses
  for each row execute function public.guard_referral_response_change();
