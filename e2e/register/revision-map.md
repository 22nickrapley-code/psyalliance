# Revision-to-test map

Baseline: `c131fdc` (deployed on psyalliance.org and sandbox.psyalliance.org).
Candidate: branch `candidate-1016` (commits after `c131fdc`), plus migration `0114_release_blockers.sql` for both Supabase projects.

| Change in the candidate | Where | Proved by |
|---|---|---|
| One winner per cover client: locking function, table guard, sibling requests closed, stale accepts refused | `0114` (cover), `src/lib/coverage.ts`, `cover/actions.ts` | N16-02-A to D, G, H; RES-CONC-01; R13-05-A; J-COVER-01 |
| One chosen colleague per referral | `0114` (referral), `src/lib/referrals-v2.ts` | N16-02-E, F, G; J-REFER-01 |
| Notifications written in one call with every column; `actor_type` cast | `0114` `raise_notification`, `src/lib/notifications-v2.ts` | N16-03-A, N16-03-B, N16-04-A, R13-08-A |
| Reading a conversation reads its notices | `notifications-v2.ts`, messages pages, `threads.ts` | R13-08-A |
| Email retries for temporary provider failures | `0114` EMAIL-01 (`reconcile_email_outbox`) | RES-EMAIL-01 to 03 |
| "Every two weeks" digest | `0114` N16-01, settings | N16-01-A, LIVE-04 |
| Mark useful (author only, saved value returned) | `0114` N01, `src/lib/consult.ts` | N01-A, N01-B, J-CONSULT-01 |
| Erasure refuses while files remain; app removes files first, recursively, and checks | `0114` R04, `profile/actions.ts` | R04-A, J-DATA-03 |
| Shared Library folder: admins only | `0114` SEC-01 | ADM-SEC-05 |
| Parity: licence review guard and demo responder as on both hosted projects | `0114` parity | Schema fingerprint (staging matches live) |
| Repeated sign-up emails the owner; reset failures and rate limits said plainly | `src/app/auth/actions.ts` | AUTH-02-A/B, AUTH-01-A/B/C, AUTH-03-A |
| Navigation watchdog (NAV-01) | `src/app/_live/live.tsx` | NAV-01 probe (diagnostics), RUN-002, J-COVER-01, J-REFER-01, J-CONSULT-01, R13-05-A |
| No second refresh after answering a cover request | `cover/incoming-case.tsx` | R13-05-A, accept-reload probe (diagnostics) |
| One press, one save; drafts kept (also when the page arrives late) | `live.tsx` 0c, 0d | RES-CONC-02, N02-A, RES-FAULT-01 |
| Plain-language save errors | `src/lib/friendly-error.ts` and 11 action files; messages | RES-FAULT-01, RES-FAULT-02 |
| Referral Back keeps the picks; direct referral card; need shown first | `refer/views.tsx`, `refer/new/page.tsx` | N02-A, R13-06-A/B |
| Incoming cover answered in place; Covering card; Save and add client | `cover/incoming-case.tsx`, `cover/views.tsx`, `cover/page.tsx`, `premium.css` | R13-04-A, R13-05-A to E |
| Demos: Escape, focus return, sandbox button, "You" persona, phone pacing, hide from menu | `tour/story-player.tsx`, `watch-demo.tsx`, `first-visit.tsx`, `demos/*`, settings | DEMO-01-A, DEMO-02-A, N03-A, R13-08-B, P13-03 |
| Phone header, compact tabs, no sideways scroll | `premium.css`, `chrome.tsx` | P13-01, P13-02 |
| Contrast and a label for the colleague lists | `premium.css`, `colleague-picker.tsx` | A11Y-PUB-*, A11Y-MEM-* |
| No `X-Powered-By` header | `next.config.mjs` | R16-A, PUB-06 |
| Recovered migrations (already on both hosted projects; for rebuilds) | `0016a`, `0039a` to `0039e`, `0043a` | Staging rebuild from migrations |
