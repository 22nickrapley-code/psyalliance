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
| D-09 | C-43: referral numbering and titles | **Per-member numbering ("Referral 1", "Referral 2"), plus a title the referrer can change to something specific to the person referred, with the basic details (treatment area etc.) still shown beside it for quick reference.** (Nick's own wording.) | Number is the member's own running count of referrals they have sent. A private, editable title per referral. Lists show title, number, treatment area, setting, state and status together. Safeguards agreed in round 4 (D-13). |
| D-10 | C-14: lapsed licence | **Allow decline only.** | A colleague whose licence has lapsed can decline a referral or cover request (so the sender moves on at once) but cannot show interest or accept. |
| D-11 | Quick Referral Search on the Hub | **Keep the Hub as approved.** | No new card. Referrals tile and Search anything stay the routes to matching. |
| D-12 | C-26: invitation trust | **Inviter trusts, joiner chooses.** | The inviter's circle gains the joiner automatically (they chose to invite them). The joiner's circle starts with nobody added; they see the inviter first in Suggested with a one-tap "Add to my trusted colleagues". Backend change to the invitation redemption rule; copy matches. |

## Round 4: referral titles, Consult, physician referrals, naming

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-13 | Referral title safeguards (follows D-09) | **Private title with guardrails.** | Editable title of about 40 characters, visible only to the referrer (never to colleagues, never in notifications or emails). Shows the "no names, dates or details that identify a client" reminder and runs the same identifier checks (phone, email, full date, record number, street address). Default title is the number plus treatment area. Lists show title, number, treatment area, setting, state and status. |
| D-14 | C-28: Consult extras (Nick asked for my recommendation) | **Mark resolved: yes. "Mine" tab: no. Groups: yes, in the new shell. Drafts: as the mock-up.** | Asker can mark their own question resolved (small control in the discussion window; resolved questions stop attracting replies and show a quiet "Resolved" label). Your own questions stay under Following with a "Your question" label, so the approved All / Following pair is unchanged. Group creation and management move into the new shell (reskinned groups page, linked from the group card and Consult), per D-01. The workspace keeps one draft; older database drafts stay in the database. |
| D-15 | C-22: physician referrals | **A tab inside Referrals.** | Referrals gets a third view, "From physicians" (acknowledge or decline), in the same tab style. The full notifications list stays behind the bell, reskinned (D-01). |
| D-16 | C-44: naming | **"Library" everywhere.** | Public home, sign-up, terms, privacy and admin screens say "Library". |

## Round 5: PSYPACT, demo world, messaging, look and feel

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-17 | PSYPACT telehealth matching | **Allow PSYPACT telehealth matches, labelled.** | A colleague is eligible by PSYPACT when the setting is virtual, the client's state and the colleague's home state are both compact states, and the colleague participates (and qualification rules in `src/lib/psypact.ts` hold). The match card says "PSYPACT telehealth". Server and screens use one rule; compact-state list checked against psypact.gov before launch (the 7 Oct appraisal found NY and MA wrongly treated as compact). |
| D-18 | C-40: demo and sandbox world | **Keep the large generated world** (about 1,200 fictional colleagues, 40 discussions). | No change. Noted: the 7 Oct appraisal's concern about a generated-looking cast stays open; hand-casting the first ~25 people can be done later without changing structure. |
| D-19 | C-09: messaging delivery | **Real-time now.** | Messages arrive without waiting for a poll. **To confirm with Nick before building:** the local test stack has no Realtime service, so this cannot be proven here the way everything else has been; see the note in the next message. |
| D-20 | Look and feel | **No change: the mock-up is the look.** | Every reskinned page matches the approved screens; only the contrast tweak (D-04) and the extras above depart from them. |
