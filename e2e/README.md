# PsyAlliance acceptance suite

An independent check of PsyAlliance: browser journeys (Playwright), checks
straight against the database rules, a disposable local copy of the whole
system to test on, and a register that ties every check to what it proves.

Nothing here holds a password, cookie, key or reset link. Staging uses
throwaway keys and fictional people made on the test machine. The live checks
use browser sign-ins you save yourself, kept in `e2e/.auth/` (never committed).

## What's where

| Path | What it is |
|---|---|
| `tests/staging/` | Full journeys on the local staging copy: findings, journeys, every route for every role, resilience, accessibility, admin (last) |
| `tests/staging/phone/` | Phone checks (Pixel 7 screen) |
| `tests/public/` | Read-only public pages; safe on the live sites |
| `tests/live/` | Low-impact signed-in checks on psyalliance.org with the two authorised test profiles |
| `tests/diagnostics/` | Probes used to investigate (NAV-01 stalls, hydration, contrast) |
| `staging/` | The local staging stack: Postgres 17, Supabase Auth, PostgREST, Storage, Mailpit, a gateway with fault injection, an email-provider stand-in |
| `register/` | The acceptance register: `catalogue.json` (what is checked), `routes.json` (every route the build defines), generated `register.md` and `register.csv` |
| `tools/` | `save-login.mjs` (save a live sign-in), `build-register.mjs`, `routes.mjs`, `load.mjs`, `restore-rehearsal.sh` |
| `reports/<run>/` | Evidence per run: HTML report, `results.json`, JUnit, screenshots, traces on failure, sanitised console and network logs |

## On your computer: live checks (Windows, PowerShell)

Once, in the repo:

```
cd e2e
npm install
npx playwright install chromium
```

Read-only public checks on both sites (changes nothing):

```
npm run test:public:live
npm run test:public:sandbox
```

Signed-in checks with the two test profiles. Save each sign-in once; a
browser opens and you sign in yourself:

```
npm run login:live -- rachel
npm run login:live -- rena
npm run test:live
```

`test:live` sends a few messages marked "QA test, please ignore" between
Rachel and Rena, and changes Rena's digest setting and puts it back. Nothing
else. LIVE-03 counts how often a sent message fails to open its
conversation (NAV-01): run it before and after deploying the candidate.
Delete `e2e\.auth\` when you're done.

See the results: `npx playwright show-report reports\<run>\html`.

## On a Linux test machine: the staging copy

```
bash staging/stage.sh setup      # once: downloads the services
bash staging/stage.sh rebuild    # fresh database, every migration, fictional people
E2E_BASE_URL=http://localhost:3601 npx playwright test --project=staging
E2E_BASE_URL=http://localhost:3601 npx playwright test --project=staging-phone
node tools/build-register.mjs reports/<run> [reports/<run> ...]
```

The app under test runs with `next start`, pointed at the staging gateway
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and the staging anon key in
its `.env.local`). `stage.sh snapshot NAME` / `restore NAME` save and bring
back the database and stored files together.

Staging differs from the hosted projects in three ways, all on purpose:
scheduled jobs and outgoing HTTP are run by the test runner (so a test
decides when the email dispatcher fires), emails go to a local provider
stand-in and Mailpit (never a real inbox), and Vault holds a test key.
