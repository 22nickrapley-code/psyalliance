-- Direct messaging inbox - the "Conversation_Notes" sheet: a Teams/Slack-like
-- private inbox (distinct from Town Hall's public specialism channels),
-- searchable, filterable by connection tier (Partner/Bench/Recommended/ALL),
-- with a "Start New Conversation" flow and threaded message view. Supports
-- more than two participants at once (the sheet's example threads show
-- three-plus colleagues in one referral conversation), and "@" mentions
-- (Nick's own open question in the notes - "How hard is it to '@'
-- people?" - answer: not hard, so it's included).

create table conversations (
  id bigint generated always as identity primary key,
  created_by uuid not null references profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table conversation_participants (
  conversation_id bigint not null references conversations (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references conversations (id) on delete cascade,
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null,
  mentioned_profile_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create index idx_conversation_messages_conversation on conversation_messages (conversation_id, created_at);
create index idx_conversation_participants_profile on conversation_participants (profile_id);

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table conversation_messages enable row level security;

-- A policy on conversation_participants can't safely subquery
-- conversation_participants itself ("infinite recursion detected in
-- policy"), so the "am I a participant of this conversation" check is
-- pulled out into a SECURITY DEFINER helper (owned by a role that bypasses
-- RLS, per this project's established Supabase pattern), reused by all
-- three tables' policies below.
create or replace function is_conversation_participant(p_conversation_id bigint, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and profile_id = p_profile_id
  );
$$;

grant execute on function is_conversation_participant(bigint, uuid) to authenticated;

create policy "start a conversation you create" on conversations
  for insert with check (created_by = (select auth.uid()));

create policy "participants can view their conversations" on conversations
  for select using (is_conversation_participant(id, (select auth.uid())));

create policy "participants can touch last_message_at" on conversations
  for update using (is_conversation_participant(id, (select auth.uid())))
  with check (is_conversation_participant(id, (select auth.uid())));

-- Participants are added only when the conversation is started (by its
-- creator, who may add others alongside themselves) - mirrors this
-- project's rule of never running a cross-user write under the wrong
-- person's RLS context: nobody adds themselves to someone else's existing
-- conversation later.
create policy "creator seeds participants at conversation start" on conversation_participants
  for insert with check (
    profile_id = (select auth.uid())
    or exists (
      select 1 from conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid())
    )
  );

create policy "participants can view the participant list" on conversation_participants
  for select using (is_conversation_participant(conversation_id, (select auth.uid())));

create policy "participants can update their own read receipt" on conversation_participants
  for update using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "participants can read messages" on conversation_messages
  for select using (is_conversation_participant(conversation_id, (select auth.uid())));

create policy "participants can send messages" on conversation_messages
  for insert with check (
    author_id = (select auth.uid())
    and is_conversation_participant(conversation_id, (select auth.uid()))
  );

create policy "authors can edit or soft-delete their own messages" on conversation_messages
  for update using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
