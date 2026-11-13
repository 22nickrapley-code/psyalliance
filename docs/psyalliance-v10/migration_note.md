# Migration note: v10

`0134_v10.sql`:
1. `public.cover_create_plan`: identical to 0130_v4_final.sql except a plan may hold up to 30 client needs (was 20).
2. `private.demo_discussions()`: new wording for the nine sandbox discussions (same people, audiences and timings). Only new sandboxes use it.

Run twice locally: no errors. Rollback: re-run the two definitions from 0130_v4_final.sql and 0119_v13_sandbox.sql.
