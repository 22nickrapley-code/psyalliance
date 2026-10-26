# Every demo must use the approved product

## Inventory before changing demos

The current mock-up is fully included. The original product's repository and all of its demo routes are not. Discover them from that repository and the running app; do not assume the familiar public demo is the only one.

Search route definitions, navigation/marketing CTAs, feature flags, sandbox creation/resume/reset code, seed scripts, role/account switches, guided tours, onboarding previews, embedded frames, image/video references, demo emails, documentation/help links and tests. Trace links from the public site and from each demo, including returning-user links. Inspect any admin-managed demo configuration through authorised read-only access when available. Record inaccessible areas as outstanding.

Populate `verification/demo_route_inventory.csv` with **one real row per discovered entry point or artefact**: URL/route, source/config path, audience/persona, scenario IDs, component path, fixture/reset/isolation mechanism, updated destination, evidence and status. Expand the template; its discovery categories are not actual discovered routes. A category can be N/A only with repository/runtime evidence. Reconcile code search, navigation crawl and existing tests before saying 'all demos updated'.

## Implementation strategy

Use the same approved frontend components for production and demos, with explicit environment/data adapters. Avoid a separate stale UI copy for each tour. If the architecture requires separate builds, compare every build against the same version 13 reference and include it in visual tests. Preserve existing public demo entry URLs or intentionally redirect them to the updated experience; verify old links as well as the new default route.

Guided steps must point to the actual new controls and follow the new ordering, overlays and wording. Update tour anchors, screenshots/recordings, mobile instructions, empty/loading states and outcome screens. Remove stale 'Home'/'Pulse', oldest-first, hidden-action or edge-to-edge-sheet explanations in current visible demo content. Internal compatibility identifiers and historical release notes can retain old names.

## Fictional but coherent fixtures

Adapt the source's fictional clinicians, plans, referrals, questions and message contexts. Keep stateful, navigable examples rather than unconnected screenshots. Include own and incoming Cover/referrals, meaningful relationship reasons, varied eligibility, accepted-but-not-ready handovers, a discussion-paused sequential request, 20 clients, same-colleague multiple contexts, failed/retry delivery, stale/90-day capacity, different question audiences, saved drafts and Library resources. Details are in `verification/demo_scenarios.csv`.

Generate relative confirmation ages and response deadlines from the demo clock so the 90/91-day and timeout examples remain coherent. Use a controlled clock for repeatable tests. Keep identifiers stable within a demo session; each fresh sandbox must be independently isolated. Seed data must not appear in ordinary production records or real search results.

Reset/resume must work safely. A reset affects only that demo instance, restores the agreed fixture, and does not delete other visitors' state or real accounts. Demo actions must never send invitations, messages, placements or notifications to real people. Clearly identify simulated delivery where appropriate; do not imply that the demo has proved backend reliability.

## Required completion evidence

- Every discovered entry point is assigned to at least one updated and exercised scenario; every scenario is reachable from an intended demo or documented test route.
- Demonstrate every demo on desktop and phone widths, including overlay back/close/draft behaviour and completion/outcome screens.
- Record URLs, code/config paths, fixture IDs, automated tests and visual evidence for each row. Re-run existing demo tests after updating their expectations to the approved behaviour.
- Verify new/reset/resumed and expired-sandbox paths, role/audience isolation, no real delivery and no cross-visitor leakage.
- Any static screenshot/video/tutorial still showing the old design is an unresolved parity issue, even if the main live demo looks correct.

