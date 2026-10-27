-- 0121: the final product's examples in the sandbox world.
--
-- Run in the SANDBOX Supabase project only, after 0119 and 0120. The live site
-- never needs it (nothing here is called outside the sandbox seed).
--
-- Adds three small things to every guest's story, so each decision shows up in
-- the sandbox without the guest having to set it up:
--   * a colleague on a break (D-05): Talia Kellingsby is paused for three weeks.
--     Cover and Referrals leave her out and her card says so;
--   * a colleague not open to cover (D-05): Lena Larkhollow;
--   * a question marked resolved by its asker (D-14): the oldest discussion with
--     replies, so the Resolved label and "the asker closed this" note are visible.
-- PSYPACT telehealth (D-17) needs nothing added: five of the cast take part
-- (Rena, Alex, Fatima, Marcus, Daniel), so the label appears wherever it applies.
-- Referral numbers (D-09) come from the seed's own calls to referral_create.
--
-- The cast is shared by every guest and re-seeded each time a sandbox is made
-- (that step sets availability back to the sample's values), so these run at
-- the end of each guest's seed.

create or replace function private.seed_final_extras(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  ids jsonb := private.demo_cast_ids();
  oldest bigint;
begin
  update profiles set availability_paused_until = current_date + 21 where id = (ids ->> 'talia')::uuid;
  update profiles set coverage_availability = 'no' where id = (ids ->> 'lena')::uuid;

  select c.id into oldest
    from consultations c
    join private.demo_rows dr on dr.tbl = 'consultations' and dr.id = c.id and dr.owner = p_viewer
   where c.status in ('open', 'responses_received')
     and c.author_profile_id <> p_viewer
     and exists (select 1 from consultation_responses r where r.consultation_id = c.id)
   order by c.created_at asc
   limit 1;
  if oldest is not null then
    update consultations set status = 'resolved', resolved_at = now() - interval '2 days' where id = oldest;
  end if;
end;
$function$;
revoke all on function private.seed_final_extras(uuid) from public, anon, authenticated;

create or replace function private.seed_demo_viewer_story(p_viewer uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  insert into private.sandbox_story (profile_id, step, next_at) values (p_viewer, 0, now() + interval '240 seconds')
  on conflict (profile_id) do update set step = 0, next_at = now() + interval '240 seconds';
  perform private.seed_final_extras(p_viewer);
end;
$function$;
revoke all on function private.seed_demo_viewer_story(uuid) from public, anon, authenticated;
