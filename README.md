# PsyAlliance

A closed professional network and practice toolkit for PhD/PsyD/EdD psychologists
and psychiatrists — see the full build plan for phasing, architecture and
growth/monetization decisions.

## Stack

- **Next.js + TypeScript** — frontend and API routes
- **Supabase** — Postgres, Auth, Storage (M0 foundation)
- **Cloudflare** — hosting/CDN, and later Workers for the agent-query API (M4)

## Status: M0 scaffold

What's here:

- `supabase/migrations/0001_m0_m1_foundation.sql` — profiles, credential
  verification log, a generic `lookup_values` domain table (so new dropdown
  categories don't need schema changes), and the M1 practice toolkit tables
  (books of business, caseload, capacity planning, overhead expenses,
  documents metadata). Row-level security is on for every table; a
  `public_directory` view is the only path anonymous/agent queries get to —
  verified profiles, safe fields only. This is the down payment on the
  agent-native, public-vs-gated architecture from the build plan.
- A bare Next.js app shell (`src/app`) with Supabase client/server helpers
  (`src/lib/supabase`) wired up, not yet connected to a live project.

What's deliberately NOT here yet: auth screens, the caseload/income UI, the
document library, anything network-layer (M2), verification workflow
automation (M3), or the query API (M4) — those follow the milestone order in
the build plan once M0 is real and deployed.

## To make this real

1. Create a Supabase project, run the migration in `supabase/migrations/`,
   and fill in `.env.local` from `.env.example`.
2. `npm install`, then `npm run dev`.
3. Push this repo to GitHub and connect Cloudflare Pages (or Workers) to it
   for deploys.

No real patient-identifying data goes into `caseload_clients` — initials
only, enforced by a column-length constraint. `HIPAA_MODE_ENABLED` in
`.env.example` stays `false` until the Supabase HIPAA add-on (Team plan,
$599/mo+) and a Cloudflare Enterprise BAA are actually in place.
