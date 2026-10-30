# Release C acceptance ledger

Build: branch `release-c`, local staging copy (fictional members, local database, mock push service, mock text sender). Desktop 1365 and phone 390/320 widths in a phone-sized browser with touch. **No real phone, real push, real text, real email, screen reader or participant was used.** Test ids are in `e2e/tests/staging/v13/release-c.spec.ts` (C-01 to C-18).

## Regression

Full suite on the first Release C build: 875 tests, **840 passed, 26 skipped, 9 failed**. Of the nine: six are the known `/sandbox/request` route tests (they need outside access; unchanged since Release A); two (J-LIB-01, R18-12) asserted the old Library wording and were updated to the new, agreed wording; one (ADM-UI-03, opening a state) failed once and passed on rerun, with the Library edits unrelated to it. After the wording change the Release C file plus the affected suites were re-run on the final build: **55 passed**. The phone project: 2 passed. So the standing result is **all passing except the six known `/sandbox/request` tests**.

## Scenarios

| Scenario | Result | Evidence and limits |
|---|---|---|
| L01 Public promise | **Pass (automated, viewport)** | C-01: band placement, copy, links, 1365/390/320 no sideways scroll, no retired/trainee/guarantee wording, absent from the signed-in Hub. Eligibility sentence present. |
| L02 Optional setup | **Pass** | C-02: several choices, Skip, edit, prefer-not-to-say stands alone, row unreadable by other members. Existing members keep their notification choices (the new table is separate). Not inferred from activity (nothing writes it). |
| L03 Independent participation | **Pass** | C-03, C-04, C-18: separate pauses, closed services, Cover/Consult open with referrals closed, no effect on availability or other services. An "employed member" fixture was not separately created (the controls do not depend on practice status). |
| L04 First value | **Partly** | Existing Cover/Referral/Consult entries and preliminary-match behaviour from earlier releases re-ran green; the guide adds prepared unsent starts (C-11). No new matching logic. |
| L05 Away state | **Pass** | C-03: existing plan stays open; ended pause asks for review and does not reopen; availability timestamp unchanged. |
| L06 Return and reuse | **Pass (copy); partly (drafts)** | C-14 copy of a plan; per-context drafts are Release B's tests (B-series). Referral copy is built with the same code but has no dedicated test. |
| L07 Notification destination | **Partly** | C-13 deep link survives sign-in. Alerts navigate only (no state-changing route exists for them). Wrong-account, closed-context and real scanner cases not exercised. |
| L08 Delivery and follow-through | **Pass against mocks** | C-05, C-06, C-07: generic wording, read suppression, quiet hours, opt-out, failed/gone device handling, no duplicate, consent, mock text. Cover deadlines with the browser closed are Release A/B scheduler tests (CV-series), unchanged. |
| L09 Scoped credentials | **Not tested / no change** | No new scoped role was built. |
| L10 Human validation | **Not done** | No participants. |
| L11 Tailored public route | **Pass (automated)** | C-09 all five needs plus explore, optional step with Skip, change, no email field, demo links, three widths. Demo playback timings are the existing demo suites. |
| L12 Demo to account handoff | **Pass (main paths)** | C-11, C-12: structured cookie only, expiry, clear, Start fresh, unsent draft, used once. Different device is by design a normal start (cookie is per browser). Pending-verification and denied-access states were not separately exercised. |
| L13 Personalised introduction | **Pass** | C-09 exact headline and benefit per need. |
| L14 Hands-on interaction and recipient preview | **Pass (mouse/keyboard-capable controls)** | C-10. Screen-reader and touch passes not done. |
| L15 Offer support | **Pass** | C-12. |
| L16 Starting summary and trust copy | **Pass** | C-10/C-11 summary without email; founder and verification links present. |
| L17 Prefill provenance | **Not built (safe by omission)** | Nothing from the guide fills a profile field, so a fictional scenario can never reach the profile. Prefill of real signup answers is not built. |
| L18 Existing profile and handoff recovery | **Partly** | Expired/missing handoff is an ordinary start (C-11). No profile suggestions exist to conflict. |
| L19 Tailored practice sandbox | **Partly** | The guide's "Try this scenario" opens the existing fictional demo screens, labelled "Fictional practice environment" with Reset scenario and Change scenario. No separate per-scenario seeded sandbox. |
| Q02 Groups | **Pass** | C-15: versioned charter with history, organiser/member permissions, creator-only appointment, removal, loss of access. |
| P02 Library and account | **Partly** | Public promise fixed (C-16); phone Collection selector; named completion measures; continuity compaction. One merged catalogue not done. |
| P05 Demos | **Partly** | Inventory below; frame labels updated; existing demo suites green. Per-demo content refresh for lifecycle not done. |

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
| D23 Retained pages | **Partly** (completion measures, continuity compaction). |
| D24 Completion denominators | **Resolved** (two named measures). |
| D25 First continuity step | **Resolved on phones** (step list hidden, tighter card). |
| D28 Phone sign-up | **Resolved** (C-16). |
| D29 Brand assets | **Resolved** (public header and footer use the shared logo file). |
| D30, F21 Demos | **Partly** (frame labels, Reset/Change scenario; no new scripts). |
| D31 | Unchanged from Release A (partly). |
| F07 Two catalogues | **Open**. |
| F17 Names | **Partly**: group member names open profiles (existing); other pages not re-audited. |
| F22 Group management | **Resolved** (organisers, history, link from Consult from Release B). |

## Demo inventory (P05)

Watch/try routes `/tour/<key>` for: cover, refer, consult, circle, verified, library, profile, overview (journeys); scripted players `/tour/<key>` for cover, refer, consult, circle, hub, messages, library, availability, overview; `/tour/example/<script>`; legacy slugs map to these; scene pages `/tour/scene/<demo>/<slug>`; the new `/start` route maps needs to cover, refer, consult, verified, overview.

## Not tested

Real devices and browsers' push; real SMS; the scheduler; email scanners; screen readers; participants; physician/pending/suspended role fixtures beyond existing suites; analytics beyond the event table.
