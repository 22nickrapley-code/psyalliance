# 0131_v5.sql: what it changes and how to undo it

Run once on the sandbox, then once on live, after 0130. Safe to run again: the new column uses `add column if not exists`, the new setting uses `on conflict do nothing`, and every function is `create or replace` written out in full.

## New settings and columns

- `app_config.consult_groups` (starts `false`): the consultation groups switch, one per site. Admin, Features turns it on and off. Off, the screens show nothing about groups and a post to a group is refused; groups, members and their discussions are kept.
- `consultations.audience_label` (`worked` or `suggested`, otherwise empty): a question asked of "Worked with before" or "Suggested by PsyAlliance". The colleagues are stored by name, the same way as "A few colleagues".

## New functions

`feature_flags` (what the workspace reads on each page load), `admin_features`, `admin_set_consult_groups`, `private.consult_groups_on`, `private.sandbox_quiet_start`.

## Replaced functions (same calls as before)

- `consult_post`: accepts the two new audiences; refuses a group while groups are off (the sandbox's own seeding is let through).
- `private.discussion_json`: reports the new audiences.
- `private.consult_no_reply_when_resolved`: a statement run in the SQL editor is let through. Re-seeding the sandbox network (`select private.seed_demo_network(null);`) failed on this guard; it works again.
- `founding_places_left`: every open state, from 40 of 40 (it used to wait until a state had 10 founding members).
- Sandbox only (they do nothing on live, where `app_env` is not `demo`): `private.seed_final_extras`, `private.seed_demo_viewer_story`, `public.sandbox_tick`, `public.sandbox_info`, `private.sandbox_story_event`, `private.demo_autorespond`.

## Changed behaviour to know about

- **Sandbox start.** A new guest (or "Start the story again") starts with nothing waiting and nothing unread: Rachel's New York referral is placed with Maya, she has answered Eli's referral and Alex's cover request, the Client 2 handover is confirmed, and she has replied to the two questions asked of her.
- **Sandbox story.** The first colleague gets in touch about two minutes in, then one every four minutes, eight in all: Eli (cover), Lena (referral), Imani (a message, no group), Sophie (can cover Client 3), Marcus (a network question), Rena (a question to Rachel alone), James (a reply), Maya (a message). Nobody gets in touch while a guided task is open.
- **Sandbox colleagues answering the guest.** At most two answers per client and three per referral, one a minute, so a request to many colleagues no longer brings a flood of notifications.
- Guests already in the middle of the old story carry on from where they are with the new steps (the cover and referral steps keep their old request ids, so nothing is made twice).

## Checked

- Ran twice in a row on the local staging copy without errors, on both a live-like copy and a sandbox copy (1,200 fictional members, re-seeded with the fixed guard).
- The sandbox checks (`v5-sandbox.spec.ts`, and the updated `sandbox.spec.ts` / `sandbox-final.spec.ts` tests) ran against a local sandbox build.

## Rollback

Normally: roll back the site in Cloudflare and leave the database as it is. The old screens ignore `audience_label` (a "Worked with before" question shows as "Selected colleagues") and never read the groups switch, so groups would show again. Don't drop the column.
