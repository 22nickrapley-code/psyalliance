# Release B: acceptance ledger

Written 30 Oct 2026 for Nick. Build: branch `release-b` (the tip commit is titled "Release B: release notes, runbook, migration and rollback notes, acceptance ledger"; its hash is in `git log`), built for production and run on the **local staging copy** (fictional people only; nothing on the live or sandbox sites or Supabase projects was touched). Nothing was pushed or deployed. Release C (brief sections 11, 13, 21 and 22) has not been started.

**How to read the results.** Pass means the check was run and met the expected result. Partial means part of the scenario passed and the rest is named. Not tested means it was not run. Blocked means it cannot be run from here. A test id such as B-04 is a test in `e2e/tests/staging/v13/release-b*.spec.ts`; ids from earlier releases (CV-, RF-, NC-, FP-, AV-, RA-, A1-) are existing tests that were re-run in the regression below.

**Kinds of evidence.** *Auto* = automated browser test against the real local database. *Phone-sized* = Auto in a 390 or 320 px browser with touch (not a physical phone). *Existing* = a test from an earlier release, unchanged, passing again in this regression. *Physical* = a real device (none this time).

**Emails.** Release B changes no email behaviour and no email is sent, changed or newly triggered by it (see `release_notes.md`, "Emails"). The existing email tests ran in the regression.

## Scenarios

### Cover (brief 6)

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| C01 Twenty clients | **Pass** | Auto B-01, B-01b | Created through twenty; copies get new numbers; the twenty limit holds and no copy button is offered past it; removing client 20 and copying again gives 21, never 20 again; all numbers unique. A copy carries no colleague choice, and editing one client leaves another unchanged. A draft plan has no responses or handover state yet, so there was nothing of those to carry over. No new limit was added. |
| C02 Mixed bulk eligibility | **Partial** | Auto B-02; Existing RA-15, CV-15 | Passed: nobody is chosen for you; both matching views agree on who can take which client (a prescribing client is excluded in both, with the reason "Prescribing required"); By colleague applies to the eligible clients only and reports **Added to**, **Already selected for** and **Excluded** with reasons; applying twice changes nothing; editing a client's needs re-checks every chosen colleague, removes only the one who no longer fits, says who and why, and puts nobody in their place; nothing is sent while preparing. The licensing route is compared with the database in seven cases (RA-15). **Not run:** every combination of licence states, ages, insurers and languages through both views (state and prescribing were exercised; the others use the same rule but have no test of their own here). |
| C03 Workload and review | **Pass** | Auto B-03, B-03b | The review lists each colleague with number of clients, states and settings, how many they would be asked first and how many are queued, overall spaces and "Confirmed N days ago". Correct one/many wording throughout. Reorder arrows hidden for one colleague and disabled at the ends. **Change this client** and **Change colleagues** return to the right step, nothing lost. Twenty requests to one colleague are visible and counted before approval. Nothing is sent before the final button. |
| C04 Outreach races | **Pass (unchanged code)** | Existing CV-02, CV-05, CV-06, CV-07, CV-08, CV-15, CVU-03, SBX-17 | Release B did not touch outreach, scheduling, acceptance or placement, so these are re-run rather than new: double send asks nobody twice, decline moves on with a fresh deadline, a missed deadline moves on and re-running the job changes nothing, a colleague in discussion pauses the sequence, one winner when two accept at once, an ineligible colleague is passed over. **Not run:** a second real device, and a real browser closed mid-sequence (the sequence is a server job; the tests close and reopen the page). |
| C05 Handovers | **Pass (unchanged code)** | Existing CV-09, CV-10, CVU-02 | Handover is the organiser's, needs an agreed colleague and all three confirmations; a plan completes only when every client has an agreed colleague and a ready handover; agreed is not "handover ready". Unchanged in Release B. |
| C06 Calendar and drafts | **Pass** | Auto B-04, B-04b, B-14 (also Phone-sized) | Both directions, Today, today and the selected day drawn differently, plan counts, and on a phone dots with a count instead of cut-off titles. Overlapping plans, a plan across a month boundary, each direction on its own, an empty month, and the agenda for a chosen day opens the exact plan. The day sheet and the month agenda stack the two directions in one column, a direction with nothing in it is a small strip that says so ("None of your plans on these dates."), and a colleague's plan reads from the invited colleague's side (what *they* have been asked, not the organiser's list). On a phone the status pill (for example "Needs your reply") is as wide as its words in both places (B-14 failed before this was fixed). Deleting a draft names it and cannot touch a live plan. Fixtures use date offsets from the day the test runs; no clock was mocked. |

### Referrals (brief 7)

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| R01 Controlled needs and profile entry | **Pass** | Auto B-05, PB-03; Existing V15-03, A1-01, RA-13 | Main need and Also share one searchable list; a referral begun on a profile keeps that colleague; if they are not eligible the screen says why and does not substitute anyone; drafts are kept (several can be open) and restored, including after a failed save; long requirement values stack to full width at phone width (Release A D06, A1-01). **Not tested:** the fallback that keeps and labels a need saved by an older release that is not in the list (it is in the code, with no test of its own). |
| R02 Lifecycle | **Pass (unchanged code)** | Existing RF-05 to RF-11, RFU-02, RFU-03 | Interest needs a capacity confirmation and is not a placement; a colleague can decline, change their mind or ask first; only the referrer can place, once, with someone interested, and the rest close; interest alone never makes "worked with"; withdrawal keeps every reply and conversation; asking another colleague applies the same requirements; a lapsed licence stops every reply but "not available". **Not separately re-checked in Release B:** every-colleague-declines exhaustion on screen. |
| R03 Confirmation | **Pass** | Auto B-06 | The title is "Client referral · " plus the actual need at matching, review, confirmation and tracking; three stages (Request sent, Colleague interest, Placement confirmed); only a stage that really happened is marked; a first send never marks placement and interest alone does not. **Not added:** a separate anonymous reference number (see decisions in `release_notes.md`). |

### Consult and groups (brief 8)

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| Q01 Consult audience | **Pass** | Auto B-07, QB-01, QB-02, QB-03; Existing RA-14, NC-03, NCU-04, NCU-05 | Every audience (trusted, one, a few, network) can be chosen and says who will see the question; picks survive searching; the review names one recipient or all of many with the count; nothing posts before the review button and the confirmation; the draft comes back with its audience and people; a client detail is refused before posting; each question reaches exactly its audience, once. The 1,200-colleague list (bounded rendering, search, picks kept) is Release A's RA-14, re-run here; Release B did not rebuild that fixture. |
| Q02 Discussion and groups | **Partial** | Auto B-08; Existing NC-04, NC-05, NC-06, NCU-06, NCU-10, N01-A, N01-B, FP-10 | Passed: replies stored once and newest first; Useful and Following are private and the author's own; group questions reach only members; ordinary replies and reactions never create "Worked with Before"; Consult now links straight to **Find or start a group**. **Not in Release B:** creating, managing and joining groups, organiser permissions, charters and historical access. That is brief section 11, Release C. Only membership protection (R01-A) and the new link are covered. |

### Network and availability (brief 10)

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| N01 Relationship integrity | **Partial** | Auto B-11, NB-01; Existing FP-08, FP-10, NCU-01, NCU-02 | Each person has a specific, true reason where the data exists, and says so where history was not kept; suggested people say why; **Add to** and **Remove from trusted colleagues** are deliberate and separate from "worked with before"; a Consult reply never makes anyone "worked with"; an invitation makes the inviter trusted by the joiner only. Names in the trusted list open the right profile (NB-01). **Not run:** every person link on every page opening the right profile; all four tiers side by side on one account. |
| N02 Search and visualisation | **Partial** | Phone-sized and Auto NB-01 (1365, 390, 320); Existing NCU-03, RA-14 | The circle never has overlapping or covered targets at three widths; a person who cannot fit is left out of the circle and always reachable in the list beneath (five to a page, with the full count); the fourth and later colleagues are reachable; Search is on every page. **Not run:** every directory filter combination (NCU-03 covers finding, opening a profile and the invite link); a real phone. |
| A01 Freshness | **Pass** | Auto B-12, NB-03; Existing AV-07, RF-05 | Day 29, 30, 90 current; day 91 stale, still findable, left out of "available now". Confirming on screen writes one time and the window, profile and directory agree. A recent confirmation never replaces the referral capacity confirmation (RF-05). Uses database date offsets, not a mocked clock. |
| A02 Capacity | **Partial** | Phone-sized NB-02 (390, 320) | One overall number with separate virtual and in-person settings for each state; long city lists and a pause date fit; no multiplied total and no invented Cover cap; colleagues see the one number. **Not tested:** reconfirming while unsaved edits are open in the same window (it is not a new flow in Release B). |

### Messages and saving (brief 9)

| ID | Result | Evidence | Notes |
| --- | --- | --- | --- |
| M01 Exact contexts | **Partial** | Auto MB-09, MB-10, B-09 | A referral notification opens the referral's own conversation, not the colleague's other one. With one colleague in two contexts (a referral and a direct conversation) the outer row shows the latest message and opens exactly its context, says "2 conversations", labels each context, and opening one leaves the other unread. Search over the **whole** message history opens the exact conversation, loads older messages if needed and highlights the message. **Not run:** two clients in one Cover plan, another Cover plan, or a group as contexts of the same colleague; they use the same labelling code but have no test of their own. |
| M02 Draft and retry | **Pass** | Auto MB-01, MB-02, MB-03, MB-08, MB-11, MB-12, PB-04 | A different text, file and voice draft per conversation survives switching, closing and reloading; sending twice, sending the same message from two devices at once and pressing Retry twice each give one message; composing stays immediate while one is sending (a second message appears in its place at once and leaves in order after the first); two devices on one account each show a message once, in its own conversation. |
| M03 Counts and media | **Partial** | Auto MB-04 to MB-07, MB-10, B-10; Existing RA-11 | Counts: the unread number, labelled as unread messages, is the one navigation number on all shells and separate from notifications and from the conversation count. A first message in a new conversation now counts as unread (real bug found by MB-10; fixed by SQL part 2). Media: real files and voice notes are uploaded, kept, previewed, played, removed, and cleaned up when removed, discarded, cancelled or failed; strangers cannot add, remove or read; a removed message's file is gone; an empty file and one over 20 MB are refused; 19 MB goes through. **Not tested:** uploads of 10 to 20 MB through Cloudflare (the local server only; please try a 15 MB file on the sandbox); a real microphone (a fake one was used); losing and regaining the connection in the middle of an upload; first-message-unread cannot be shown on the sandbox because its colleagues are simulated. |
| P01 Save acknowledgement | **Pass** | Auto PB-01 to PB-04; Existing RA-13 | A failed save never says Saved; the footer says it could not save and offers Try again; the newest text is also kept on this device and put back (and saved) when the workspace opens again; a different version saved from another device wins and the person is told; nothing is written to the device while saving works; one conversation's draft never comes back in another. Tested for Cover, Consult, Referral and message text; availability and file or voice drafts use the same save path but were not each tested. **Not tested:** private-browsing and storage-blocked browsers (the copy is skipped and saving behaves as before), and two people signing in on one computer one after another beyond the per-account key. |

## Historical findings (18 and 19): disposition after Release B

Only items that Release A's ledger assigned to Release B or whose status changed.

| Item | Status | Where / why |
| --- | --- | --- |
| D08 Matching emphasises identity and fit | **Partly** | The shared-context card and fit reasons were improved in A.1 (A1-10). Release B added the Cover workload view and bulk reasons. The secondary profile control was not changed further. |
| D09 Redundant matching framing | **Resolved** | The promotional line "Good colleagues. A clear fit for each client." is gone. With one client there are no client tabs and no By client / By colleague switch (B-13). |
| D12 Task names in headings | **Resolved** | Cover steps are Plan cover, Build your client list, Choose colleagues, Review your cover plan; Referral is Refer a client; the availability window is Your availability; the invitation is Invite a colleague; the question box is Ask a question first. The page buttons are **Plan cover** and **Refer a client**. The tour's focus text follows (B-13). Inside a Cover plan the handover window is **Confirm handover for Client N** (B-15); the retry window is titled **Find cover for Client N** (code change; no test of its own). |
| D13 Singular grammar and useful controls | **Resolved** | Correct singular and plural on the Cover review and Consult review; no enabled no-op arrows (B-03, B-07). |
| D16 Ownership separate from status | **Resolved** | Hub rows in A.1; the Cover calendar's direction filters and key in B (B-04). |
| D17 Quiet saved-draft rows | **Resolved** | Draft rows inside Cover and Referrals name the draft with Continue and Delete (B-04, V15-03). |
| D18 Calendar | **Resolved** | Heading, filters, Today, today and selected day differ, counts, dots on phones, exact agenda route (B-04, B-04b). |
| D19 Calendar small groups | **Resolved** | A direction with nothing in it is a small strip (under 110 px) on the day sheet and the month agenda; the two directions stack in one column and the plan has room to read (B-14). |
| D26 Names and contexts | **Partly** | The message inbox and notifications use the shared context labels. Not every page was checked. |
| D27 Context count versus unread | **Resolved** | "2 conversations" is a labelled control separate from the unread pill (MB-10, B-10). |
| F10 Compact layouts | **Partly** | Cover pop-up steps, referral form, availability and Network were checked at 390 and 320; other pop-ups were not each reviewed. |
| F11 Availability wording | **Resolved** | One confirmation wording and one timestamp everywhere (NB-03, B-12). |
| F12 Preview refresh | **Resolved** | Confirming updates the open window in place (NB-03). |
| F13 Worked with before | **Resolved** | Reasons are specific; interest and replies never create it (B-11, FP-10, RF-08). |
| F14 State settings | **Resolved** | Per-state virtual and in-person, one overall number (NB-02). |
| F15 Search history | **Resolved** | Full-history message search (B-09; SQL 0124 part 1). |
| F16 Invitation copy | **Partly** | The invitation window is now "Invite a colleague" and says nothing is sent from it; the longer copy in the review step was not rewritten. |
| F17 Clickable names | **Partly** | Names in Network lists open the right profile (NB-01). Other places were not each re-checked. |
| F18 Small formatting | **Partly** | The items found in this release (headings, plurals, labels) were fixed; there was no complete list to check against. |
| F20 Workload before sending | **Resolved** | The review section "What each colleague would be asked" (B-03, B-03b). |
| F22 Group management | **Partly** | A direct link to groups (B-08). Management itself is Release C. |

Everything else keeps its Release A status (D01 to D07, D10, D11, D14, D15, D20 to D25, D28 to D31, F01 to F09, F19, F21).

## Known gaps (Release B)

- **Cloudflare:** 10 to 20 MB uploads through the Worker, and the built Worker's size, were not tested. Please try a 15 MB file on the sandbox before going live. If it fails the fix is code only, no SQL.
- **Physical devices:** no real phone, no keyboard-only or screen-reader pass by a person, no real microphone (a fake one was used).
- **First message unread** cannot be shown on the sandbox because its colleagues are simulated; the local two-account test proves it.
- **Group management, charters and historical access** are Release C.
- **Message search speed at real volume** is untested (it reads the live table; an index can be added if it is slow).
- **Mocked clock:** freshness and calendar tests use database date offsets, not a fixed clock.
- **An anonymous reference number** on referrals was not added; the need is in the title.
- **Two real devices:** races across devices were not run on two physical devices.
- **Six `/sandbox/request` tests** need outside access and fail offline in every release (also in versions 14 and 15).

## Regression run

The whole staging suite (860 test runs on desktop and phone-sized browsers) was run once, start to finish, on the **final build** (the one the bundle contains). **828 passed, 26 skipped, 6 failed, 0 did not run.** The 26 skipped are the same ones every release skips (tests that need a real device or a hosted service). The 6 failures, one by one:

| Failure | Cause | Now |
| --- | --- | --- |
| 6 × `RT /sandbox/request` (anonymous, Pell, Avery, Ruben, Sol, Esme) | The page calls a service outside this workspace, which has no outside access (`ERR_TUNNEL_CONNECTION_FAILED`). They fail the same way on Release A, A.1 and version 15. | Not a product fault; not re-run here. Please open `/sandbox/request` on the sandbox. |

No other test failed, and nothing was flaky in this run (the known occasional V15-04 timing flake did not occur).

**What earlier full runs found during this release, and what happened to it.** Earlier runs on earlier builds of this branch found these, all fixed before the final run: the message-history test and the Cover tour-scene setup assumed colleagues were pre-selected (the product no longer does that; test setups now choose colleagues themselves: TOUR-01 ×2, RA-10); a message-notification test picked the wrong notification row (MB-09, made deterministic and run six times in a row); the phone calendar was still drawing cut-off titles because of a style-rule clash (B-04 could not fail and now can); the status pill overflowed on a phone (B-14, failed before the fix); one real product bug, the first message in a new conversation not counting as unread (MB-10, fixed by SQL part 2 in `0124`).

**Also run on the final build, before the full run:** the Cover-related set (release-b, empty-state, cover-ui, tour-scenes, release-a): 47 passed and 1 failed, the failure being a wrong selector inside the new B-15 test itself (not the product); after fixing the test, B-14 and B-15 passed again, and both passed again in the full run.

**After the final build:** nothing was changed in product code. Only documents were added.

## Not tested here

A real phone; the Cloudflare build, the Worker size and a 10 to 20 MB upload through the Worker; a real microphone; screen readers and keyboard-only use by a person; the six `/sandbox/request` pages (outside access); real email (not part of Release B).

## Rollback

Cloudflare: previous deployment (about a minute). The SQL needs no rollback after a site rollback; see `migration_and_rollback.md`.
