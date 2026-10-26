# PsyAlliance: instructions for Claude sessions

## Safety (always)
- Never read `.env.local`. Never handle Nick's GitHub, Cloudflare or Supabase credentials or the `SUPABASE_SERVICE_ROLE_KEY`. Never `git push`, `npm run cf:deploy` or `cf:deploy:demo`: give Nick the exact commands to run himself.
- Schema changes are SQL files in `supabase/migrations/`. Nick runs them himself in both Supabase projects (real and sandbox). Keep them idempotent and end each with an all-`true` checks row.
- Fictional people only in demos and tests. No real patient information, no production database copy, no shared prospect password, no email sending.
- Never mark a Library document reviewed. Provisional documents show as "Coming soon" on the live site.
- US English. No em dashes in product copy.

## PsyAlliance version 13 implementation

This task is an exact port of the approved member workspace, not a redesign.
Frozen UI source: implementation-reference/psyalliance-v13/reference/dist/.
Do not edit the frozen reference or silently change its design, copy or interactions.
Read and apply the implementation contract:
@implementation-reference/psyalliance-v13/SPEC/01_IMPLEMENTATION_CONTRACT.md

Keep progress, parity evidence, demo inventory and exceptions in
docs/psyalliance-v13-parity/ so another session can continue without re-deciding the design.
Complete staging comparisons and backend tests before claiming completion.
