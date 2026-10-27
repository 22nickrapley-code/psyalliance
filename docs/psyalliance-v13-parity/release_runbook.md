# Release runbook: the v13 workspace and the final product

> Written 27 Oct 2026 for Nick. **Nothing has been pushed or deployed by Claude, and no SQL has been run on either Supabase project.** Everything below was tested on the local staging copy (fictional people only). Where a step is yours alone, it says so.

## What is being released

Branch `v13-port`, on top of `c73b008` (the 18 Oct release you already pushed), delivered as one Git bundle. It contains:

- the approved v13 workspace (The Hub, Cover, Referrals, Consult, Network / Search, Messages, Library) on the real database, with real sign-in, permissions and persistence;
- the 24 decisions in `final_product_decisions.md` (D-01 to D-24): the account pages (profile, credentials, continuity, My documents, notifications, settings, demos, groups, admin) in the same frame, Supervision hidden, the availability extras, Report and Block, Resolved questions, the physician tab, "Referral N" numbering with private titles, the darker small text, and the rest;
- the demos and the sandbox on the new screens (the sandbox is the demo site only);
- migrations **0117, 0118, 0120** for both projects, and **0119, 0121** for the sandbox project only (0115 and 0116 are from the 18 Oct release; the status query below tells you whether each project already has them).

## Decision you need to make first: the Cloudflare build (C-48)

From 22 Oct 2026, `opennextjs-cloudflare build` refuses Next.js 15 ("Next.js version 15.5.25 is not supported by the Next.js team") because it counts Next 15's support as two years from its release. It is a date check; it does not affect what is built, and it affects the code you deployed on 18 Oct exactly as much as this release. I could not add the override flag to your scripts (the safety system blocked it as a bypass), so `npm run cf:deploy` and `npm run cf:deploy:demo` **will stop at the build** unless you choose one of these:

1. **Run the build yourself with the flag** (what I would do for this release):
   - Production: `npx opennextjs-cloudflare build --dangerouslyUseUnsupportedNextVersion` then `npx opennextjs-cloudflare deploy`
   - Sandbox: `node scripts/deploy-demo.mjs --build-only` will stop for the same reason, so run the demo build by hand the same way with the demo settings from `.env.demo`, then `npx opennextjs-cloudflare deploy --env demo`. If you would rather not do that, say so and I will add the flag to `scripts/deploy-demo.mjs` and `package.json` in a one-line change you approve.
2. **Move to Next.js 16** first. It is its own piece of work with its own full test run. I would not fold it into this release, but it should be planned soon.

I could not run the Cloudflare build here for the same reason, so the Worker's final size is **not measured**. The standard `next build` (which the Cloudflare build wraps) passes, and the mode that blocks a server's requests to itself (as Cloudflare does) passes the Hide or Show Demos and old-tab checks (CF-02, CF-03) and 23 account-page, referral and message checks (the old inline-reply check CF-01 is retired: its screen was replaced).

## Order of work (recommended)

The old app (c73b008) keeps working on the migrated database (tested: see "Compatibility", below), so **the SQL can go in first, on its own**, and the new code after. If anything surprises you, stop after the SQL: the live site is still the old app.

1. Sandbox project: status query, SQL, checks.
2. Production project: status query, SQL, checks; open the live site and do LIVE-01 to LIVE-04 (old app on the new database).
3. Bring the code in and push.
4. Deploy the sandbox (demo) Worker and test it.
5. Deploy production and run the live checks.
6. Phone and screen-reader passes (`physical_device_checklist.md`).

### Step 0: status query (both projects, before any SQL)

Run `docs/psyalliance-v13-parity/release_checks.sql` in the SQL editor of each project. One row: `false` means that migration is not in yet. On the real project expect `m0119_sandbox_only` and `m0121_sandbox_only` to stay `false` for ever.

- Real project: run whichever of **0115, 0116** show `false`, then **0117, 0118, 0120**, in that order.
- Sandbox project (checked read-only on 27 Oct: it has 0115 and 0116, nothing after): run **0117, 0118, 0119, 0120, 0121**, in that order.

### Step 1 and 2: the SQL

For each file: open it from `supabase/migrations/`, paste it whole into the SQL editor and run. Then run `release_checks.sql` again: its column for that migration must say `true`.

| File | Real project | Sandbox project | Notes |
| --- | --- | --- | --- |
| `0115_external_retest_fixes.sql`, `0116_feedback_round_1018.sql` | only if the status query says false | already in | Each ends with its own checks row; every column `true`. |
| `0117_v13_workspace.sql` | yes | yes | Needs the rights the SQL editor has (it adds storage policies). Safe to run twice. **If you ever run it again, run 0120 again straight after it** (0117 holds older copies of functions that 0120 improves). |
| `0118_v13_network_consult_library.sql` | yes | yes | After 0117. Safe to run twice. |
| `0119_v13_sandbox.sql` | **never** | yes | The sandbox's guest, cast and story. Demo project only. |
| `0120_final_product.sql` | yes | yes | After 0117 and 0118. Safe to run twice. |
| `0121_sandbox_final_product.sql` | **never** | yes | The sandbox's examples (a colleague on a break, one not open to cover, a resolved question). After 0119 and 0120. |

If a migration stops with an error, stop and send me the message; do not run the next. All of them are written to be run again, so after a failure the fix is to run the same file again once the cause is dealt with.

### Step 3: bring the code in (PowerShell, in `C:\Users\Nick\Documents\psyalliance`)

```
git fetch C:\Users\Nick\Downloads\psyalliance-v13.bundle v13-port:v13-port
git merge --ff-only v13-port
git push origin master
```

`--ff-only` stops the merge if your master has moved on from `c73b008`; if it does, tell me rather than forcing it. The bundle's checksum is in the message that delivered it.

### Step 4: the sandbox (demo) Worker

After the sandbox SQL and the code are in, build and deploy the demo Worker as in "the Cloudflare build" above. Then open `https://sandbox.psyalliance.org` and run the sandbox checks:

- open a sandbox link: you are Rachel Davis, her story is there (Cover, Referrals, Messages, Consult);
- Talia Kellingsby shows "Paused until" and is missing from Cover and Referrals matching; Lena Larkhollow is not offered Cover;
- the oldest discussion with replies shows Resolved;
- colleagues reply within a minute or two;
- "Start the story again" in Settings restores everything.

### Step 5: production Worker

Build and deploy as in "the Cloudflare build". Then the live checks: LIVE-01 to LIVE-04 as on 17 Oct (sign in as the two named test profiles with the saved browser sign-ins; delete `e2e\.auth\` afterwards) and the new ones in `physical_device_checklist.md` that you can do on a computer: availability extras (23 to 25), Report and Block (26), Resolved (27), a conversation updating without a reload (28).

## Compatibility and rollback

- **Old app on the migrated database.** Tested on the local staging copy: I put the 18 Oct app (`c73b008`, exactly what is live) in front of a database that had 0117, 0118 and 0120 applied and ran its whole test suite. 618 tests passed, 3 were skipped and 9 failed. The 9 are not data problems: six are route checks of `/sandbox/request` (that address forwards to another website, which the offline test machine cannot reach; the same six fail the same way in every earlier pass), and three are accessibility checks on the old app's own pages (an empty colleague list marked as a list box: a defect the old app already had, fixed in the new code). Every sign-in, referral, cover, message, consult, document and admin test of the old app passed on the migrated database. That is why the SQL can go in first and the new code afterwards.
- **Rollback of the code:** in the Cloudflare dashboard, Workers & Pages, `psyalliance`, Deployments, choose the previous version and roll back (same for `psyalliance-demo`). This returns the site to the 18 Oct app in about a minute.
- **Rollback of the SQL:** not needed for the old app to work (above), and the migrations only add things. The two changes an *old* caller can see: the view `worked_with_before` (which the old Home, Clinicians, Refer and People pages read) now counts agreed work only, as decided in D-08, so from the moment 0120 is in the old app's "worked together" marks follow the new rule; and the trigger function `guard_referral_response` now lets a member whose licence has lapsed say "not available" (D-10). The functions 0120 reshapes (`set_my_availability`, `cover_exclusions`) were created by 0117 in this same release, so no old caller exists. Nothing is deleted from anything the old app uses.
- **Data safety:** the weekly backup (`scripts/backup`) is unchanged; run it once by hand before the production SQL if you want a fresh copy.

## What I tested, and what I could not

All on the local staging copy (fictional people only), final build, 27 Oct 2026. Nothing was run on either Supabase project or on Cloudflare.

**Passed**

- **The whole staging suite on a brand-new database** (all 128 migrations from empty, then the test people): 762 tests, 730 pass, 26 are skipped by design (the sandbox-only tests, the Cloudflare-style tests and the Library-preview test, all run separately below) and 6 fail for one known reason: the `/sandbox/request` route checks, which forward to the real website that an offline machine cannot reach (same six in every earlier pass; recorded in `legacy_test_triage.csv`).
- **The sandbox** on the demo build and a demo database with 0119, 0120 and 0121 applied (0120 and 0121 each twice): the 20 sandbox checks (isolation between visitors, reset, resume, expiry, no real delivery, example answers, 20-client draft) and the 2 new ones for the final product's examples (Talia "Paused until", Lena not offered Cover, a resolved question, all kept by "Start the story again") pass. The demo videos and pages (TOUR-01 to TOUR-11) pass in the main run.
- **Old app on the migrated database:** 618 pass, 3 skipped, 9 fail for the reasons in "Compatibility and rollback".
- **Upgrade path:** a copy of the 18 Oct database, then 0117, 0118 and 0120, then the full suite on the new code: 638 pass; every failure it found was fixed.
- **A server that cannot call itself (as on Cloudflare):** 25 pass (Hide or Show Demos, a tab from before a new version, account-page saves, referrals, messages).
- **Public pages:** desktop 7, phone 7; the phone runs of the workspace 3.
- **Accessibility:** the automated WCAG 2.1 A and AA rules pass on every public page and every member, account and admin page, desktop and phone. A crawl that opened 93 dialogs, panels and menus as two members on desktop and phone found no colour-contrast failure left. A brand-new member with nothing set up sees working, honest screens everywhere (EMP-01, EMP-02).
- **Look compared with the approved mock-up:** 474 paired states (79 screens at six sizes) were captured on the final build beside the frozen mock-up, same clock, same sizes. 26 are identical to the pixel. 244 are the same size and differ only in the small text colours (D-04) and in the listed final-product changes ("Referral 1" numbering and the private title row, Report and Block, the availability window's extras). 204 differ in page height by 2 to 32 px because the Hub's availability card carries one more note line (D-05), or because the availability window has its extra rows. Every difference is listed with its exception number in `visual_capture_plan.csv`; two are marked for the physical-phone pass (the message menu's height on phone widths, VIS-19; the Settings dialog on a phone, VIS-24). A second capture after the final colour tweaks showed no change in any page size.
- **Messages under stress:** a dropped connection, a retried send (stored once), a double click, a file that is dropped again, two people answering at the same moment: covered by MSU, RV and RES tests, all passing.

**Could not be tested here, and why**

- **The Cloudflare build and the Worker's size**: the build refuses Next.js 15 after 22 Oct (C-48). The standard Next.js build passes; the size of the Cloudflare bundle is not measured.
- **The SQL on the two real Supabase projects**: yours to run. The empty-database rebuild, the upgrade path and the old-app run are the rehearsal for it; the order is in "Step 0" to "Step 2".
- **A real phone, a keyboard-only pass and a screen reader**: `physical_device_checklist.md`.
- **Real email delivery from the live site** (the test machine's mail server is a local stand-in; the sandbox never sends real mail by design).
- **Load at a few thousand members** (C-07, C-30, C-35).

## Things only you can do

- The SQL runs, the two Cloudflare builds and deploys (and the C-48 choice), `git push`.
- The Magic Link subject and the Supabase Auth SMTP password fix from the 18 Oct list; legal review of the privacy policy and Terms (including the one-word Library change, C-44); Library reviews ("Coming soon" stays on each template until it is marked reviewed); the R07 and R15 confirmations.
- A keyboard and screen-reader pass, and the physical-phone pass (`physical_device_checklist.md`).
- Decide the branch `wip-1019-small-changes`, and confirm the physician fields (C-46).

## Pushbacks and keep-from-original items

See `concerns_for_nick.md` (C-01 to C-49). The ones I would read first: C-48 (the build), C-37 (contrast, resolved by D-04), C-07, C-30 and C-35 (the full directory, Consult list and Network are loaded in the browser: fine for the founding cohort, needs server-side search at a few thousand members), C-09 (polling, with Realtime as a later option), C-47 (a referral's number tells its recipient how many referrals the sender has made), C-40 (the sandbox's generated cast is richer than the mock-up), C-45 (the first-week plan is not built; the empty screens are checked, below), C-46 (physician fields), C-49 (the profile's Availability tab opens the Hub window).
