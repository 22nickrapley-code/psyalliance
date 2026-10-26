# Acceptance, evidence and cutover

## Required evidence ledger

Copy the CSV templates to `docs/psyalliance-v13-parity/` in the original repository and maintain them as work progresses. For every requirement, record target file/component/API, automated test, comparison evidence, result and any exception. Status is Pending, Pass, Fail, Blocked or N/A-with-evidence. An empty cell or a reference-only test run is not a production Pass.

Verify reference hashes before/after work. Run the included reference tests to understand the approved rules. Port the relevant assertions into the target's real test stack; do not report the prototype's 49 passing groups as 49 passing target/backend tests.

## Visual fidelity

Run the frozen reference and target on matching fixtures, actor, browser/OS, viewport, zoom, scroll position and selected state. Capture paired images during implementation; label reference versus target. Cover all seven sections and every relevant workflow/pop-up, including long forms/lists, validation, hover/focus/disabled states, empty states, and mobile keyboard conditions.

Use side-by-side inspection and an overlay/image diff. A numerical similarity score alone is not approval. Font antialiasing and actual timestamps can produce harmless differences; changes to font, wrapping, control positions, spacing, colour, hierarchy, visibility or workflow are not harmless. Document each accepted variance rather than enlarging a blanket tolerance or excluding a whole panel from comparison.

The package contains the exact renderable source, not an exhaustive delivered screenshot gallery. Claude must generate the comparison evidence while it can run both applications. Use the viewport/state list in `visual_capture_plan.csv`. Add rows for every discovered demo variant.

## Functional and backend tests

Exercise the full `functional_parity.csv` and `demo_scenarios.csv` matrices. Test sender/recipient/unauthorised actors with isolated synthetic accounts. Include competing acceptance, repeated clicks, late replies, withdrawing/placing races, closed-browser deadlines, paused discussions, lost/reordered delivery responses, refresh/reconnect, missing media and permission failures. Verify both visible feedback and persisted server state.

Check production data migration separately from fictional demo seeding. Verify every discovered demo entry, role/use-case, reset/resume and isolation path. Ensure old links redirect correctly where intended and no obsolete demo content remains linked.

## Devices and accessibility

Desktop, 900×760 tablet, 390×844 and 320×700 phone-width viewports, plus 390×390 short viewport. Physical iPhone/Safari and Android browser with the actual keyboard: composer, long forms, date/select controls, scrolling, footer controls, rotation, safe areas, microphone permission/recording and file selection. Check keyboard-only access, focus trapping/return, labels, touch targets, contrast and at least a representative screen-reader session.

The previous mock-up review verified browser viewports and local state. It did not certify physical phones, real media delivery, server permissions/concurrency/scheduling or multi-device persistence. Carry these forward as target checks, not inherited Pass results.

## Staging review gate

Deliver a concrete reviewable staging build, original/target commit IDs, a completed feature/visual/demo ledger, screenshots/diffs labelled by state, backend test output, migration dry-run/rollback results and a clear list of unresolved items. Nick should review the critical journeys on desktop and a physical phone alongside the reference. Do not claim the entire port is complete while an original demo or critical rule is unverified.

Production cutover follows approval of that evidence and a recoverable deployment plan. Keep rollback source, schema/data compatibility, media links, scheduled jobs and old entry URLs in the plan. After cutover run a small authorised smoke test and monitor errors/delivery/job state. This handover itself does not authorise real outreach to colleagues or clients.

## External tool guidance

Claude Code's official documentation describes selecting a project/repository and persistent project instructions. It also explicitly says instruction files are context rather than enforced configuration. This is why immutable files and acceptance evidence are required here.

- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/memory

Checked 26 October 2026. These links describe the coding tool, not PsyAlliance's product specification.

