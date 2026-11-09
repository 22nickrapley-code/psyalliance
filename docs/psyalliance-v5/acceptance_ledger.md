# v5 acceptance ledger (Nick's 8 Nov walkthrough)

Build: branch `v5`, local staging copy (fictional members, local database, AI stand-in), plus a second local copy set up as the sandbox (`app_env = demo`, 1,200 fictional members, demo build). Desktop 1365 wide unless stated. **No real phone, real email, real website fetch or screen reader was used.** New tests: `e2e/tests/staging/v13/v5.spec.ts` (V5-01 to V5-08) and `v5-sandbox.spec.ts` (V5-SBX-01 to 05).

| ID | Your feedback | What changed | Evidence |
|---|---|---|---|
| S1 | Guided tasks must actually guide | All five tasks: the step sits in the pop-up header beside the title ("Trying: Refer a client · Step 1 of 3"), the next field or button has a gold outline and the instruction updates as you type. After sending it carries on: open the offer, Referral/Cover agreed, confirm handover (each tick), Confirm cover arranged. | V5-SBX-04; walked end to end for Referral, Cover (8 steps to "Confirm cover arranged"), Consult, Availability, Message |
| S2 | "Trying" bubble hidden behind the pop-up | In a pop-up the guidance is in the header; outside one, the bar sits at the top of the page (no longer over the message box). | screens |
| S3 | 9 actions at start, 26 notifications in 15 min | New guests start with nothing waiting and nothing unread. First colleague at ~2 min, then every 4 min, 8 in all; none while a task is open. Sandbox colleagues answer your own requests at most 2 per client / 3 per referral, one a minute. | V5-SBX-01, V5-SBX-02, SBX-02, SBX-07, SBX-12 |
| S4 | Remove Imani's Thursday Circle message | Imani now writes about a client moving states. | V5-SBX-02 |
| S5 | Settings: Sandbox panel at the top | Moved. | V5-SBX-05 |
| H1 | Availability boxes misaligned; too much white space | Service cards are compact rows; the three availability boxes share height, and Consult's buttons match the others. | screens |
| H2 | Demos pop-up: checkbox at the top | Moved. | screens |
| R1 | Review: spacing around reply time and Timeframe | Added. | screens |
| R2 | Journey discs too far from the line | The line now runs disc to stage to disc. | screens |
| L1 | Active green, Completed grey (Referrals, Cover) | Rows and tabs. | V5-06 |
| C1 | Cover colleagues: Next client, list jump, last client cut off | "Next client" in the footer and at the end of each list; the client list keeps its scroll; the list fits above the footer. | V5-05, B-01b, screens with 8 clients |
| C2 | Review: By colleague order | Most requests first, then closest relationship. | V5-05 |
| C3 | Review rework | Asks "How should your N clients be asked?" first; the order (drag and arrows) shows only for one at a time; reordering keeps the client open; laid out like the Referrals review. | V5-05, B-03 |
| K1 | Consult tabs overflow | Tabs sit inside the panel and wrap; long titles wrap. | screens |
| K2 | Gold box on followed posts | Removed; gold "Following" label kept. | screens |
| K3 | Open on Active | Active is the first tab and the default. | V5-04, V5-SBX-03 |
| K4 | Groups behind a switch; six audiences | Admin, Features (off on both sites). Off: no groups in Consult, Messages or the Hub; posting to a group refused; data kept. Ask a question offers trusted, worked with before, suggested by PsyAlliance, one, a few, the whole network. | V5-03, V5-04, V5-SBX-03, NC-04 and NCU-10 with the switch on |
| N1 | Network columns, box sizes, recency filter | Each column as long as its list (5 a page, own pager); boxes one height on desktop; filter in the purple header. | V5-07, NB-01 |
| P1 | Professional history | Count of collaborations, then a line each (3 a page). The "Listed as worked with before..." line is gone. | screens |
| M1 | "Just chatting" spacing; red dots | Tidy centred block; a line under the tabs explains the red dot. | V5-08, screens |
| M2 | Voice note plays 1 to 2 s of 6 s | Cause: the screen redrew every few seconds and replaced the playing note. A playing note is now carried across redraws. The recording and file were already complete (6.06 s recorded, 6.06 s served). | measured with a fake microphone; not tested on your Mac |
| I1 | Save profile does nothing after import | Cause: an imported "email" like "Email me" failed the browser's check inside a closed section, silently. Imports now drop anything that isn't a real email or phone, and Save opens the section with the problem. | V5-01 |
| I2 | Website links fail | Any public https page is read now (http upgraded, redirects checked, 10 s limit); local/private addresses never. | V1-05 (private address refused); real sites not reachable from staging |
| I3 | No photo from Psychology Today | The PT headshot (or the page's og:image) is offered with "Don't use it". | code only; not tested against the real site |
| I4 | Quick start and "Filled in" boxes too busy | Shorter copy, one placeholder, no chip list. | screens |
| F1 | Founding places per open state | "40 of 40 founding places left in New York" for every open state, homepage and sign-up. | V5-02, R18-13 |
| X1 | Found while testing | Re-seeding the sandbox network failed on the "resolved question" guard (fixed in 0131); the "Set your availability" guided task never opened (fixed); a plan with only an agreed colleague said "Nobody has been asked yet" (fixed); browsers kept old CSS after v4 (version bumped). | |

## Regression

Full run (staging + phone, 934 tests, live-like copy): 833 passed, 35 skipped, 17 failed on the first run. Of the 17: six known `/sandbox/request` tests (need outside access), A1-10, B-04 and C-05 (all pre-existing, as in v4), and eight tests that expected v4 behaviour I changed on purpose (groups off, 4-minute pacing, founding-places query, "Active" first, the new review layout, any website readable). Those eight were updated and re-run: all pass. The files that stop after a failure were re-run in full: v4, v5, v15, release-v1, release-b-network all pass.

Sandbox build: 19 of 27 sandbox tests pass, including all V5-SBX. The other 8 (SBX-08, 09, 11 x4, 15, 16) are older tests written for screens replaced before v4 (they look for `.chat-pane`, old select labels and an old draft format); they have been skipped in every normal run since and fail the same way. Not v5 regressions; worth rewriting before the pilot.

SQL: `0131_v5.sql` ran twice without errors on both copies; `v3-workflow-checks.sql` and `v4-checks.sql` pass (v4-checks needs NY/MA building their founding circle, as on your sites).

## Not tested here

Your Mac and phone, real Psychology Today and practice websites, real email, the Cloudflare build, screen readers. Mobile and demos were not reviewed, as agreed.
