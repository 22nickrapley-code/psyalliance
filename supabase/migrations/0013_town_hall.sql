-- M-extra: Town Hall - open community forum for verified psychologists,
-- organized into specialism channels (auto-derived from the seeded
-- treatment_specialism dropdown plus a few general channels), with threaded
-- replies and lightweight reactions that feed the community endorsement
-- score used to *suggest* (never auto-apply) network-tier upgrades.
--
-- Visibility model: unlike caseload/income/etc, Town Hall is a shared
-- community space, not owner-scoped data - any verified, signed-in
-- practitioner can read and post in any channel. This intentionally mirrors
-- the already-accepted public_directory pattern (open read for verified
-- professionals) rather than the owner-only pattern used elsewhere.

create table town_hall_channels (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  description text,
  lookup_value_id bigint references lookup_values (id),
  is_general boolean not null default false,
  created_at timestamptz not null default now()
);

create table town_hall_memberships (
  channel_id bigint not null references town_hall_channels (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  is_auto boolean not null default false,
  primary key (channel_id, profile_id)
);

create table town_hall_messages (
  id bigint generated always as identity primary key,
  channel_id bigint not null references town_hall_channels (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  parent_message_id bigint references town_hall_messages (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint body_not_empty check (char_length(trim(body)) > 0)
);

create table town_hall_reactions (
  id bigint generated always as identity primary key,
  message_id bigint not null references town_hall_messages (id) on delete cascade,
  reactor_id uuid not null references profiles (id) on delete cascade,
  reaction text not null check (reaction in ('thumbs_up', 'heart', 'thumbs_down')),
  created_at timestamptz not null default now(),
  unique (message_id, reactor_id)
);

create index idx_town_hall_messages_channel on town_hall_messages (channel_id, created_at);
create index idx_town_hall_messages_parent on town_hall_messages (parent_message_id);
create index idx_town_hall_reactions_message on town_hall_reactions (message_id);

alter table town_hall_channels enable row level security;
alter table town_hall_memberships enable row level security;
alter table town_hall_messages enable row level security;
alter table town_hall_reactions enable row level security;

create policy "verified users can read channels" on town_hall_channels
  for select using (
    exists (select 1 from profiles where id = (select auth.uid()) and verification_status = 'verified')
  );

create policy "own memberships only" on town_hall_memberships
  for all using ((select auth.uid()) = profile_id) with check ((select auth.uid()) = profile_id);

create policy "verified users can read town hall messages" on town_hall_messages
  for select using (
    exists (select 1 from profiles where id = (select auth.uid()) and verification_status = 'verified')
  );

create policy "verified users can post town hall messages" on town_hall_messages
  for insert with check (
    author_id = (select auth.uid())
    and exists (select 1 from profiles where id = (select auth.uid()) and verification_status = 'verified')
  );

create policy "authors can edit or soft-delete their own messages" on town_hall_messages
  for update using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));

create policy "verified users can read reactions" on town_hall_reactions
  for select using (
    exists (select 1 from profiles where id = (select auth.uid()) and verification_status = 'verified')
  );

create policy "verified users can react" on town_hall_reactions
  for insert with check (
    reactor_id = (select auth.uid())
    and exists (select 1 from profiles where id = (select auth.uid()) and verification_status = 'verified')
  );

create policy "users can change or remove their own reaction" on town_hall_reactions
  for update using (reactor_id = (select auth.uid())) with check (reactor_id = (select auth.uid()));

create policy "users can delete their own reaction" on town_hall_reactions
  for delete using (reactor_id = (select auth.uid()));

grant select on town_hall_channels, town_hall_messages, town_hall_reactions to authenticated;

-- One channel per treatment_specialism value, plus general-purpose channels.
insert into town_hall_channels (slug, name, description, lookup_value_id)
select
  'specialism-' || lv.id,
  lv.value,
  'Discussion and consultation for practitioners working with ' || lv.value || '.',
  lv.id
from lookup_values lv
where lv.category = 'treatment_specialism';

insert into town_hall_channels (slug, name, description, is_general) values
  ('general', 'General Discussion', 'Anything relevant to independent practice that doesn''t fit elsewhere.', true),
  ('practice-management', 'Practice Management', 'Billing, scheduling, overhead, tech stack, and the business side of solo practice.', true),
  ('new-practitioner-corner', 'New Practitioner Corner', 'For those newly licensed or newly independent - questions welcome.', true),
  ('consultation-requests', 'Consultation Requests', 'Post a case consultation question (no identifying client details) for peer input.', true);

-- Community endorsement score: reply = 1pt, thumbs-up = 2pt, heart = 3pt,
-- thumbs-down = -1pt, credited to the AUTHOR of the message being engaged
-- with. Used only to *suggest* Bench (10+) / Partner (20+) consideration on
-- the Network page - never applied automatically.
create view community_endorsement_scores as
select
  p.id as profile_id,
  coalesce(replies.pts, 0) + coalesce(reactions.pts, 0) as score
from profiles p
left join (
  select parent.author_id, count(*) as pts
  from town_hall_messages child
  join town_hall_messages parent on parent.id = child.parent_message_id
  where child.deleted_at is null and parent.deleted_at is null
  group by parent.author_id
) replies on replies.author_id = p.id
left join (
  select m.author_id,
    sum(case r.reaction when 'thumbs_up' then 2 when 'heart' then 3 when 'thumbs_down' then -1 else 0 end) as pts
  from town_hall_reactions r
  join town_hall_messages m on m.id = r.message_id
  where m.deleted_at is null
  group by m.author_id
) reactions on reactions.author_id = p.id;

grant select on community_endorsement_scores to authenticated;
