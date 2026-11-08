# v4 acceptance ledger

Status: **Done** (built and checked on staging), **Partly** (built, with a gap named), **Outstanding** (not built). "Checked": SQL = `e2e/staging/v4-checks.sql` or `v3-workflow-checks.sql` (rolled back, all passed), Suite = the staging Playwright suite (`e2e/tests/staging/v13/v4.spec.ts` unless named), Shot = a screenshot on staging, Code = read through only.

Decisions are Nick's of 6 Nov (A1 to B9 and the AI questions), in the project doc `psyalliance-final-build-questions`.

## AI (switch, smart requests, Ask PsyAlliance)

| ID | Change | Status | Checked |
|---|---|---|---|
| AI-01 | "AI tech enabled" switch in Admin, one per site, off when deployed; takes effect on the next page load, no rebuild | Done | Suite V4-01, V4-02; SQL V4-AI |
| AI-02 | The server checks the switch on every AI call, not just the screens | Done | SQL V4-AI-03 |
| AI-03 | 20 AI uses a day per member, counted on the server; admin sees today and the last 7 days | Done | SQL V4-AI-06 to 08; Suite V4-07 |
| AI-04 | Smart referral: describe the need, the form fills in; only values on PsyAlliance's lists; the rest shown as "Not matched"; nothing sent | Done | Suite V4-03; Shot |
| AI-05 | Smart cover plan: describe the time away (reason, dates, until further notice, states, name) | Done | Code; Shot |
| AI-06 | Cover clients from a description or a dropped file (.xlsx, .csv, .docx, .txt): read in the browser, name/date/contact/record columns dropped and identifiers removed before sending, the member sees exactly what is sent and ticks a box | Done | Suite V4-05 |
| AI-07 | Speak instead of typing (microphone button in Chrome, Edge and Safari; browser speech service, said so on screen) | Done | Code (no microphone on the test machine) |
| AI-08 | Text with contact details, full dates, record numbers or addresses is refused before the model | Done | Suite V4-04 |
| AI-09 | Ask PsyAlliance: one slim line on the Hub; answers only from the member's plans and referrals, the Library and the product guide, with sources; made-up sources are dropped; no source means "I don't know" | Done | Suite V4-06; Shot |
| AI-10 | Ask never names colleagues itself: the usual matching rules list them, labelled as such; "Start a referral / Plan cover with this need" | Done | Suite V4-06 |
| AI-11 | All AI code in one server file (`src/workspace/server/ai.ts`) and one marked block in the engine | Done | Code |
| AI-12 | Profile import ("Fill in from this text") is not affected by the switch | Done | Code |

## Workflow decisions (A and B)

| ID | Change | Status | Checked |
|---|---|---|---|
| A1 | After a discussion, "Cover agreed" / "Referral agreed" asks the colleague to confirm; their Confirm makes it count, "That's not right" keeps the discussion; if they had offered, it counts at once | Done | SQL V4-CONFIRM, V3-AGREE, V3-RAGREE; Suite V4-08, V4-09, CVU-02, RFU-02 |
| A1b | 24-hour reminder; at 48 hours it comes back to the member (Actions and the plan) with Ask again or Decline and continue search; nothing moves on by itself | Done | SQL V4-CONFIRM-05 to 10; Suite V4-09 |
| A1c | Sandbox colleagues confirm within a minute or two | Done | Code |
| A8 | Closing or reducing practice: temporary cover, "From", optional "Until", "Until further notice", link to Referrals and Continuity; "End this cover" | Done | SQL V4-OPEN; Shot |
| B1 | Availability reminders at day 60 and day 90; out of suggestions at 120 | Done (already so in v3: the reminder appears at 60 and comes back at 90) | Code |
| B2 | Continuity "Still correct" on the plan and on the yearly reminder | Done | SQL V4-STILL |
| B3 | Empty group: "Currently no members of your group"; Continue draft opens the group | Done | Code |
| B4, B5, B6 | Referral default one at a time; 20 at once; arranged plans stay active | Confirmed, unchanged | v3 checks |
| B7 | "Close" on a placed or withdrawn referral moves it to Completed | Done | SQL V4-REF-04; Suite V4-10 |
| B8 | Consult cards: Active green, Resolved grey, gold edge for Following | Done | Code |
| B9 | 40 founding places per state; $30 a month after; nothing charged | Done | SQL V4-MEMBER |

## Owed from v3 (GPT review)

| ID | Change | Status | Checked |
|---|---|---|---|
| R02 | Warnings (prescribing, age, setting, insurance) and "Confirmed X days ago" on the Cover review and the referral review | Done (the Cover agreed confirmation already showed them) | Code |
| R04 | Continuity drafts per account and site, expire after 7 days, and ask before laying an old draft over a newer saved plan; the old shared draft is cleared | Done | Code |
| R05 | No "Transfer from" or "Permanent placements" (see A8). The v3 ledger wrongly marked this Done | Done | Shot |
| R08 | A demo chosen deliberately ("Watch another" or the choice page) sets the goal shown at sign-up; a demo opened directly leaves it alone | Done | Code |
| R09 / A7 | Library is for members: sign-up and homepage say so | Done | Suite (journeys-account, r18-feedback) |
| R12 | Cover calendar wording; homepage no longer promises "actually available"; "No results" no longer shown above message results; private question names who can see it; completed plans don't repeat "completed" | Done | Code |

## Previously outstanding

| ID | Change | Status | Checked |
|---|---|---|---|
| X-01 | Change details on a sent plan (dates, name, message, each client's needs other than main need and state) and a sent referral; colleagues told; "Details changed" shown | Done | SQL V4-CHANGE, V4-REF-01; Suite V4-10 |
| X-02 | Membership: "Activate membership" in Actions after verification; founding places from zero, given on activation, existing members in original approval order; $30 a month after; NY and MA building their founding circle (whole-network referrals wait); Admin, Membership and Admin, States controls | Done | SQL V4-MEMBER, V4-CIRCLE; Suite V4-11, V4-12 |
| X-03 | Sharing and phone alerts (SMS) | Outstanding by decision (email at the pilot; push and SMS after your mobile pass) | |
| X-04 | GPT review vs your feedback | Done: answered 6 Nov | |
| T-01 | The seven parked tests (B-02, CVU-02, RFU-02, RFU-03, RA-05, RA-06, A1-06) rewritten for the current flow | Done | Suite |

## Not done in v4

- Terms of use now say $30 a month after the founding places. This needs your legal reviewer, like the rest of the terms.
- Real-phone checks (keyboard, microphone, file picker) are yours in the mobile pass.
- AI with a real model: staging used a stand-in. The first real check is the sandbox, after you add the key and switch AI on.

## Regression (staging suite, final build)

Full run of the staging suite (919 tests) after a full staging rebuild with all migrations including 0130: **843 passed, 30 skipped, 11 failed, 35 did not run** (later tests in files that run in order stop after a failure).

| Failures | Cause | Now |
|---|---|---|
| 6 x `RT /sandbox/request` | Need outside access; fail the same way on every offline run | Unchanged, not a product fault |
| MB-07, V15-04 | Timing under the load of the full run | Re-run on their own: pass |
| A1-10, B-04 | Look for labels that are not in the code (unchanged since before v3) | Existed before v3; not touched |
| C-05 | Phone-alert test needs the alert dispatch secret and mock push service | Environment; alerts unchanged |

Fixed during the runs: three tests that only now ran because an earlier test in the same file used to fail first (MB-09 notification row, V15-06 Library tile on a copy without files, V15-07 own-profile header), the States admin form (the new founding-circle button had taken the state field the Close button relies on), and two v4 wording slips found by the suite (cover invitation dates, "closed" wording). MB-10 was written for the inbox before the 1.0 redesign and had never run; it is parked with that note.
