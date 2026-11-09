# 0132_v6.sql: what it changes and how to undo it

Run once on the sandbox, then once on live, after 0131. Safe to run again: every function is `create or replace`, written out in full, and nothing is added to a table.

## New functions

- `public.workspace_photos(ids)`: the photo path for each colleague the member's workspace already shows (verified, active, same demo or real world, not blocked), plus the member's own. The workspace turns these into six-hour signed links. Granted to signed-in members only.
- `private.sandbox_clear_outgoing(guest)`: removes a sandbox guest's own cover plans and referrals (and their conversations and notifications) at the start. It does nothing outside the sandbox site, or for anyone who is not a demo profile.

## Replaced functions (same calls as before)

- `public.enforce_document_publish_requirements` (the Library publishing guard): an admin may now approve and publish a resource on their own. For anyone else the reviewer rules are unchanged.
- Sandbox only (they do nothing on live, where `app_env` is not `demo`): `private.seed_final_extras` (now also clears the guest's outgoing plans and referrals) and `private.sandbox_story_event` (eight incoming arrivals: Eli cover, Lena referral, Rena question, Sophie cover, Marcus question, Maya referral, Imani message, James reply).

## Changed behaviour to know about

- **Library.** Admin, Library: Publish is always available to an admin. Reviewer approvals are recorded if given, but no longer required.
- **Sandbox start.** A new guest (or "Start the story again") has no outgoing referrals or cover plans. Incoming history (Eli's referral answered, Alex's October cover answered) stays. Guests already mid-story carry on; steps they have passed are not repeated.
- **Cover change of a client's needs** (app code, not SQL): the change now sends only the client's details, so the plan's name and message are untouched. Before, it was refused with "Give the plan a short name", and would have cleared the plan's message.

## Checked

Run twice in a row on the local copy without errors. A new sandbox guest starts with 0 plans, 0 referrals and nothing unread; all eight arrivals fire in order. `workspace_photos` returns paths for the viewer's own world only.

## Undo

Re-run `public.enforce_document_publish_requirements` from `0081_library_review_governance.sql`, and `private.seed_final_extras` and `private.sandbox_story_event` from `0131_v5.sql`. Then, if you want them gone:

```
drop function if exists private.sandbox_clear_outgoing(uuid);
drop function if exists public.workspace_photos(uuid[]);
```

A v5 site never calls either function, so rolling back the site alone is safe.
