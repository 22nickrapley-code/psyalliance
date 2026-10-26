# PsyAlliance v13 port: parity ledger

Frozen reference: `implementation-reference/psyalliance-v13/` (commit ceafc8d4, never edited; `node implementation-reference/psyalliance-v13/tools/verify-reference.cjs`).
Original product commit: `c73b008` (branch `fixes-1018`, pushed to master by Nick). Port branch: `v13-port`.

## Architecture (decided 26 Oct 2026)
- `src/workspace/engine.ts`: the reference engine, ported with only data-layer changes (audit: `node scripts/engine-diff.mjs`).
- `public/workspace/*.css`: the 9 reference stylesheets, byte-identical, loaded in the frozen order by `src/app/(workspace)/layout.tsx` (its own root layout, so no older CSS or web fonts leak in).
- Adapters: `fixture` (reference data, used by tours/demos and visual comparison) and `live` (Supabase, real accounts).
- All older routes moved unchanged into the `(site)` route group. URLs did not change.

## Evidence so far
| Step | Result |
| --- | --- |
| Frozen source hashes | 42/42 match |
| Reference regression suite | 49/49 groups pass (reference only; not target evidence) |
| P0 engine on fixture data vs reference | 132/132 paired captures pixel-identical (22 states x 6 viewports) |

## Tools
- `e2e/tools/parity-capture.cjs` + `e2e/parity/scenarios.cjs`: paired capture, fixed clock, same viewport.
- `scripts/` (outside repo): `parity-diff.py` writes red-pixel diffs and `summary.csv`.
