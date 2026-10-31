# PsyAlliance 1.0: acceptance ledger

Build: branch `v1` on top of Release C, local staging copy (fictional members, local database, mock push service, mock text sender). Desktop 1365 and 1440 wide, and phone 390 and 320 wide in a phone-sized browser. **No real phone, real push, real email, screen reader or participant was used.** New tests are in `e2e/tests/staging/v13/release-v1.spec.ts` (V1-01 to V1-08) and `release-c.spec.ts` (C-06b, alerts). Existing tests changed by agreed decisions are listed at the end.

## External review (31 October), finding by finding

| ID | Finding | Status | Evidence |
|---|---|---|---|
| F01 | Push not bound to its event | **Fixed.** The device asks for the alerts sent to it (by endpoint); each has its own wording, link and notification tag; "latest alert" was removed. | C-06b (two events, each opens its own context; another account's endpoint returns nothing), C-08 |
| F02 | Claims had no lease | **Fixed.** A claim token and a 2-minute lease; a stale token is refused; an expired lease is picked up again. | C-06b (a second claim gets nothing; a stale token is refused) |
| F03 | Per-device state and final checks | **Fixed.** One attempt per device; only failed devices are retried; consent, read state and quiet hours are checked at claim time. | C-06b (only the failed device is retried; opt-out after queueing is suppressed), C-05 |
| F04 | Push endpoint server-fetch surface | **Fixed.** HTTPS only, known push-service hosts, no user info, no odd ports, no redirects, keys of the right shape; a local mock only with PUSH_TEST_LOCAL=1. | C-08 (six bad endpoints and bad keys refused) |
| F05 | Matching ignored per-service pauses | **Fixed.** `workspace_people` returns each colleague's participation; matching, bulk selection (with the reason) and Consult audiences respect it; the server still checks on send. | Release B/C matching suites; SQL applied twice |
| F06 | Wrong "existing choices" sentinel | **Fixed.** Any saved participation row wins by default. | P-11 |
| F07 | Specific guide CTA skipped saving | **Fixed.** One task-specific button that saves the choices; Start fresh clears them. | C-11, C-12, V1-03 |
| F08 | Reset and preview lost the exercise | **Fixed.** Exercise state is held by the guide; Reset clears it; preview and back keep it. | C-10 |
| F09 | Anonymous callers could write "real" events; a demo click counted as completion | **Fixed.** "real" needs a signed-in member; a new `demo_started` event. | P-05 |
| F10 | Privacy wording vs telemetry | **Fixed.** The copy says the chosen need is counted anonymously. | Visual check |
| F11 | Cover first-wave count included unmatched clients | **Fixed.** Counts only clients with a colleague selected, plus the exact number queued; review rows fold when there are many. | B-03, B-03b, A1 Cover test |
| F12 | Opaque save failure | **Fixed.** Status comes from every unsaved key; signed out says so, with a sign-in link. | Release B persistence suites |
| F13 | Next and sharp advisory | **Fixed.** next 15.5.28; sharp 0.35.5 via an override (the wrangler/miniflare copy too). | `npm ls sharp` |
| F14 | Disabled alerts unexplained | **Fixed by hiding.** The setting is hidden unless `PHONE_ALERTS=on`. | C-07 runs with it on |
| F15 | Collaboration totals disagreed | **Fixed.** One count from one collection; the older server count only adds "earlier collaborations without details". | Network suites |
| F16 | Directory payload at scale | **Deferred** (agreed). | n/a |
| F17 | Shell and copy pass | **Fixed** for the items named: US spelling in member-facing copy and group errors, linked group author names, a single search, no duplicate intro blocks on the Hub. | V15-08, A1-05 |
| F18 | Database advisor triage | **Deferred** (agreed). | n/a |
| F19 | Continuity "saved as you go" lost edits | **Fixed.** Unsaved changes are kept on the device and put back; leaving asks first; the copy is honest. | Manual sequence; continuity suites |
| (extra) | "Closing or reducing practice" implied permanent placement | **Fixed.** Says it is temporary cover and that a permanent move is a referral. | Visual check |

## 1.0 design and features

| Item | Status | Evidence |
|---|---|---|
| One design system (fonts and tokens) across workspace, account, public, demos and sandbox | **Done** | Screenshots of every main page at 1440 and 390 |
| Homepage rebuilt (story, problem, stages, Library, Rena's story, trust, FAQ, founding offer) | **Done** | V1-01, C-01 |
| Trial two-panel layout; phone shows the result first | **Done** | V1-02, C-09 to C-12 |
| Sign-up with goal carry-over; form first | **Done** | V1-03, C-16 |
| Waiting members get the Hub with a checklist; old Home retired | **Done** | AV-09, ACC-07 |
| Hub: visible greeting, one search | **Done** | V15-08, A1-05 |
| Edit profile: section menu, one section at a time, leave warning | **Done** | V1-04, J-PROFILE-01 |
| Quick start: Psychology Today link or text, cleaning, model fallback, plain failure reasons | **Done** (AI path not testable here without a key) | V1-05, R17-06 |
| Network in three columns | **Done** | A1-08 |
| @mentions in Messages, Consult replies and group discussions | **Done** (in-app notification) | V1-06, V1-07, V1-08 |

## Tests changed by decisions (not regressions)

A1-05 (search now in the top bar only), A1-08 (Network in columns), V15-08 (visible greeting), AV-09 and ACC-07 (waiting members get the Hub), C-01 (new stages heading), B-03, B-03b and the A.1 Cover test (exact first-wave wording), C-08 (valid push keys; endpoint list), C-01 (US spelling "license").
