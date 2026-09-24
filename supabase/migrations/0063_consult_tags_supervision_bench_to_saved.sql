-- Product Spec v1, Stage 4 (Network, Consult, Messages).

-- 1. Consult: follow treatment-area tags instead of joining channels.
create table if not exists consult_tag_follows (
  profile_id uuid not null references profiles (id) on delete cascade,
  tag text not null check (char_length(trim(tag)) between 1 and 60),
  created_at timestamptz not null default now(),
  primary key (profile_id, tag)
);

alter table consult_tag_follows enable row level security;

create policy "own tag follows only" on consult_tag_follows
  for all using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- 2. Supervision lives inside Consult as its own kind of post.
alter table consultations
  add column if not exists kind text not null default 'question'
    check (kind in ('question', 'supervision_request', 'supervision_offer'));

-- 3. Town Hall becomes the tagged Open discussion feed. Real members'
--    posts (not demo fixtures) move across with their channel name as a
--    tag, and their replies come with them. The old tables are kept.
with moved as (
  insert into consultations (author_profile_id, question, context, audience_type, tags, status, created_at)
  select m.author_id,
         left(m.body, 280),
         case when char_length(m.body) > 280 then m.body else null end,
         'wider_network',
         array[c.name],
         'open',
         m.created_at
  from town_hall_messages m
  join town_hall_channels c on c.id = m.channel_id
  join profiles p on p.id = m.author_id
  where m.parent_message_id is null and m.deleted_at is null and not p.is_demo
  returning id, author_profile_id, created_at
)
insert into consultation_responses (consultation_id, responder_profile_id, response_type, body, created_at)
select mv.id, r.author_id, 'reply', r.body, r.created_at
from moved mv
join town_hall_messages m on m.author_id = mv.author_profile_id and m.created_at = mv.created_at and m.parent_message_id is null
join town_hall_messages r on r.parent_message_id = m.id and r.deleted_at is null
join profiles rp on rp.id = r.author_id
where not rp.is_demo;

-- 4. Partner / Bench / Recommended become Trusted colleagues / Saved /
--    Suggested. Bench becomes a private Saved bookmark for each side
--    (keeping its matching weight), so nobody is ever shown as "benched".
insert into saved_clinicians (profile_id, clinician_id, note)
select requester_id, addressee_id, 'Moved from Bench' from connections where tier = 'bench'
on conflict do nothing;

insert into saved_clinicians (profile_id, clinician_id, note)
select addressee_id, requester_id, 'Moved from Bench' from connections where tier = 'bench' and status = 'accepted'
on conflict do nothing;

delete from connections where tier = 'bench';

update connections set tier = 'trusted_colleague' where tier = 'partner';
