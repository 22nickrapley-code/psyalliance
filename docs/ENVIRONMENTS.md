# PsyAlliance environments

Two sites, two databases, never shared.

| | Real site | Demo site |
|---|---|---|
| Worker | `psyalliance` | `psyalliance-demo` |
| URL | https://psyalliance.org (workers.dev until the domain is attached) | `https://psyalliance-demo.<subdomain>.workers.dev` |
| Supabase project | `vvmulsyvyjsxhcpqfpyo` (psyalliance) | its own project (to be created) |
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

## Demo site: one-time setup

1. Create a new Supabase project (e.g. `psyalliance-demo`, us-east-1). The free plan allows two active projects; the org already has two, so either pause "The world would be better if" or upgrade.
2. Apply every migration in `supabase/migrations` in order (Claude can do this through the Supabase connector once the project exists).
3. Configure it (SQL editor):
   ```sql
   insert into app_config (key, value) values
     ('app_env', 'demo'), ('signup_mode', 'invite'), ('site_url', 'https://psyalliance-demo.<subdomain>.workers.dev')
   on conflict (key) do update set value = excluded.value;
   select private.seed_demo_network(null);   -- the 120 fictional members
   ```
   Do not add an `email_api_key`.
4. Auth settings: Site URL and redirect URL = the demo URL.
5. Storage: create the `documents` and `avatars` buckets (same policies as production, via the migrations), then load the Library PDFs by running the site locally against the demo project and using Admin → Library → Seed starter library.
6. Your admin login on the demo: `insert into cohort_invitations (email) values ('you@example.com') returning token;`, sign up at `/auth/sign-up?invite=<token>`, then
   `update profiles set is_admin = true, account_kind = 'operator' where id = (select id from auth.users where email = 'you@example.com');`
7. Copy `.env.demo.example` to `.env.demo`, fill in the demo project's URL and publishable key and the demo URL, then `npm run cf:deploy:demo`.

## Prospect access (demo)

Admin → Sandbox passes → name the prospect, pick 3 to 30 days → copy the link and send it yourself. Opening it creates a fresh fictional practice (Dr. Alex Rivers, Austin) among the 120 fictional colleagues and signs them in with a random one-off password nobody sees. No shared password exists.

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
