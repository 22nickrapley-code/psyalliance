# PsyAlliance — exact version 13 implementation handover

This package freezes the approved interactive mock-up. It is an implementation reference, not a new design brief.

Approved reference: **version 13**, published 26 October 2026. Source commit: `ceafc8d43f573da9108212d6ee30ea5be26fd99e`.

Private preview: https://psyalliance-experience.sandy-ring-2066.chatgpt.site

The private link is a convenience. Claude can run the complete reference locally without access to Nick's ChatGPT account. Do not make the preview public to facilitate the handover.

## Nick's setup

1. Use Claude Code, or the coding environment Claude already uses to work on the **original PsyAlliance repository**. Both that repository and this package must be readable there.
2. Extract this ZIP into `implementation-reference/psyalliance-v13/` within the original repository. The ZIP contains files at its root; do not nest a second copy of the folder.
3. Paste `CLAUDE_PROMPT.md` into the Claude session. It tells Claude to inspect the current product and then carry the port through staging validation.
4. Preserve the short instructions in `CLAUDE_PROJECT_RULES_SNIPPET.md` in the project's existing `CLAUDE.md`, without overwriting its build, security or deployment instructions. This reduces drift when work continues in another session.
5. Review the staging application beside the frozen reference, including phones, pop-ups and demos. Accept a completed comparison matrix, not a statement that it is 'similar'. Production cutover comes after that concrete review.

If only using a chat-based Claude session, attach this ZIP and ensure that session can actually inspect and modify the original repository. Access to the preview link or this chat's summary alone is insufficient.

## Claude's reading order

1. `CLAUDE_PROMPT.md` and `SPEC/01_IMPLEMENTATION_CONTRACT.md`.
2. `SPEC/02_DESIGN_AND_INTERACTIONS.md` and `SPEC/03_BUSINESS_RULES.md`.
3. `SPEC/04_SCREEN_AND_POPUP_MAP.md` while inspecting the reference source.
4. `SPEC/05_DEMO_MIGRATION.md`, `SPEC/06_BACKEND_AND_DATA_PORT.md` and the verification matrices.
5. Run the reference and inspect all relevant states before implementing each area.

`reference/dist/` is the complete runnable client, with every CSS layer, icon, logo, sample dataset and PDF. `reference/tests/` is the unchanged 49-group reference regression suite. `reference/archived-notes/` contains older notes solely for audit: they include superseded names, layouts and test totals and must not override the contract or executable version 13.

## Run and verify the reference

From this extracted package directory:

```sh
node tools/verify-reference.cjs
node tools/run-reference-tests.cjs
node tools/serve-reference.cjs
```

The server prints a localhost URL. It serves only the frozen reference, binds to loopback and has no build or package-install step. Keep it in one browser tab while inspecting the original product/staging port in another. A second local port can be supplied as the first argument, for example `node tools/serve-reference.cjs 4174`.

Use a fresh browser profile for an unmodified fictional fixture. Changes are local to that browser origin. Reference storage uses `pa-experience-v2-data` plus IndexedDB for file/audio data. Its Settings → Preview controls can simulate responses, a 20-client draft, separate Maya contexts, delivery failure and the 90/91-day boundary. Reset only this isolated reference/demo fixture when needed; never reset real user data.

## What completion means

The rebuilt product reproduces version 13's appearance, labels, hierarchy, overlays and interactions, backed by the original product's real authenticated services. Every existing demo is inventoried and updated to use the same approved components and workflow rules. Target acceptance tests, paired visual comparisons, migration checks and required physical-device checks are recorded. Any remaining difference is explicit and approved; it is not silently treated as a design improvement.

The reference is a fictional browser-local prototype. Its passing tests do **not** certify the original product, backend delivery, concurrency, production permissions, physical-phone keyboards or real audio/file reliability. These must be validated in the port. See `SPEC/07_ACCEPTANCE_AND_RELEASE.md`.

## Scope of this package

The approved member workspace covers The Hub, Cover, Referrals, Consult, Network / Search, Messages, Library and their associated dialogs. It does not contain a new marketing homepage, authentication, billing or admin design. Preserve functioning original capabilities outside the reference; identify affected entry points, demo embeds and copy and reconcile gaps explicitly. Do not invent replacement designs for unrepresented areas.

The original product repository and a complete inventory of its existing demo routes were not inspected during creation of this package. Claude must discover and document them from the actual code and running app. No claim is made that a blank template is a completed demo inventory.

The attachment's 20 PDF contents were compared with the reference: all 20 match. Their existing professional-review-pending status remains unchanged.

