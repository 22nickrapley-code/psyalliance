# v3 acceptance ledger

Status: **Done** (built and checked on staging), **Partly** (built, with a gap named), **Outstanding** (not built in v3). "Checked" names how it was checked: SQL = `e2e/staging/v3-workflow-checks.sql` (rolled back, all passed), Shot = a screenshot on staging, Suite = the staging Playwright suite.

## Invitation and commitment workflow (Development addendum)

| ID | Change | Status | Checked |
|---|---|---|---|
| W-01 | Wording on every reply: I can cover / I can accept this referral, Ask a question, Not available | Done | Shot |
| W-02 | Cover agreed after a discussion, with the license and membership rechecked first (R03) | Done | SQL V3-AGREE, V3-R03 |
| W-03 | Decline and continue search: confirm, close that colleague, ask the next one | Done | SQL V3-DECLINE, Shot |
| W-04 | Add recipients when the list runs out: full matching, reorder, one at a time or everyone at once (max 20) | Done | SQL V3-ADD, V3-ORDER, Shot |
| W-05 | No recipients remaining: shown plainly, with Add recipients | Done | Shot |
| W-06 | Referral agreed after a discussion | Done | SQL V3-RAGREE |
| W-07 | Referrals one at a time in your order, selected or trusted colleagues only; the whole network is always everyone at once | Done | SQL V3-RSEQ |
| W-08 | Referral reply deadlines, same choices as Cover; an expired invitation closes and the next colleague is asked | Done | SQL V3-REXP |
| W-09 | Decline a referral colleague and continue | Done | SQL V3-RDEC |
| W-10 | A closed invitation can't be answered | Done | SQL |
| W-11 | Response rows grouped by status, numbered queue, reply-by time | Done | Shot |
| W-12 | Notifications use the same words as the screens; older ones are shown in the new words | Done | Shot |

## Cover lifecycle

| ID | Change | Status | Checked |
|---|---|---|---|
| L-01 | Plan phase in the header (before, during, after the absence) | Done | Shot |
| L-02 | Confirm cover arranged: lights up once every client is agreed and every handover ready | Done | SQL V3-ARR, Shot |
| L-03 | Plan stays active until the absence ends, then moves to history by itself | Done | SQL V3-AUTO |
| L-04 | Closing or reducing practice is temporary cover (R05) | Done | SQL |
| L-05 | Client discs ordered by progress then number; agreed and handover-ready look different | Done | Shot |
| L-06 | Cover and Referrals open on Active | Done | Shot |

## Screens (screenshot register)

| ID | Change | Status | Checked |
|---|---|---|---|
| S-01 | Hub Actions only for real work; reply only when unread | Done | Shot |
| S-02 | Hub availability quick controls under the service cards | Done | Shot |
| S-03 | Sandbox guidance above the Hub greeting, from real progress | Done | Shot |
| S-04 | Guidance inside dialogs; arrivals wait until a dialog closes | Done | Shot |
| S-05 | One window for search and notifications; bell and Settings open it on Notifications | Done | Shot |
| S-06 | Member told when verification needs more (flagged or rejected) | Done | Code review |
| S-07 | Profile import: proposals at once, asks before changing saved values, no false leave warning, saving returns to the profile, city shown once | Done | Code review |
| S-08 | Own profile has the colleague header | Done | Code review |
| S-09 | Account and privacy: two duplicate sections removed; clearer empty states for excluded and blocked | Done | Shot |
| S-10 | Consult tabs All discussions, Active, Resolved, Following, with counts; no overflow | Done | Shot |
| S-11 | Library overview: Open PDF, Download, Save to My Files (into a PsyAlliance documents folder); Saved pill removed; repeated wording removed | Done | Shot (staging has no PDFs, so the buttons were checked in code) |
| S-12 | Group chat never stuck on Loading: Try again after a failure or 12 seconds | Done | Code review |
| S-13 | Group cadence is a choice list (no more typos like "Montly") | Done | Code review |
| S-14 | Group organisers see who was invited and hasn't joined, including email invitations; an empty group says Continue setting up | Partly | Shot. The original wording of this item was not to hand; check it matches what you meant |
| S-15 | Network: Worked with before recency filter (6 mo to All), count shows "x of y" when filtered, equal card heights, Suggested in turquoise | Done | Shot |
| S-16 | One sandbox control in the sidebar (Leave, Restart) on every page; account-page sandbox banner removed | Done | Code review (local staging is not the demo site) |
| S-17 | Availability: saved pause shown as a notice; "1 day ago" wording | Done | Code review |
| S-18 | Quarterly availability check and yearly continuity review in Actions | Done | Code review |

## GPT review (R01 to R12)

| ID | Change | Status |
|---|---|---|
| R01 | Matching uses hard stops only in bulk select, save and matching | Done |
| R03 | License recheck at agreement | Done (W-02) |
| R05 | Closing practice is temporary cover | Done (L-04) |
| R10 | Referral offer history kept | Done |
| R11 | Review screen bound to what was reviewed | Done |
| R02, R04, R06 to R09, R12 | Covered by the workflow items above where they overlap; not separately itemised | Partly |

## Not in v3

| ID | Change | Status |
|---|---|---|
| X-01 | Change details (amendments to a sent plan or referral) | Outstanding (your call: last) |
| X-02 | State launch, founding places and the "Activate membership" step | Outstanding |
| X-03 | Sharing and phone alerts, smart requests, practice assistant | Designs only: `docs/v3-designs.md` |
| X-04 | List of places the GPT review contradicts your direct feedback | Outstanding |

## Regression (staging suite, final build)

Full run of the staging suite (907 tests) on a clean staging copy: **809 passed, 31 skipped, 14 failed, 53 did not run** (later tests in files that run in order stop after a failure). Every failure was then looked at one by one and the affected files were re-run:

| Failures | Cause | Now |
|---|---|---|
| 6 x `RT /sandbox/request` | Need outside access; fail the same way on every offline run since Release A | Unchanged, not a product fault |
| 13 tests across Cover, Referrals, Messages, Library, Availability, Notifications, Settings | The test still expected the v2 wording or flow (for example "Discuss first", "I'm interested", the Saved pill, the pause field, the notifications page) | Tests updated to the v3 wording; re-run: pass |
| 3 real faults found by the suite | Settings and Search opened the Notifications window; the profile editor froze when typing; two contrast misses | Fixed; re-run: pass |
| C-02, C-03, C-04 | Test the two Account and privacy sections that v3 removed (S-09) | Skipped, with a note |
| B-02, CVU-02, RFU-02, RFU-03, RA-05, RA-06, A1-06 | End-to-end tests written for the old flow (Choose colleague, Complete arrangement, everyone asked at once by default, setup items leaving Actions on Later) | Marked "fixme" with the reason. The behaviour is covered by `v3-workflow-checks.sql` and the screenshots. **Outstanding: rewrite these seven for v3.** |
| B-04, A1-10 | Look for labels ("Both directions", `.match-profile-link`) that are not in the v2 code either | Existed before v3; not touched |
| C-05 onwards in `release-c.spec.ts` | Phone-alert tests need the server started with the alert dispatch secret and mock push service | Environment for this run; v3 does not change alerts |
