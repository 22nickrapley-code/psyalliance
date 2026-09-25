# PsyAlliance environments

Two sites, two databases, never shared.

| | Real site | Demo site |
|---|---|---|
| Worker | `psyalliance` | `psyalliance-demo` |
| URL | https://psyalliance.22nickrapley.workers.dev (psyalliance.org once the domain is attached) | https://psyalliance-demo.22nickrapley.workers.dev |
| Supabase project | `vvmulsyvyjsxhcpqfpyo` (psyalliance) | `xsfqeepxnmnvlhxwkfnw` (psyalliance-demo, us-east-1) |
| Build | `npm run cf:deploy` (reads `.env.local`) | `npm run cf:deploy:demo` (reads `.env.demo`) |
| `NEXT_PUBLIC_APP_ENV` | `production` | `demo` |
| `app_config.app_env` | not set | `demo` |
| Sign-up | invitation only (`signup_mode` = `invite`) | invitation only; prospects use sandbox passes |
| Email | Resend/Postmark once `email_api_key` is in Vault | never: no key, and every account is a demo account |
| Robots | indexed | `Disallow: /`, `noindex` |
| Home page | landing | guided tour (`/tour`) |

`NEXT_PUBLIC_*` values are baked in at build time, which is why the demo is a separate build. The deploy script refuses to build the demo against the production project.

## Real site

- **Admin**: Nick's login is an admin-only (operator) account: full admin access, no clinical profile, never verified, listed, matched or counted.
- **Joining**: people ask at `/join`; an admin issues a personal invitation at Admin → Invitations (works once, 30 days, bound to the email). Sign-up without one is refused by the database.
- **Verification**: licence reviewed against the state board first, then the member is verified. The database refuses "verified" without a reviewed, in-date licence.
- **Supabase Auth settings** (dashboard → Authentication → URL configuration): Site URL = the real URL; redirect URLs = `<real URL>/auth/callback`.
- **app_config**: `site_url` = real URL (used in email links), `email_from`, `email_provider`.

## Demo site: setup

Done (25 Sept 2026), by Claude through the Supabase connector:

- Project `xsfqeepxnmnvlhxwkfnw` built from the real project's catalog, not by replaying migrations (early migrations seed people). Queries: `supabase/ops/demo_snapshot_generator.sql`. Same tables, keys, indexes, 82 functions, views, triggers (including invitation-only sign-up), RLS, 152 policies, grants and storage buckets. Check with `supabase/ops/schema_fingerprint.sql` on both projects; the two expected differences are listed in that file.
- Only the lookup lists were copied. No people, activity, files or production data.
- `app_config`: `app_env = demo`, `signup_mode = invite`, `site_url` (placeholder until the Worker URL is known). No `email_api_key`, ever.
- Cron: `pa_demo_autorespond` (every minute), `pa_sandbox_cleanup` (hourly), `pa_email_dispatch`, `pa_cron_history_cleanup`. No reminder or digest jobs.
- Seeded: `select private.seed_demo_network(null);` gives 1,200 fictional members, 200 in each of NY, NJ, MA, CT, RI and VT. Every specialty is a first or second focus in every state, and the demo dropdowns only offer states, specialties, insurers and languages that `network_coverage()` shows are well covered, so a demo search never comes back empty.
- Library metadata (codes, summaries, audience, tags) restored for all 20 resources; `site_url` is the demo URL.
- Release checks on the demo: sandbox (all ok), invitations (6/6).

Nick, once (steps 1 to 4 and 6 done on 25 Sept):

1. **Env file**: `.env.demo` (not committed; public values only) has the demo URL and publishable key. Set `NEXT_PUBLIC_SITE_URL` to `https://psyalliance-demo.<your-subdomain>.workers.dev` (same subdomain as the real Worker's workers.dev address).
2. **Auth URLs** (demo dashboard → Authentication → URL Configuration): Site URL = the demo URL; Redirect URLs = `<demo URL>/**` and `http://localhost:3001/**`.
3. **Deploy**: `npm run cf:deploy:demo`.
4. **Your admin login on the demo**: open the invitation link Claude gave you (`/auth/sign-up?invite=...`, bound to your email, 30 days), sign up, then in the demo SQL editor:
   `update profiles set is_admin = true, account_kind = 'operator' where id = (select id from auth.users where email = '<your email>');`
   (or ask Claude to run it).
5. **Library PDFs**: `npm run dev:demo`, sign in at http://localhost:3001 with that admin login, Admin → Library → Seed starter library. They load as Provisional, like the real site.
6. **site_url**: tell Claude the demo URL, or run `update app_config set value = '<demo URL>' where key = 'site_url';` in the demo SQL editor.

## Prospect access (demo)

Admin → Sandbox passes → name the prospect, pick 3 to 30 days → copy the link and send it yourself. Opening it creates a fresh fictional practice (Alex Rivers, PsyD, Brooklyn, NY, licensed NY and NJ, six weeks of parental leave starting about five weeks out) among the 1,200 fictional colleagues. The guided tour tells the same story with the same cast and signs them in with a random one-off password nobody sees. No shared password exists.

- Colleagues answer the prospect's cover requests, referrals, consult questions, invitations and messages within a minute or two.
- Email invitations are blocked for demo accounts; no email is ever sent.
- Guests have no admin access.

## Resetting the demo

- **One prospect**: they click "Start the story again" in the banner, or open their link again.
- **Expired or revoked passes**: guest accounts are deleted every hour (`pa_sandbox_cleanup`).
- **Everything**: `select private.purge_demo_network(); select private.seed_demo_network(null);` (existing passes stay valid; each rebuilds on next open).

## Release checks

SQL in `supabase/tests`, each run in one transaction that always rolls back:

- `release_check_reads.sql`: what admin, verified, pending, suspended and demo accounts can read.
- `release_check_writes.sql`: pending can't publish, reply, message, invite or notify; licence relevance; demo/real isolation; the full Cover, Refer and Consult loop between two eligible clinicians.
- `release_check_library.sql`: reviewer appointments, independence, versioned re-review.
- `release_check_invitations.sql`: invitation-only sign-up.
- `release_check_sandbox.sql`: sandbox passes, auto-replies, reset, cleanup, refusal outside the demo.

Parity between the two databases: `supabase/ops/schema_fingerprint.sql`. Any schema change goes to both projects; re-run it after. Migrations 0090 and 0091 (Northeast seed, server-side network search) are on both; the changed functions were checked identical by hash on 25 Sept.

## Security advisor notes

- `private.safe_deep_link` now has a fixed search path.
- The callable security-definer functions are deliberate: token flows (`invitation_status`, `request_to_join`, `availability_check_*`, `claim_sandbox`) check the token themselves; `admin_*` functions check `is_admin`; `my_*`, `network_*`, `match_pool`, `member_track_record` return only what the caller may see (network eligibility, partition, blocks).
- **Leaked-password protection**: Nick to switch on in both projects (Authentication → Policies / Password security).
