# Version 14: release notes

Branch `followup-old-vs-new` on top of `d96a497` (version 13, live). Written 28 Oct 2026. Nothing was pushed, deployed or run on either Supabase project. The runbook is `release_runbook.md`; the before-and-after pictures and my view of each change are on the review page sent in the chat.

## What was brought back, and how

| Pick | Where it shows | Notes |
| --- | --- | --- |
| G1 Group conversations | Messages: a "Group" filter; members listed; read, reply, report | Cannot be started from the screen yet (see "Smaller than the old version"). |
| G2 Report on a message | Messages | Reports land in the existing Admin moderation list as "Message #id". The admin page itself is unchanged. |
| G3 Topic labels | Consult: label on each question, topic filter chips | Four topics fit one row. |
| G4 "Selected referrals only" | Availability (third referral choice) | Stored in `profiles.referral_availability` as `limited`. Colleagues can still choose the member; the member is not ticked automatically. |
| G5 Ranks and reasons | Referral step 2 | "Top specialty" is the first specialty the member listed. |
| G6 Clarifying-question tick | Consult: a discussion's reply form | "This is a clarifying question"; the reply is saved with that kind and shown as "asked a clarifying question". |
| G7 Exclude from suggestions | Colleague profile, "Your controls" | Stored as `do_not_work_with.block_type = 'exclude'`. Private and silent; the colleague is not told. |
| D2 Messages in the phone bar | Bottom bar: Hub, Cover, Referrals, Consult, Messages | Network and Library are reached from the menu button. |
| D3 Next-step prompts | Cover and Referral rows; open plan and open referral | One shared component: a journey bar and a "Needs from you" box. |
| D4 Home | Greeting, welcome card (14 days after verification), year line, four discussions | The year line is hidden until there is something to count. |
| D6 Fuller colleague profile | Pop-up | Old content in the new frame. |
| D7 Library suggestions | Refer, Consult, Cover | Only where a toolkit item fits. |
| D8 Availability explanations | Availability window | "Last confirmed", "At a glance", "How it's used" (the 30 and 90 day rules). |
| D9 Network shows all five trusted | Network, Your circle | Worked with and Suggested still show the first five, with "View all". |

Not picked and not in: D1 and D5. Screen verdicts applied: muted tints; Home in the new layout with the old content; "Watch example" on every main screen; Cover with the clearer where-you-are bar; the open referral's Need box with the new progress bar; Consult with topic tags, the topic filter and a guidance card; smaller cards in Find colleagues; the old Network; Messages, Library and Discussion in the new look; Availability in the new look with D8 and G4; the tracker as a journey bar plus client rows.

## The database change

`supabase/migrations/0122_followup_old_parts.sql`, for both projects. Functions only: no table, no column, no data. Replaces 13 functions and adds `workspace_year` and `workspace_profile_signals`. Safe to run twice. `supabase/rollbacks/0122_followup_old_parts.rollback.sql` restores every replaced function exactly and drops the two new ones.

Tested: run twice on the same database (second run changes nothing); rollback, then 0122 again (same result as before); rollback restores each function byte for byte, permissions included; the version 13 code against the 0122 database ({{COMPAT}}).

Things 0122 changes for a version 13 caller: nothing is removed. `set_my_availability` gains a seventh argument with a default and `consult_reply` a fourth, so old calls still work. The new site calls the two new functions, so **roll the site back before the SQL, never the other way round.**

## Smaller than the old version

- **Groups cannot be started from the screen.** Existing groups appear, read, send and report. A "start a group" button is a small separate build.
- **The year line is plain.** One line of counts (clients placed, covered, colleagues' clients covered, referrals taken, questions answered), no history or charts.

## What I would watch

- Hub length on a phone (four discussions before "Your colleagues").
- Topic chips if topics grow beyond four.
- Excluded colleagues losing referrals silently. The four-number query in the runbook counts exclusions before and after.
- The wording "Selected referrals only": some members may read it as "people I have worked with".
- Sent message bubbles are softer; check on a real phone in daylight.
- The Cover row has both a button and an arrow that do the same thing.

## Tests

All on the local staging copy, fictional people only, on a production build of this branch.

{{TESTS}}

## Known items

- `/sandbox/request` route checks (6): need the real website; the same six fail in every offline run.
- A rare hydration warning in ACC-01 on version 13 as well as 14: intermittent, unrelated to 0122.
- "Internal error: step id not found: fixture@NN" in the test log is Playwright noise, not a failure.

## Still yours

The Magic Link subject and Supabase Auth email (SMTP) password fix; legal review of the privacy policy and Terms (including the Library wording, C-44); Library reviews; R07 and R15; keyboard-only, screen-reader and real-phone passes; the C-48 Cloudflare date check; the decision on `wip-1019-small-changes`; physician fields (C-46); old open items #1, #25, #28 to #31 and #37.
