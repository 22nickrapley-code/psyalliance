# Release C: migration and rollback notes

One SQL file: `supabase/migrations/0125_participation_alerts_groups.sql`. It is written so it can be run twice with no harm (it was applied twice on the local copy, and the tests ran after the second run). Nothing has been run on the sandbox or live projects.

## What it adds

1. **Participation choices.** Table `member_participation` (one private row per member, readable and writable only by that member): optional situations, open/paused flags for referral, Cover and Consult requests with optional pause-until dates, phone-alert settings, quiet hours, and the one-time starting intent. Functions `my_participation()`, `set_my_participation(jsonb)`, `set_starting_intent(text)`, `use_starting_intent()`.
2. **Pauses reach matching.** `private.cover_exclusions` (used by Cover and referral matching and by the server checks) now also excludes a colleague who has paused or closed that kind of request. It affects **new** requests only. A request already sent to that colleague can still be answered (`cover_answer` is unchanged), and plans, referrals and conversations already under way are not touched. A pause with an end date does **not** reopen by itself: the member is asked to review and must press Resume.
3. **Phone alerts.** Table `push_subscriptions`; delivery channels `push` and `sms` and status `suppressed_closed` added to `notification_deliveries`; a trigger on in-app deliveries that creates a push and/or text delivery only for members who opted in; `claim_alerts` and `finish_alert` (service role only, used by the alert sender); `my_latest_alert()` (wording asked for by the phone after a push). The wording is fixed in `private.alert_text`: sender's first name, kind of request, "Review request." Never a client reference, never message text.
4. **Groups.** Table `consultation_group_charters` (every charter version kept, backfilled from the current charter), versioning triggers, and the functions `group_edit_charter`, `group_set_role`, `group_remove_member`. Only organisers (the creator and anyone the creator appoints) can change the charter or remove a member; only the creator appoints organisers. The membership guard trigger `guard_group_membership_change` was rewritten to allow exactly those two functions through, and refuses everything else as before.
5. **Guide events.** Table `lifecycle_events` (namespace demo/practice/real, event name, need; no identity, no text) and `log_lifecycle_event`, callable by visitors, which silently ignores unknown event names.

## After running it

Supabase refreshes its API cache by itself after SQL runs. If the Settings page says "That didn't save" for a brand-new function, run `notify pgrst, 'reload schema';` once and try again.

Check it landed (expect `t` and a number of at least 9):

```sql
select to_regprocedure('public.claim_alerts(integer)') is not null as alerts_ready;
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('my_participation','set_my_participation','claim_alerts','finish_alert','group_edit_charter','group_set_role','group_remove_member','my_latest_alert','log_lifecycle_event');
```

## Rolling back

The SQL only adds. The previous Worker ignores every new table and function, so **the safe rollback is to redeploy the previous Worker and leave the SQL in place.** Two behaviours remain in the database after a code rollback and are harmless: members' pauses still exclude them from new requests (to turn that off, run `update member_participation set paused_referrals = false, paused_cover = false, paused_consult = false, open_referrals = true, open_cover = true, open_consult = true;`), and a phone-alert trigger still queues rows that nothing sends (to stop that, `update member_participation set alert_push = false, alert_sms = false;`).

To remove it completely (loses members' participation choices, push devices, charter history and guide events):

```sql
drop trigger if exists fan_out_phone_alerts on public.notification_deliveries;
drop function if exists private.fan_out_phone_alerts();
drop function if exists public.claim_alerts(integer), public.finish_alert(bigint, boolean, text, text), public.my_latest_alert(), public.log_lifecycle_event(text, text, text);
drop table if exists public.push_subscriptions, public.lifecycle_events;
delete from public.notification_deliveries where channel in ('push', 'sms');
drop trigger if exists group_charter_versioning_upd on public.consultation_groups;
drop trigger if exists group_charter_versioning_ins on public.consultation_groups;
drop function if exists private.group_charter_versioning();
drop function if exists public.group_edit_charter(bigint, text), public.group_set_role(bigint, uuid, text), public.group_remove_member(bigint, uuid);
drop table if exists public.consultation_group_charters;
drop function if exists public.my_participation(), public.set_my_participation(jsonb), public.set_starting_intent(text), public.use_starting_intent();
drop table if exists public.member_participation;
```

Then re-run the definitions of `private.cover_exclusions` from `0120_final_product.sql` and of `public.guard_group_membership_change` from `0110_release_review_fixes.sql`, and restore the two delivery constraints to their earlier lists (`in_app, email, digest` and the earlier status list from `0050`).

## Settings the Worker needs (none are in the repository)

| Name | Where | Needed for |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Worker variable and secret | Free phone alerts. Make them with `node scripts/make-vapid-keys.mjs`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker secret | The alert sender reading the queue. |
| `ALERT_DISPATCH_SECRET` | Worker secret | Protects the sender route. Any long random string. |
| `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Worker secrets | Text alerts, later. Leave `SMS_PROVIDER` unset until you have a paid account; members can still save a number and consent, and nothing is sent. |

Until the VAPID keys exist the "Turn on alerts" button stays disabled and nothing else changes.


## Part 2: SQL 0126_practice_scenarios.sql

Adds one table, `practice_scenarios` (six rows; read-only to visitors; idempotent). It was applied twice to a local database with no change on the second run (test P-06 checks the ids against the code). **Not run on live or the sandbox.** Run it after 0125, on the sandbox first. Rollback: `drop table if exists public.practice_scenarios;` The site works without it (the table is not read by the pages); only the catalogue and its test depend on it. All other Part 2 changes are code only, so rolling the code back restores the old Documents pages without data changes.
