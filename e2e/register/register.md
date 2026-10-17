# Acceptance register

Generated 2026-10-17 01:47 UTC from: final2-staging, final2-phone, final2-routes.
88 route definitions (79 pages, 9 handlers). 595 test results.

Items by status: Pass 124, Open: intermittent 1, Code reviewed 1, Nick to confirm 3, Not run on staging 2, See load report 1, See restore report 1, Not run 1, Fail 1, Covered by journeys 9.

| ID | Area | Item | Status | Tests | Notes |
|---|---|---|---|---|---|
| RUN-01 | Test runner | Independent runner: sign in, journey, account switch, refresh, new session, evidence | Pass | 2/2 passed |  |
| N16-02 | Cover and Refer | One winner: a client is covered once; a referral has one chosen colleague (sequential, concurrent, duplicate, direct writes, stale accept after cancel) | Pass | 9/9 passed |  |
| N16-03 | Notifications | A message creates the recipient's in-app and held email deliveries, written whole | Pass | 2/2 passed |  |
| N16-04 | Notifications | Unread message email reaches the inbox through the provider; a read one is suppressed | Pass | 1/1 passed |  |
| N16-01 | Settings | Digest every two weeks saves and survives a reload | Pass | 1/1 passed |  |
| N01 | Consult | The author can mark a reply useful; it saves; the replier can't change it | Pass | 3/3 passed |  |
| N02 | Refer | Back from the referral review keeps the chosen colleagues | Pass | 1/1 passed |  |
| N03 | Onboarding | A pending member's Home points to the in-product demos | Pass | 1/1 passed |  |
| AUTH-01 | Sign-in | A reset request the mail service refuses or rate-limits is reported honestly; unknown and known addresses get the same answer | Pass | 3/3 passed |  |
| AUTH-02 | Sign-in | Signing up again with a registered email sends the owner an email (without saying the address is registered); a new sign-up's confirmation works | Pass | 2/2 passed |  |
| AUTH-03 | Sign-in | Password reset from the email, sign-in with the new password, link can't be reused | Pass | 1/1 passed |  |
| AUTH-04 | Sign-in | Sign out ends the session | Pass | 1/1 passed |  |
| DEMO-01 | Demos | Escape closes a demo even with focus inside it; focus returns to Watch | Pass | 1/1 passed |  |
| DEMO-02 | Demos | The sandbox the Demos page points to can be opened | Pass | 1/1 passed |  |
| NAV-01 | Whole app | A page change or save that arrives but never shows is completed (watchdog) | Pass | 4/4 passed | Diagnostic probe: tests/diagnostics/nav01-stall-probe.spec.ts. Baseline stalls about 1 in 5 sends; candidate 24/24 delivered. |
| ERR-01 | Whole app | A save the database refuses shows a plain sentence, keeps what was typed, never the database's wording | Pass | 2/2 passed |  |
| EMAIL-01 | Notifications | Temporary email provider failures are retried (three more tries); refusals fail at once | Pass | 3/3 passed |  |
| HYD-01 | Whole app | Pages draw the same on the server and in the browser (no hydration errors) | Open: intermittent |  | React #418 seen on 3 of 474 page loads in the route sweep (Consult new, Availability, Demos), not reproduced in 15 targeted reloads. Recoverable: React redraws the page. Needs a development build to see the differing text. |
| R01 | Consult groups | A group membership can't be moved or promoted by the member | Pass | 1/1 passed |  |
| R02 | Continuity | Continuity pages read only public directory fields | Pass | 6/6 passed | Route sweep only; field-level check is in the 11 Oct review. |
| R03 | Profile | Profile photo import only from public https addresses, images only, 5 MB | Code reviewed |  | Host-name checks, no IP literals, redirects re-checked, bytes sniffed. A public name that resolves to a private address is not resolved first; on Cloudflare Workers private addresses aren't reachable, so the residual risk is low. |
| R04 | Settings | Account deletion removes stored files; a direct call can't orphan them | Pass | 2/2 passed |  |
| R05 | Profile | Practice facts saved in one transaction | Pass | 1/1 passed |  |
| R06 | Refer | Only colleagues a referral was sent to can reply | Pass | 1/1 passed |  |
| R07 | Platform | Postgres upgrade on the hosted projects | Nick to confirm |  |  |
| R08 | Files | Bucket limits: documents 20 MB and a type list, avatars 5 MB, own folder only | Pass | 4/4 passed |  |
| R09 | Settings | Data export: own data only, signed-out visitors sent to sign in | Pass | 2/2 passed |  |
| R10 | Sign-in | Truthful confirmation wording | Pass | 1/1 passed |  |
| R11 | Network | Profile links keep the way back | Pass | 1/1 passed |  |
| R13 | Legal | Legal and template review | Nick to confirm |  |  |
| R14 | Library | Copying a Library document | Not run on staging |  | Staging Library entries have no files behind them. |
| R15 | Platform | Leaked-password protection in Supabase Auth | Nick to confirm |  |  |
| R16 | Platform | Security headers | Pass | 1/1 passed |  |
| R17 | Platform | Vulnerable spreadsheet dependency removed | Pass | 1/1 passed |  |
| R13-04 | Cover | Clients step: + Save and add client adds a client and keeps the form | Pass | 1/1 passed |  |
| R13-05 | Cover | Incoming cover answered in place: Accept folds with Message; Ask a question first; client details held back; Decline; Covering card | Pass | 5/5 passed |  |
| R13-06 | Refer | Direct referral on the green card; receivers read the need first | Pass | 2/2 passed |  |
| R13-08 | Notifications | Reading a conversation reads its notification; Demos hide and show from Settings | Pass | 2/2 passed |  |
| P13 | Phones | Public phone header; no sideways scrolling on 12 member pages; slower demo on phones | Pass | 3/3 passed |  |
| R13-SBX | Sandbox | Slim sandbox strip, ··· menu, Your sandbox link (sandbox site) | Not run on staging |  | Needs the sandbox stack (demo site build); to check on sandbox.psyalliance.org after deploy. |
| J-COVER | Cover | Plan cover end to end: plan, two clients, colleagues, send, a colleague accepts, owner sees covered | Pass | 1/1 passed |  |
| J-REFER | Refer | Refer end to end: need, two colleagues, send, a colleague is interested, owner chooses | Pass | 1/1 passed |  |
| J-CONSULT | Consult | Ask the network, review, post, reply, mark useful | Pass | 1/1 passed |  |
| J-MSG | Messages | Message a colleague; double click sends once; failure keeps the text | Pass | 3/3 passed |  |
| J-AVAIL | Availability | Confirm availability | Pass | 1/1 passed |  |
| J-PROFILE | Profile | Edit the bio; a colleague sees it | Pass | 1/1 passed |  |
| J-NETWORK | Network | Add and remove a trusted colleague | Pass | 1/1 passed |  |
| J-PENDING | Access | A pending member sees no colleague details (page and API) | Pass | 1/1 passed |  |
| J-LIB | Library | Provisional templates are never presented as reviewed | Pass | 1/1 passed |  |
| J-PROVIDER | Physician portal | The paused physician portal says so and the database refuses referrals | Pass | 1/1 passed |  |
| RES-FAULT | Resilience | Service failure mid-save and a slow database | Pass | 3/3 passed |  |
| RES-LOAD | Resilience | Load: members using the app at the same time | See load report |  | tools/load.mjs; results in reports/<run>/load.json |
| RES-RESTORE | Resilience | Database plus stored files: snapshot, damage, restore, consistency check | See restore report |  | tools/restore-rehearsal.sh |
| A11Y | Accessibility | Automated accessibility checks (axe, WCAG 2.1 A and AA) on public and member pages | Pass | 28/28 passed |  |
| ADM | Admin | Admin pages and actions: only admins; every admin action refused for members at the database | Pass | 22/22 passed |  |
| LIVE | Live | Low-impact checks on psyalliance.org and sandbox.psyalliance.org with the two authorised fictional profiles | Not run |  | Run by Nick: npm run login:live, then npm run test:live. |
| RT-001 | Routes | / opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-002 | Routes | /_not-found opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-003 | Routes | /auth/forgot-password opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-004 | Routes | /auth/refer-sign-in opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-005 | Routes | /auth/refer-sign-up opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-006 | Routes | /auth/reset-password opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-007 | Routes | /auth/sign-in opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-008 | Routes | /auth/sign-up opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-009 | Routes | /availability-check/[token] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-010 | Routes | /continuity/print opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-011 | Routes | /dashboard opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-012 | Routes | /dashboard/admin opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-013 | Routes | /dashboard/admin/activation opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-014 | Routes | /dashboard/admin/channel-requests opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-015 | Routes | /dashboard/admin/insurance-requests opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-016 | Routes | /dashboard/admin/invitations opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-017 | Routes | /dashboard/admin/library opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-018 | Routes | /dashboard/admin/library-leads opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-019 | Routes | /dashboard/admin/members opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-020 | Routes | /dashboard/admin/moderation opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-021 | Routes | /dashboard/admin/network-health opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-022 | Routes | /dashboard/admin/referring-providers opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-023 | Routes | /dashboard/admin/sandbox opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-024 | Routes | /dashboard/admin/states opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-025 | Routes | /dashboard/admin/verifications opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-026 | Routes | /dashboard/availability opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-027 | Routes | /dashboard/clinicians opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-028 | Routes | /dashboard/consult opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-029 | Routes | /dashboard/consult/[id] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-030 | Routes | /dashboard/consult/groups opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Fail | 5/6 passed | @pell: React hydration error (HYD-01) |
| RT-031 | Routes | /dashboard/consult/groups/[id] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-032 | Routes | /dashboard/consult/new opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-033 | Routes | /dashboard/continuity opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-034 | Routes | /dashboard/continuity/duties opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-035 | Routes | /dashboard/continuity/view/[owner] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-036 | Routes | /dashboard/cover opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-037 | Routes | /dashboard/cover/[id] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-038 | Routes | /dashboard/cover/new opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-039 | Routes | /dashboard/credentials opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-040 | Routes | /dashboard/demos opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-041 | Routes | /dashboard/documents opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-042 | Routes | /dashboard/documents/[code] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-043 | Routes | /dashboard/documents/review opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-044 | Routes | /dashboard/full opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-045 | Routes | /dashboard/invite opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-046 | Routes | /dashboard/messages opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-047 | Routes | /dashboard/messages/[conversationId] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-048 | Routes | /dashboard/network opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-049 | Routes | /dashboard/notifications opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-050 | Routes | /dashboard/people/[id] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-051 | Routes | /dashboard/profile opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-052 | Routes | /dashboard/refer opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-053 | Routes | /dashboard/refer/[id] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-054 | Routes | /dashboard/refer/new opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-055 | Routes | /dashboard/requests opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-056 | Routes | /dashboard/settings opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-057 | Routes | /dev/preview/[screen] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-058 | Routes | /full/[slug] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-059 | Routes | /goodbye opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-060 | Routes | /i/[token] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-061 | Routes | /join opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-062 | Routes | /library opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-063 | Routes | /library/[slug] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-064 | Routes | /privacy opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-065 | Routes | /refer opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-066 | Routes | /refer/onboarding opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-067 | Routes | /refer/pending opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-068 | Routes | /refer/referrals opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-069 | Routes | /refer/rejected opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-070 | Routes | /sandbox/[token] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-071 | Routes | /sandbox/ended opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-072 | Routes | /sandbox/request opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-073 | Routes | /terms opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-074 | Routes | /tour opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-075 | Routes | /tour/[demo] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-076 | Routes | /tour/[demo]/[step] opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-077 | Routes | /tour/[demo]/done opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-078 | Routes | /tour/[demo]/watch opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RT-079 | Routes | /verification opens correctly for each role (anon, pell, avery, ruben, sol, esme) | Pass | 6/6 passed |  |
| RH-01 | Route handlers | /api/export/caseload | Covered by journeys |  |  |
| RH-02 | Route handlers | /auth/callback | Covered by journeys |  |  |
| RH-03 | Route handlers | /dashboard/admin/library-leads/csv | Covered by journeys |  |  |
| RH-04 | Route handlers | /dashboard/cover/[id]/not-fit | Covered by journeys |  |  |
| RH-05 | Route handlers | /dashboard/sandbox/open | Covered by journeys |  |  |
| RH-06 | Route handlers | /dashboard/settings/export | Covered by journeys |  |  |
| RH-07 | Route handlers | /robots.txt | Covered by journeys |  |  |
| RH-08 | Route handlers | /sandbox/resume | Covered by journeys |  |  |
| RH-09 | Route handlers | /sitemap.xml | Covered by journeys |  |  |
