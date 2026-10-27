# Final product decisions (Nick and Claude, 27 Oct 2026)

The goal: one final product that combines the best of the original product and the approved mock-up (v13), built once and then tested end to end by Nick. Each decision below is Nick's, taken in conversation. Concern numbers (C-xx) refer to `concerns_for_nick.md`.

## Round 1: shell, safety, supervision, contrast

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-01 | C-06: pages the mock-up does not cover (profile editing, documents, continuity plan, credentials, notifications, physician referrals, admin) | **Reskin them into the new shell.** | One sidebar, tokens and components everywhere. Functionality of these pages unchanged underneath. A new build task per page, tested for parity with today's behaviour. |
| D-02 | C-25: report and block | **Add both, small and quiet.** | "Report" text link in the discussion window (question and reply) and a "Block" row in the profile window, in the approved styles. Reports go to the existing moderation queue; block uses the existing database rule. |
| D-03 | C-27: Supervision | **Hide for launch, keep the data.** | No Supervision tab or page in the final product's screens. Tables, rules and routes stay so it can return. |
| D-04 | C-37: contrast | **Darken slightly, keep the look.** | Small muted text colours move to the passing values in `a11y_contrast_findings.csv` (same hue, median 3 points darker); the amber badge a little darker. Recorded as an approved exception to the frozen CSS. |

## Round 2: availability and matching rules

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-05 | C-02: pause-until and Cover / Consult openness | **Approved availability window plus the extras.** | "Pause until" date and Cover / Consult openness live inside the approved Availability window, in its styles; the old page stops being needed. The overall-spaces number, per-state settings and Confirm unchanged stay as approved. |
| D-06 | C-03: reconfirm wording | **Keep day-30 reminders, fix the copy.** | Reminder emails unchanged. Hub card and window copy say members are reminded from day 30 and stop showing as available now after 90 days (confirmed through day 90, stale from day 91). |
| D-07 | C-11: in-person matching | **Primary city or any licence city.** | Server rule as built. The match card says which city matched. The screens' own check is aligned to it. |
| D-08 | C-05: Worked with before | **Approved rule: agreed work only.** | Cover agreed, confirmed referral placement and recorded completions only. Consult replies and reactions never create it. The old pages' definition is changed to match so the product says one thing everywhere. |

## Round 3: Referrals, Hub, invitations

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-09 | C-43: referral numbering and titles | **Per-member numbering ("Referral 1", "Referral 2"), plus a title the referrer can change to something specific to the person referred, with the basic details (treatment area etc.) still shown beside it for quick reference.** (Nick's own wording.) | Number is the member's own running count of referrals they have sent. A private, editable title per referral. Lists show title, number, treatment area, setting, state and status together. **Open point (raised back to Nick):** a free-text title can end up holding a client's name or initials, which the product has so far avoided (system-generated case ids; "no details that identify a client"). Safeguards to be agreed in round 4. |
| D-10 | C-14: lapsed licence | **Allow decline only.** | A colleague whose licence has lapsed can decline a referral or cover request (so the sender moves on at once) but cannot show interest or accept. |
| D-11 | Quick Referral Search on the Hub | **Keep the Hub as approved.** | No new card. Referrals tile and Search anything stay the routes to matching. |
| D-12 | C-26: invitation trust | **Inviter trusts, joiner chooses.** | The person who invites is added to nobody's circle automatically except that the inviter's circle gains the joiner; the joiner sees the inviter first in Suggested with a one-tap "Add to my trusted colleagues". Backend change to the invitation redemption rule; copy matches. |
