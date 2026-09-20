-- Nick's Sept 20 feedback: when an admin approves someone (credential
-- verification / member status -> 'verified'), the person should get a
-- notification explaining they've been approved. Those notifications (and
-- any future admin/company notice) show up in the Messages inbox alongside
-- real conversations, but visually distinguished (gold, "PsyAlliance Team"
-- badge) from messages sent by other members - same pattern GitHub/LinkedIn
-- use for "system" notifications mixed into an activity/inbox feed.
--
-- Deliberately a separate table rather than reusing conversations/
-- conversation_messages: a notification has no "other participant" (it's
-- from the platform, not a colleague), doesn't need @mentions or reply
-- threading, and only an admin should ever be able to create one for
-- someone else - a shape that would be awkward to bolt onto the
-- conversations schema without opening it up to be spoofed as a real DM.

create table if not exists system_notifications (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  body text not null check (char_length(trim(body)) > 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists system_notifications_profile_id_idx on system_notifications(profile_id);
create index if not exists system_notifications_created_at_idx on system_notifications(created_at desc);

alter table system_notifications enable row level security;

create policy "users can see their own notifications"
  on system_notifications for select
  using ((select auth.uid()) = profile_id);

-- Mark read/unread is the only thing a member can change on their own
-- notification row - same "own row, whole-row update via a trusted server
-- action" pattern already used for conversation_participants.last_read_at.
create policy "users can update their own notifications"
  on system_notifications for update
  using ((select auth.uid()) = profile_id);

create policy "admins can see all notifications"
  on system_notifications for select
  using (is_admin_user((select auth.uid())));

create policy "admins can create notifications"
  on system_notifications for insert
  with check (is_admin_user((select auth.uid())));
