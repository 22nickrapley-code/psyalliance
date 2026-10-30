# Release A: acceptance ledger

Written 29 Oct 2026 for Nick. Build: branch `release-a` at commit `@@COMMIT@@`, built for production and run on the **local staging copy** (fictional people only; no live or sandbox data was changed). Nothing was deployed.

**How to read the results.** Pass means the check was run and met the expected result. Partial means part of the scenario is in Release A and passed, and the rest is named. Fail means it was run and did not pass. Blocked means it could not be run from here. "Not in A" means the scenario belongs to Release B or C (or, for a few, to work version 14 and 15 already did and Release A did not touch); the regression run still exercises the existing behaviour and is quoted at the end.

**Kinds of evidence.** *Auto* = automated browser test against the real local database. *Phone-sized* = Auto in a 390 or 320 px browser with touch (not a physical phone). *Source* = read in the code or the database, not run. *Physical* = a real device (none this time).

**Roles.** The staging copy has the member accounts Avery, Bram (Fenn), Cass (Dara) and others, plus a pending member, an organiser and an admin. Release A only needed ordinary members.

## Scenarios

### Hub, navigation, visuals (14.1)

| ID | Result | What was run | Notes |
| --- | --- | --- | --- |
| H01 Three simple creation cards only | **Pass** | Auto RA-01, RA-02; Phone-sized RA-09 (390 and 320). | One row on desktop, stacked on phone; names and labels exactly as in the brief; each card is one button and opens its pop-up; no counters, no halves, no hero, no fourth tile, no duplicate panels; Search is in the top bar; Library, Network / Search and Availability are in the menu. Card order is Referrals, Cover, Consult (see release notes, "Decisions"). |
| H02 Complete actions | **Partial** | Auto RA-03, RA-04, RA-05. | Passed: four distinct rows across three services, two in one plan; the headline equals the rows and the subtotals reconcile; no row is picked for you; Later lowers the count and keeps the request open (checked in the database); Restore reverses it; it is on the server and survives reload; a new response on a referral brings its set-aside row back. Not run: five rows with an informational reply in the same fixture (replies are not counted by construction and RA-11 shows they stay out of the unread/bell numbers, but a combined fixture was not built); resurfacing for an expired deadline and for a Cover status change rely on the same signature mechanism but have no test of their own. |
| H03 State coverage | **Partial** | Auto RA-03, RA-05, RA-06, RA-08. | Passed: many (4), one, zero ("You're up to date") with a set-aside list still reachable; creation cards unchanged in each case; Invite a colleague reachable. Failed load: Auto RA-16 forces the database to answer 503; the page shows "We could not load your workspace." with Try again, never "You're up to date", and recovers when the fault is cleared (before this release the generic framework error page appeared). The Hub also has its own "We could not check what needs your attention" message with Try again; it only shows if the page arrives without its plan or referral lists, which the server does not do today, so it is a guard that was **not exercised**. There is no separate loading state because the Hub's data arrives with the page. Not run: very long names and titles on the Hub. |
| H04 Shared shell | **Partial** | Phone-sized RA-09, RA-12; Auto RA-14 (900 px); the phone crawl at 390 and 320 over every page. | Passed: both shells show the same five items in the same order at 320 and 390, fully inside the screen, 44 px high, labels 11 px; Search is a named button on every page; selected state follows the page; actual target bounds were measured, not only page width. Not run: bounds at 768 and 1,024 px (900 px was checked for names only). |
| H05 Visual consistency | **Partial** | Auto contrast crawl; phone crawl; RA tests. | See "Colour contrast" below. Not run: text scaling, hover/pressed/disabled/loading for every control, font fallback check. |

### Cover and Referrals (14.2)

| ID | Result | Notes |
| --- | --- | --- |
| C01 Twenty clients | Not in A | Unchanged from version 15; the existing twenty-client regression test is in the run below. |
| C02 Mixed bulk eligibility | **Partial** | Release A did the licensing-route part: RA-15 compares the screen's rule with the database function across seven cases (Auto, real database). Bulk views and per-client exclusion wording are Release B. |
| C03 Workload and review | Not in A | Release B. |
| C04 Outreach races | Not in A | No change to outreach, scheduling, acceptance or placement. Server guards untouched. |
| C05 Handovers | Not in A | The Hub row "Confirm the handover for Client N" opens the plan; the checklist itself is unchanged. |
| C06 Calendar and drafts | Not in A | Release B. |
| R01 Controlled needs and profile entry | Not in A | Release B. |
| R02 Lifecycle | Not in A | Unchanged. |
| R03 Confirmation | Not in A | Release B. |

### Consult, network, availability (14.3)

| ID | Result | Notes |
| --- | --- | --- |
| Q01 Consult audience | **Partial** | Auto RA-14: 1,200 fictional colleagues, 40 shown at first, search finds anyone, picks stay visible while searching, every radio has a name, "View profile" is a separate control, tablet collapsed menu has names. Not re-run in A: each audience type, one-versus-many review grammar, draft restoration (existing tests cover the old behaviour; see below). |
| Q02 Discussion and groups | Not in A | Release B. |
| N01 Relationship integrity | Not in A | Release B. |
| N02 Search and visualisation | **Partial** | Search is one tap from every page with named scopes (Auto RA-10). Phone network graph and list: Release B. |
| A01 Freshness | Not in A | Release B. The Hub reminder reads the same timestamp as before (RA-08 confirms the one-tap confirmation updates it). |
| A02 Capacity | Not in A | Release B. D07 (pause date and spaces fields on a phone) is done; see D-list. |

### Messages, persistence, supporting (14.4)

| ID | Result | Notes |
| --- | --- | --- |
| M01 Exact contexts | Not in A | Release B. The Messages search scope is now labelled as latest-message only. |
| M02 Draft and retry | Not in A | Release B. |
| M03 Counts and media | **Partial** | Auto RA-11: several unread messages in more than one conversation; workspace menu, account menu and phone bar show the same number; reading one conversation lowers the number by exactly that conversation's unread messages (5 to 3). Notifications and company notices are kept out of the number in the code (they are on the bell); there is no separate assertion for that. Media, attachments and recording: Release B. |
| P01 Save acknowledgement | **Partial** | Auto RA-13 (Cover plan draft): "Saving", "Saved", then with the network off a plain failure with Try again; typing again while offline keeps only the newest text; reconnecting and pressing Try again stores the newest text and leaves no older copy. The same code serves Referral and Consult drafts; they were not each tested. Leaving the page with unsaved text shows the browser's warning (not automated). |
| P02 Library and account | Not in A | Release C. The five-item account bar, Search and shared palette are in (RA-12). |
| P03 Device and accessibility | **Blocked** (physical and human parts) / Partial | No physical iPhone/Safari or Android/Chrome, no keyboard-open check, no screen reader. Done: reduced-height and 320 px layouts in a phone-sized browser, names on controls (RA-14), Escape closes the Search window (RA-10); focus return was not separately measured. |
| P04 Roles and backend | **Partial** | Release A added one read-only function (checked against the real local database for correct counts per member). No change to roles, transactions or scheduling. Deployed migration/commit to be recorded after you run the steps. |
| P05 Demos | **Partial** | The Hub demo script and tour text were rewritten for the three cards and the one list. The beat-by-beat check (each scripted step finds its control) is in the regression run below; the full playback of every demo at 390 px for the rest of the brief is Release C. |

### Lifecycle (22)

L01–L19: **Not in A.** The brief's section 21 (public lifecycle band, tailored demo, handoff, pause controls) is outside Release A. Nothing in Release A claims any of it.

## Historical findings (18 and 19): disposition after Release A

*Resolved* = fixed and tested. *Partly* = part done, rest named. *Open* = still open for B or C. *Superseded* = replaced by the brief's own decision.

| Item | Status | Where / why |
| --- | --- | --- |
| D01 One shared visual system | **Partly** | The palette, top bar, navigation, search, phone text floor and control sizes are now shared by the workspace and account pages (same stylesheets, loaded last). The account pages' desktop body text is still 13 px (brief: 14-15) and the stylesheet pile is not consolidated (one stylesheet removed, one added). Release C. |
| D02 Readable primary phone actions | **Resolved** | Three cards, 14 px+ action text, 44 px+ targets (RA-09). |
| D03 Navigation legibility and reach | **Resolved** | 11 px labels (the brief's allowed exception), five items fully inside 320 px on both shells (RA-09, RA-12). |
| D04 Placeholder contrast | **Resolved** | Placeholder colour is now `#5f6e64` (5.4:1 on white; it was 3.03:1); labels are persistent. See contrast results. |
| D05 Consistent phone input sizing | **Resolved for the workspace and account pages checked** | Text boxes 16 px on phones across the pages and pop-ups in the crawl. Public signup was not touched (Release C). |
| D06 Long requirements readable | **Resolved** | Long selects (setting, insurer, state, need) are full width on phones. |
| D07 Availability pause date space | **Resolved** | Spaces and pause date stack at phone width. |
| D08 Matching emphasises identity and fit | Open | Release B. |
| D09 Redundant matching framing | Open | Release B. |
| D10 Bound the Consult recipient picker | **Resolved** | 40 at a time, search, picks kept, 1,200 tested (RA-14). |
| D11 Explicit control names | **Resolved** | Menu buttons, profile button, radios (RA-14). |
| D12 Task names in headings | Open | Release B. The three cards use the brief's exact names. |
| D13 Singular grammar and useful controls | **Partly** | Hub headline and group notes use correct singular/plural; the review screens are Release B. |
| D14 Compact phone profile identity | Open | Release C. |
| D15 Reduce competing colour areas | **Resolved** | No saturated fills, no dark availability panel (see D15/F09). |
| D16 Ownership separate from status | **Partly** | Hub rows say who and what in text, with no red/green; plan and referral list colours are Release B. |
| D17 Quiet saved-draft rows | **Resolved on the Hub; open in services** | No draft strips on the Hub. Draft management inside Cover and Referrals is Release B. |
| D18, D19 Calendar | Open | Release B. |
| D20 Library filters and actions | Open | Release C. |
| D21 Public resource promise | Open | Release C (the review gate was not touched). |
| D22 Tablet behaviour | **Partly** | The tablet icon rail has names (RA-14); the sandbox notice wrap at 900 px was not rechecked. |
| D23 Retained practice pages | **Partly** | They now share the palette, five-item bar, named Search and bell. Their content layouts and duplicate search affordances are Release C. |
| D24 Completion denominators | Open | Release C. |
| D25 First continuity step | Open | Release C. |
| D26 Names and contexts | **Partly** | Messages, Notifications and Referrals naming in the nav; context formatters are Release B. |
| D27 Context count versus unread | Open | Release B. |
| D28 Phone signup forward | Open | Release C. |
| D29 Exact brand assets | Open | Release C. |
| D30 Consistent demos | **Partly** | Hub demo and tour text updated; the rest is Release C. |
| D31 Feedback away from fixed actions | **Partly** | The new save note sits in the page, not floating over the footer; toasts were not rechecked against every pop-up footer. |
| F01 Unread counts | **Resolved** | One definition, migration 0123, RA-11. |
| F02 Autosave failure | **Resolved** | RA-13. |
| F03 PSYPACT parity | **Resolved on screen** | RA-15 against the database function; database checks untouched. |
| F04 Names for controls | **Resolved** | RA-14. |
| F05 Account More clipped | **Resolved** | RA-12 at 320. |
| F06 Two shells | **Partly** | Same bar, Search, bell, palette, counters. Page content styles remain different (Release C). |
| F07 Two Library catalogs | Open | Release C. |
| F08 Single complete action entry | **Resolved** | The one list; the four-shortcut layout is superseded. |
| F09 Large colour fills | **Resolved** | `bold.css` removed. |
| F10 Compact layouts | **Partly** | Pop-up inset was already in place; form stacking done; per-pop-up review is Release B. |
| F11-F14 | Open | Release B (availability wording, preview refresh, worked-with, state settings). |
| F15 Search history | **Partly** | The search window now names its scopes and says Message results cover a conversation's name and latest message only; full-history search is Release B. |
| F16 Invitation copy | Open | Release B. |
| F17 Clickable names | Open | Release B. |
| F18 Small formatting | Open | Release B. |
| F19 Public promise | Open | Release C. |
| F20 Workload before sending | Open | Release B. |
| F21 Demos aligned | **Partly** | Hub demo; others Release C. |
| F22 Group management | Open | Release B. |

## Colour contrast

@@CONTRAST@@

## Known gaps (Release A)

- **Phone target sizes that remain below 44 px by design or by cost:** names written inside sentences (inline person links), the nodes of the network diagram, avatar initials, and the 11 px bottom-bar labels (the brief allows 11 px there). The crawl at 320 and 390 over every page and pop-up went from about 2,500 undersized text or target items to about 265; the remainder is these categories.
- **The Hub's own "could not check" message** (a second guard behind the workspace error page, see H03) is not exercised by an automatic test.
- **Account pages**: no Consult dot; the Cover and Referral counters in the account menu are gone (the Hub count replaces them); the old company-notice count moved to the bell.
- **Search** covers what is already loaded on screen, not older messages.
- **Not done in Release A, by plan:** everything in Release B (service workflows) and C (public pages, Library, lifecycle, demos beyond the Hub).
- **Cannot be shown from here:** a physical phone, a screen reader, the Cloudflare build and Worker size, real email delivery (you are setting up the provider before Release B), which version is live.

## Regression run

@@REGRESSION@@
