-- Rebuild Phase 4, batch 6: notification/event architecture (Addendum A2).
-- Explicitly called out as foundational infrastructure that should move
-- near the start of the rebuild, not a late add-on - "the product should
-- remain useful when the member is not logged in."
--
-- Deliberately provider-agnostic (A2: "do not hard-code the architecture
-- around a specific vendor") - the actual outbound email send is a stub in
-- src/lib/notifications-v2.ts (Nick's explicit call: build the function
-- now, wire up a real provider later). Nothing here assumes Resend/
-- SendGrid/etc.
--
-- notification_events is the thing that happened; notification_deliveries
-- is one channel's delivery of that event to one recipient - the
-- event/recipients/category/channel/digest-eligibility/deep-link/dedup/
-- retry/audit split Addendum A2 asks for.

create table notification_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'coverage_request', 'coverage_response', 'coverage_confirmed',
    'referral_sent', 'referral_response', 'referral_connected',
    'consultation_response', 'consultation_invite',
    'trusted_invitation_sent', 'trusted_invitation_accepted',
    'credential_reminder', 'availability_reminder',
    'message_received', 'system_notice', 'weekly_digest'
  )),
  actor_profile_id uuid references profiles (id) on delete set null,
  actor_type actor_type not null default 'system',
  -- Suppresses a duplicate notification about the same underlying thing
  -- (e.g. 'coverage_request:42') - checked at delivery-creation time in
  -- the service layer, not a hard uniqueness constraint here, since the
  -- same key can legitimately recur later (a case reopening, say).
  dedup_key text,
  -- Relative in-app path the notification links to, e.g.
  -- '/dashboard/coverage/42'.
  deep_link text,
  summary text not null check (char_length(trim(summary)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_notification_events_type_created on notification_events (event_type, created_at desc);
create index idx_notification_events_dedup on notification_events (dedup_key) where dedup_key is not null;

create table notification_deliveries (
  id bigint generated always as identity primary key,
  notification_event_id bigint not null references notification_events (id) on delete cascade,
  recipient_profile_id uuid not null references profiles (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'digest')),
  digest_eligible boolean not null default true,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'suppressed_dedup', 'suppressed_preference')),
  delivered_at timestamptz,
  read_at timestamptz,
  retry_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index idx_notification_deliveries_recipient on notification_deliveries (recipient_profile_id, created_at desc);
create index idx_notification_deliveries_event on notification_deliveries (notification_event_id);
create index idx_notification_deliveries_unread on notification_deliveries (recipient_profile_id) where channel = 'in_app' and read_at is null;

alter table notification_events enable row level security;
alter table notification_deliveries enable row level security;

-- Events themselves carry no per-recipient content, only what happened -
-- readable the same way professional_events is (de-identified, network
-- context), but in practice every read path goes through
-- notification_deliveries, which is the recipient-scoped table.
create policy "notification events are readable network-wide" on notification_events
  for select using ((select auth.uid()) is not null);

create policy "system/service inserts notification events" on notification_events
  for insert with check ((select auth.uid()) is not null);

create policy "own deliveries only" on notification_deliveries
  for select using ((select auth.uid()) = recipient_profile_id);

-- Marking read is the only thing a recipient changes on their own
-- delivery row - same pattern as system_notifications.read_at.
create policy "recipient marks their own delivery read" on notification_deliveries
  for update using ((select auth.uid()) = recipient_profile_id) with check ((select auth.uid()) = recipient_profile_id);

create policy "system/service creates deliveries" on notification_deliveries
  for insert with check ((select auth.uid()) is not null);

-- Per-category channel preferences (Addendum A2's "in-app; email;
-- ... weekly digest") extending the existing notification_preferences
-- table's already-established per-category boolean pattern, rather than
-- inventing a separate generic key/value preferences model for just the
-- new categories.
alter table notification_preferences
  add column if not exists email_on_coverage_request boolean not null default true,
  add column if not exists email_on_coverage_response boolean not null default true,
  add column if not exists email_on_consultation_response boolean not null default true,
  add column if not exists email_on_consultation_invite boolean not null default true,
  add column if not exists email_on_credential_reminder boolean not null default true,
  add column if not exists email_on_availability_reminder boolean not null default false,
  add column if not exists email_on_trusted_invitation boolean not null default true;
