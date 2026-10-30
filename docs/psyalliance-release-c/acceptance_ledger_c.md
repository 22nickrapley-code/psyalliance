# Release C acceptance ledger

Build: branch `release-c`, local staging copy (fictional members, local database, mock push service, mock text sender). Desktop 1365 and phone 390/320 widths in a phone-sized browser with touch. **No real phone, real push, real text, real email, screen reader or participant was used.** Test ids are in `e2e/tests/staging/v13/release-c.spec.ts` (C-01 to C-18) and `release-c2.spec.ts` (P-01 to P-16, Part 2).

## Regression

**Full run on the final Part 2 build (rc6): 908 tests selected (staging, phone, public, public-phone), 861 passed, 26 skipped, 9 failed, 12 did not run.** The nine failures: six are the known `/sandbox/request` route tests (they need outside access; unchanged since Release A). Three were mine and are fixed: R18-11 and RA-12 still pointed at the old Documents page (it now redirects to the Library, so the tests now check the Library and My files), and C-09 expected the old demo link for each need (they now open the six new walkthroughs). The 12 that did not run were later tests in the Release C file, which runs in order and stopped at C-09. After the three fixes those three tests plus all 18 Release C tests were re-run: **20 passed**. P-11 had a test-timing fix and passed on rerun. Standing result: **everything passes except the six known `/sandbox/request` tests**. The 26 skips are the same preview-build and state-dependent skips as before (for example the Library preview tests need a build with the preview setting).

## Scenarios

| Scenario | Result | Evidence and limits |
|---|---|---|
| L01 Public promise | **Pass (automated, viewport)** | C-01: band placement, copy, links, 1365/390/320 no sideways scroll, no retired/trainee/guarantee wording, absent from the signed-in Hub. Eligibility sentence present. |
| L02 Optional setup | **Pass** | C-02: several choices, Skip, edit, prefer-not-to-say stands alone, row unreadable by other members. Existing members keep their notification choices (the new table is separate). Not inferred from activity (nothing writes it). |
| L03 Independent participation | **Pass** | C-03, C-04, C-18: separate pauses, closed services, Cover/Consult open with referrals closed, no effect on availability or other services. An "employed member" fixture was not separately created (the controls do not depend on practice status). |
| L04 First value | **Pass (what can be tested here)** | P-16 (Cover and Referral starts open empty and send nothing, no fabricated "worked with"), plus earlier Cover/Referral/Consult entry suites, preliminary-match and zero-match tests. |
| L05 Away state | **Pass** | C-03: existing plan stays open; ended pause asks for review and does not reopen; availability timestamp unchanged. |
| L06 Return and reuse | **Pass** | C-14 (Cover copy), P-13 (referral copy: new draft, original untouched, nothing sent). |
| L07 Notification destination | **Pass (automated)** | C-13 (deep link survives sign-in), P-14 (another account sees nothing of the plan, a scanner GET is redirected to sign-in twice with no state change, a withdrawn plan opens with nothing to answer). Real mail scanners were not used. |
| L08 Delivery and follow-through | **Pass against mocks** | C-05, C-06, C-07: generic wording, read suppression, quiet hours, opt-out, failed/gone device handling, no duplicate, consent, mock text. Cover deadlines with the browser closed are Release A/B scheduler tests (CV-series), unchanged. |
| L09 Scoped credentials | **Not tested / no change** | No new scoped role was built. |
| L10 Human validation | **Not done** | No participants. |
| L11 Tailored public route | **Pass (automated)** | C-09 all five needs plus explore, optional step with Skip, change, no email field, demo links, three widths. Demo playback timings are the existing demo suites. |
| L12 Demo to account handoff | **Pass (main paths + states)** | C-11, C-12, P-15 (a pending and a suspended account arriving with a saved choice: no error, no plan, no referral). A different device is by design a normal start. |
| L13 Personalised introduction | **Pass** | C-09 exact headline and benefit per need. |
| L14 Hands-on interaction and recipient preview | **Pass (mouse/keyboard-capable controls)** | C-10. Screen-reader and touch passes not done. |
| L15 Offer support | **Pass** | C-12. |
| L16 Starting summary and trust copy | **Pass** | C-10/C-11 summary without email; founder and verification links present. |
| L17 Prefill provenance | **Pass** | P-10: each suggestion shows its source, can be discarded, and nothing is saved until Save my choices. Only structured guide choices (context and kinds of request) are suggested; fictional scenario data never reaches an account. Name comes from sign-up itself, not from the guide. |
| L18 Existing profile and handoff recovery | **Pass** | P-11: an account that already has settings keeps them; the conflict is shown and nothing changes unless the member changes it. Expired or missing handoff is an ordinary start (C-11). |
| L19 Tailored practice sandbox | **Pass (browser scenarios)** | P-01 to P-06: six scenarios, label, Reset, Change, signup route, scenario differences (caseload 0 places, reducing 1), no database writes from practice, practice analytics namespace. Scenario data lives in the browser, not in stored sandbox accounts. |
| Q02 Groups | **Pass** | C-15: versioned charter with history, organiser/member permissions, creator-only appointment, removal, loss of access. |
| P02 Library and account | **Pass for the Library (one catalogue place)**; account pages **partly** | P-07 to P-09: old addresses redirect, My files and the review gate remain, bookmark and private copy are separate. Retained-page layout (D23) is improved but not fully unified. |
| P05 Demos | **Pass (automated)** | Six new walkthroughs and their scenario scenes (TOUR-01 runs every scene on desktop and 390), wording refresh of the existing demos, demo suites green. No demo was shown to participants. |

## Failures table

| Test | Status |
|---|---|
| 6 x RT /sandbox/request | Known, unchanged: needs outside access. |
| J-LIB-01, R18-12 | Updated to the new Library wording (the brief overrides the 18 October rule only to the extent of "Coming soon"; no review wording appears). |
| ADM-UI-03 | Intermittent; passed on rerun. |

## D and F items

| Item | Disposition |
|---|---|
| D20 Library filters | **Resolved on phones** (Collection selector, full-width search). Not tested by a dedicated spec. |
| D21, F19 Public promise | **Resolved** (C-16). |
| D23 Retained pages | **Partly** (completion measures, continuity compaction, Notifications title, Library canonical). Different shell conventions remain on a few account pages. |
| D24 Completion denominators | **Resolved** (two named measures). |
| D25 First continuity step | **Resolved on phones** (step list hidden, tighter card). |
| D28 Phone sign-up | **Resolved** (C-16). |
| D29 Brand assets | **Resolved** (public header and footer use the shared logo file). |
| D30, F21 Demos | **Resolved in automated terms** (six new walkthroughs, refreshed wording, labels, Reset/Change). |
| D31 | Unchanged from Release A (partly). |
| F07 Two catalogues | **Resolved** for one Library, redirects and links (P-07, P-08). |
| F17 Names | **Partly**: group member and Network names open profiles; a full audit of every retained page was not done. |
| F22 Group management | **Resolved** (organisers, history, link from Consult from Release B). |

## Demo inventory (P05)

Watch/try routes `/tour/<key>` for: cover, refer, consult, circle, verified, library, profile, overview, and the six need walkthroughs caseload, time-away, client-referral, perspective, reducing, offer-support (journeys); scripted players `/tour/<key>` for cover, refer, consult, circle, hub, messages, library, availability, overview; `/tour/example/<script>`; legacy slugs map to these; scene pages `/tour/scene/<demo>/<slug>`; the `/start` route maps each need to its own walkthrough (Just explore goes to `/tour`).

## Not tested (what only you or real devices can check)

- A real phone: web push on iPhone/Android, real text messages, quiet hours on a real clock, the alert opening the right page from a locked phone.
- The scheduler for alerts and cover deadlines (set up on the Worker; not exercised here).
- Real email scanners opening links.
- Screen readers, a person using the keyboard only, touch on a physical device, and the timing of each demo by eye on a phone (every scene opens on desktop and 390 wide, and the player is driven by the tests, but nobody watched them).
- Participants (L10): no first-use or return-use sessions with intended users.
- The Cloudflare Worker build and size, and uploading large files through it.
- The six `/sandbox/request` route tests (need outside access).
- Scenario-specific accounts stored in the sandbox database (not built; see the release notes).
- Role fixtures beyond the existing suites (prelicensed, retired); L09 unchanged.
