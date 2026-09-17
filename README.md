# PsyAlliance

A closed professional network and practice toolkit for PhD/PsyD/EdD psychologists
and psychiatrists — see the full build plan for phasing, architecture and
growth/monetization decisions.

## Stack

- **Next.js + TypeScript** — frontend and API routes
- **Supabase** — Postgres, Auth, Storage (M0 foundation)
- **Cloudflare** — hosting/CDN, and later Workers for the agent-query API (M4)

## Status: M0–M3 built and live, M4 code-complete but undeployed

Live: a real Supabase project (`psyalliance`, free tier, project ref
`vvmulsyvyjsxhcpqfpyo`) with every migration below applied. The Next.js app
runs against it locally now (`.env.local`, not committed).

What's here:

- `supabase/migrations/0001...0006*.sql` — profiles, credential verification
  log, a generic `lookup_values` domain table, the M1 practice toolkit
  (books of business, caseload referenced by system id — never a name —,
  capacity planning, overhead expenses, documents metadata + Storage RLS),
  M2 network tables (`connections` for Partners/Bench, `referral_requests`/
  `referral_responses` for the coverage workflow), and M3's admin flag +
  policies for the credential verification queue. Row-level security is on
  for every table; `public_directory` is the only path anonymous/agent
  queries get — verified profiles, safe fields only.
- `src/app` — full Next.js App Router build: Supabase Auth (sign-up/sign-in),
  profile form, caseload CRUD, income dashboard, capacity/overhead tracker,
  documents module (personal + shared library), network (Partners/Bench +
  computed Recommended), referral/coverage workflow, and an admin
  credential-verification review queue.
- `workers/agent-api` — M4: a Cloudflare Worker exposing `public_directory`
  as a friendly, filterable JSON API plus a `/.well-known/mcp.json`
  WebMCP-style tool descriptor, so an AI agent can discover and query the
  directory directly. **Written but not deployed** — this session's
  Cloudflare connector can list/inspect Workers but has no deploy tool; see
  `workers/agent-api/README.md` for the one-command `wrangler deploy` once
  you run it (needs your Cloudflare login, which this session doesn't have).

What's deliberately NOT here yet: automated state-board/ASPPB/NPI credential
lookups (M3's queue is fully human-reviewed for now, on purpose), a scoring/
endorsement engine behind M4's paid tier (nothing is gated yet — there's no
gated data built to sell access to), and any production deploy of the
Next.js app itself to Cloudflare.

## To make this real

1. First admin: after you and Rena sign up, run
   `update profiles set is_admin = true where id = '<your auth uid>';`
   in the Supabase SQL editor so the verification queue is reachable.
2. `npm install`, `cp .env.example .env.local` and fill in the Supabase URL/
   anon key (already live — ask for the values if you don't have them),
   then `npm run dev`.
3. Push this repo to GitHub and connect Cloudflare Pages (or the Next-on-
   Workers adapter) to it for the app's own deploy; deploy
   `workers/agent-api` separately per its README once you're ready for M4
   to go live.

`caseload_clients` is designed to stay outside HIPAA's scope by not
collecting anything identifying in the first place: every case is
referenced by its own system-generated `id` ("Case #`<id>`" in the UI),
never a name or initials. `private_label` is an optional, user-typed
shorthand, RLS-isolated to its owner alone — if someone chooses to put
something identifying in their own private note, that's their choice, not
a platform requirement. This is a risk-reducing design decision, not a
guaranteed legal exemption — see the build plan's architecture section
for the caveat. `HIPAA_MODE_ENABLED` in `.env.example` stays `false`;
because of this design there's no need for the Supabase HIPAA add-on
(Team plan, $599/mo+) or a Cloudflare Enterprise BAA right now — free/low
tiers are sufficient indefinitely, unless a future feature actually
requires collecting real patient-identifying data.
