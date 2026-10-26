# Paste this into Claude working on the original PsyAlliance repository

Implement the approved PsyAlliance mock-up in the original product as a **faithful implementation of version 13**, including every existing demo. This is not a redesign exercise.

The complete handover is in `implementation-reference/psyalliance-v13/`. If it is still zipped, extract `PsyAlliance_Claude_Handover_v13.zip` there first. Read `START_HERE.md`, all seven `SPEC/` files and the verification matrices. Verify the frozen source hashes, run its 49-group regression suite and serve the reference locally. Inspect the actual screens and interactions before porting them.

The approved UI is `reference/dist/`, frozen from commit `ceafc8d43f573da9108212d6ee30ea5be26fd99e`. It is the authority for design, copy, dimensions, spacing, typography, colours, icons, hover/focus behaviour, responsive layouts, pop-ups, fixed controls and user journeys. Preserve the CSS cascade and assets. Do not reinterpret, modernise, simplify, rename or replace the design with your preferred components. Do not replace mobile overlays with full screens.

Read the original code first. Create an isolated implementation branch/worktree, record the original commit and inspect its build/test/deployment instructions. Map the approved components and behaviour onto the existing authenticated application and services. Preserve existing users, records, permissions, IDs and histories. Implement real backend persistence, transactional acceptance, context routing, scheduling and delivery; do not ship browser-local simulations as production functionality. The limited environment-specific differences allowed are listed in the contract.

Inventory **every** original demo entry point, route, sandbox, role/use-case tour, embedded preview, seed fixture and promotional screen representation. Populate the supplied demo route matrix with actual source paths, URLs, scenarios and evidence. Update all discovered demos to the approved components and logic. Keep demo data and simulated actions isolated from production. Do not claim all demos are done until the inventory and coverage are reconciled.

Maintain a persistent parity ledger in the original repository. Complete every applicable functional, visual and demo acceptance row; record target test names and evidence. Compare reference and port side by side with identical fixtures, browser, viewport and UI state, including pop-ups, hover/focus, empty/error states and phone-width layouts. Check 320×700, 390×844, 900×760, desktop and reduced-height keyboard conditions. Physical iPhone/Safari and Android keyboard/media testing must be distinguished from viewport emulation.

Work autonomously through implementation, tests and a reviewable staging deployment. Routine internal/API decisions are yours; visual or behaviour changes are not. If a genuine incompatibility requires an approved UI change, record the smallest proposed exception with the reason and evidence. Do not silently substitute your own design or stop at a plan. If original capabilities are absent from the mock-up, record and reconcile them rather than deleting them.

Deliver: a staging link; original and target commits; a concise change summary; completed parity/demo matrices; paired visual evidence; backend/migration and two-account test results; physical-device results or explicit outstanding checks; an exception list; and a rollback plan. Do not claim production readiness based on reference tests alone. Present this concrete result to Nick for approval before production cutover.

