# PsyAlliance 1.0: migration and rollback notes

One new SQL file: `supabase/migrations/0127_v1_corrections.sql`. Run it after 0123 to 0126 (Release B and C). It can be run twice with no harm: it was applied twice on the local copy, and the full test run happened after the second run. Nothing has been run on the sandbox or live projects.

## What it changes

1. **Guide events (review F09).** `log_lifecycle_event` ignores a visitor who is not signed in when they try to write the "real" namespace. There is a new event, `demo_started`, so opening a demo is no longer counted as finishing an exercise.
2. **Matching respects pauses (F05).** `workspace_people()` now returns each colleague's `participation` (open to new referral, Cover and Consult requests right now). The server checks from Release C are unchanged.
3. **Phone alerts (F01 to F03).**
   - `notification_deliveries` gains `claim_token` and `lease_until`.
   - New table `alert_attempts` (one row per device or phone number, readable only by the service role).
   - `claim_alerts` and `finish_alert` are replaced with versions that use a token and a lease.
   - New `my_device_alerts(endpoint)`.
   - `my_latest_alert()` is removed.
4. **Spelling (F17).** The three group functions say "organizers". They work the same as before.
5. **Waiting members get the real Hub.** `workspace_boot()` gives a member whose license is not yet verified their own empty workspace and a `waiting` checklist, instead of sending them to the old page. Every action that reaches a colleague is still refused by the server until they are verified. It also returns `myServices` for the Hub status line.
6. **@mentions.**
   - The notification type `mention` is added.
   - New `mention_notify(kind, ref, ids)`. It checks that the caller wrote the message or reply, and that each person can already see it. It sends an in-app notification only (no email), to at most 10 people.
   - New `consult_mentionable(consultation)`.

## After running it

Check it landed. Expect `t`, `t`, `f`:

```sql
select to_regprocedure('public.mention_notify(text,bigint,uuid[])') is not null as mentions_ready,
       to_regclass('public.alert_attempts') is not null as attempts_ready,
       to_regprocedure('public.my_latest_alert()') is not null as old_lookup_still_there;
```

If a page says "That didn't save" right after, run `notify pgrst, 'reload schema';` once.

## Rolling back

The safe rollback is to **redeploy the previous Worker and leave the SQL in place.** With Release C code and this SQL:

- Everything works except the phone-alert sender, which would fail (it calls the old `claim_alerts` and `finish_alert`). This only matters if you turned on Release C's alerts (VAPID keys and the `alert-sender` schedule). If you did, stop the schedule with `select cron.unschedule('alert-sender');`.
- Waiting members would see the Release C workspace instead of the old page. The server still refuses their sends.

To undo 0127 completely, run this, then re-run `0125_participation_alerts_groups.sql`. That puts back the Release C alert functions, `my_latest_alert` and the group functions.

```sql
drop function if exists public.mention_notify(text, bigint, uuid[]), public.consult_mentionable(bigint), public.my_device_alerts(text);
drop function if exists public.finish_alert(bigint, uuid, text, boolean, text, boolean);
drop function if exists public.claim_alerts(integer);
drop table if exists public.alert_attempts;
alter table public.notification_deliveries drop column if exists claim_token, drop column if exists lease_until;
delete from public.notification_events where event_type = 'mention';
```

Then re-run `workspace_people` and `workspace_boot` from the release that last defined them (`0120_final_product.sql` or later), and `log_lifecycle_event` from 0125. The `mention` value can stay in the type list; it is harmless.

## Worker settings

| Name | Needed for |
|---|---|
| `PHONE_ALERTS` | **Leave unset.** Set to `on` only after a real-phone test; until then the alerts setting is hidden. |
| `ANTHROPIC_API_KEY` | Quick start (profile import). Already used before 1.0. |
| `ANTHROPIC_MODEL` | Optional. A retired name now falls back to a current model. |
| `PUSH_TEST_LOCAL` | Testing only. Never set it on the sandbox or live. |
