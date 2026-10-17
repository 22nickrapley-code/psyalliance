# Release testing, 16 October 2026

**Recommendation: release the candidate (branch `candidate-1016`) once the four steps under "Before and after deploying" are done, and LIVE-03 then shows no stuck sends on psyalliance.org.** The deployed build has seven High or Medium defects that lose work or mislead members, and the candidate fixes all of them on staging. What remains open is low risk and can't lose data.

## What was tested

- **Where:** a disposable copy of the whole system on the test machine: Postgres 17, Supabase Auth 2.197.0, PostgREST 13, Storage 1.80.2, every migration, fictional people. Both builds ran against it: the deployed `c131fdc` (baseline) and the candidate. No real person's data was used, and nothing was changed on the live sites (read-only checks only).
- **How much:** 88 route definitions (79 pages, 9 handlers) and 144 register items. The route sweep opens each of the 79 pages as six kinds of user (474 page loads). The suite has 121 other checks.

## Results

| | Baseline `c131fdc` | Candidate |
|---|---|---|
| Journeys, findings, resilience, accessibility, admin (118) | 64 pass, 54 fail | **118 pass** |
| Phone (3) | 1 pass, 2 fail | **3 pass** |
| Route sweep (474 page loads) | not repeated | **473 pass**, 1 intermittent hydration error (HYD-01) |
| Register items | | 124 pass, 9 covered by journeys, 1 intermittent (HYD-01), 3 for Nick to confirm, 2 not testable on staging, 1 live (Nick runs) |

Details: `register.md` (every item), `defects.md` (ledger), `revision-map.md` (change to test), `evidence/` (results per run).

**Resilience**
- **Same-moment actions:** two colleagues accepting the same client at once gives one acceptance, and the other is told. A double click on Send posts once. Two referral choices at once leave one chosen colleague.
- **Failures mid-save:** a database failure while sending shows a plain sentence and keeps the text and the recipient. A failed Accept can be pressed again. With every database call slowed by 3 seconds, Home still loads, but takes 19 s: its queries run one after another (PERF-01).
- **Email provider:** a rate-limited send or a provider error is tried again. A refused sender fails at once. An email that keeps failing stops after three retries.
- **Load:** one Node process on the test machine, with fictional members clicking every 0.2 to 0.8 s and no errors at any level.

  | Members at once | Median | 95th percentile | Pages per second |
  |---|---|---|---|
  | 5 | 218 ms | 512 ms | 6.7 |
  | 20 | 1.4 s | 1.8 s | 10.3 |
  | 40 | 3.0 s | 3.3 s | 11.4 |

  Throughput levels off at about 11 pages per second per process. This shows the app's own cost per page, not Cloudflare's capacity, which runs many processes.
- **Restore:** the database and stored files were snapshotted together, damaged on purpose (rows deleted, a file removed, a file corrupted), then restored in 4 seconds. The restore matched the snapshot exactly, with no file rows missing their bytes and no bytes missing their rows.

**Security (admin tested last)**
- **Member tries admin changes:** a member's attempts at every admin change are refused by the database. That covers making themselves admin, verifying, suspending, reviewing a license, all 13 admin functions, publishing a Library document, appointing reviewers, invitations and sandbox passes.
- **Shared Library folder:** one gap was found. Any signed-in account could upload files to it (SEC-01). It is fixed in 0114, and none had been uploaded on live.
- **Pending members:** they see no colleague details, either on the page or through the API.
- **Security headers:** present. The `X-Powered-By` header is removed.

**Accessibility**
- **Pages checked:** 28 pages, automated WCAG 2.1 A/AA checks.
- **Baseline:** 10 pages had serious problems: low-contrast small text on 8 pages and an unlabelled colleague list on 2.
- **Candidate:** none serious or critical.
- **Not covered by automation:** keyboard-only and screen-reader passes still need doing by hand.

## The duplicate sign-up and reset email (Nick, 15 to 16 Oct)

- **Sign-up with a registered email:** Supabase deliberately sends nothing and gives no sign that the address is taken. The app then said "check your inbox", so nothing arrived. Now the owner gets a sign-in email, and the page says the same neutral thing either way (AUTH-02).
- **Reset:** your 15 Oct 18:16 request was accepted and handed to the mail service. Your double click hit the one-a-minute limit, which the app hid. Now failures and the limit are said plainly (AUTH-01). Whether the 18:16 email reached your inbox is in the Resend log, which I can't reach.

## Before and after deploying

1. **Run `supabase/migrations/0114_release_blockers.sql` in both Supabase SQL editors**: the real project, then the sandbox project. It is safe to run twice; rehearsed twice on a copy of the deployed schema. The last result row must be all `true` (11 columns).
2. **Deploy both Workers from `candidate-1016`.** The commands are in the handover message.
3. **Email:**
   - Add the Resend key in the real project: `select vault.create_secret('<your Resend key>', 'email_api_key');`
   - Verify psyalliance.org in Resend.
   - Optional: in Supabase Auth > Email Templates > Magic Link, use a subject like "Sign in to PsyAlliance". The repeated-sign-up email uses this template.
4. **Live checks:** run them with the two test profiles (`e2e/README.md`). LIVE-03 must show no "stalled". Then delete `e2e\.auth\`.

## Open, accepted or for you to decide

- **HYD-01, open:** an intermittent React hydration error, recoverable.
- **PERF-01, open:** Home's queries run one after another.
- **NAV-01, mitigated:** the root cause sits in the framework and Next 15.5.28 is identical. Re-test it on Next 16.
- **R07, R13, R15:** Postgres upgrade, legal review and leaked-password protection. For you to confirm.
- **Product decisions:**
  - one notice per conversation per day;
  - answered cover requests move below open ones;
  - the paused physician portal asks for patient initials;
  - stored files need their own backup on Supabase.

## Cleanup

- **Staging:** everything was on the disposable copy. The QA records are fictional and stay there; nothing reached a real inbox.
- **Live:** no live data was changed. Live checks were read-only, apart from the LIVE checks you run.
- **Secrets:** no secrets in the repo or the reports. Staging keys are local throwaways. Live sign-ins stay in `e2e\.auth\`, which is ignored by git.
