# Implementation contract

## Authority

1. Nick's explicit later decisions.
2. This contract and its hard business rules.
3. The executable frozen version 13 source, including its final CSS cascade.
4. Current specification files and acceptance matrices.
5. Archived notes only as historical context.

Do not average earlier versions together. 'Pulse', a system-selected headline next step, hidden remaining actions, full-bleed mobile sheets and the old invitation/Consult column gap are superseded. The current page name is **The Hub**.

## Required fidelity

Preserve the source's component markup and styling wherever practical. Use the approved logo/icon assets and existing CSS layers, in order. Preserve typography and weights, colours and meanings, borders, radii, shadows, spacing, content density, icons, button labels, breakpoint behaviour, focus/hover states, selected/disabled states and motion preferences.

Preserve every approved interaction: four creation/search shortcuts versus navigation to overview pages; dialog stacks, back/close/Escape and return focus; fixed headings/progress/actions; one main dialog scroll area; draft persistence; per-context conversation identity; recipient review; explainable matching; unfinished-work summaries; action counts; search, filtering, paging, attachments/audio previews, response history and completion safeguards.

Reuse the original product's stack and services through adapters. A framework conversion may change internal structure only when the rendered result and behaviour remain equivalent. It is not permission to substitute a component library's defaults. Do not clean up or consolidate the layered CSS until parity is established and the proposed refactor is independently checked.

## Allowed environment-dependent substitutions

These are necessary production bindings, not design discretion:

- Fictional people, messages, dates, plans and counts become authorised real records using the same components, wording patterns and formatting. Demo mode retains fictional fixtures.
- Local storage/IndexedDB/timers/simulated sends become durable authenticated services, protected media storage, server scheduling and real delivery. Preserve the visible state transitions.
- Preview-only reset/failure/response controls remain in isolated demo/test tooling, never ordinary production accounts.
- Explicit 'browser-local preview' and 'delivery simulated' notices remain truthful in demos and are absent or replaced by accurate production status in the corresponding live context. Keep surrounding layout consistent.
- Example public invitation URLs become valid product invitation URLs through the real service. Copy invitation must still copy; it must not secretly send email. Preserve existing invitation services and reconcile any original send UI not represented in the reference as an explicit gap, rather than inventing a new approved screen.
- Real authorisation, validation, file security, audit events and transactional controls replace client-only checks. Never weaken them to imitate a prototype shortcut.

No other visible design/copy/journey change is pre-approved. If an unavoidable backend constraint would change the UX, record the proposed exception and obtain a concrete decision. Continue unrelated authorised work.

## Scope and data

Port all seven member sections, workflow steps and pop-ups. Inventory all original demos and update them. Preserve existing original features outside the reference until reconciled. The mock-up is not authority to delete authentication, account lifecycle, billing or administration features it does not model.

Never copy fictional licences, membership, clinical claims or sample relationships into live accounts. Preserve real IDs and histories; explicitly map state transitions and migrate using a recoverable checkpoint and a tested rollback. Do not seed or reset production data to make screenshots match.

## Working discipline

Use an isolated branch/worktree in the original repository. Preserve the frozen package byte-for-byte. Maintain `docs/psyalliance-v13-parity/` with source/target mapping, completed matrices, demo inventory, test evidence, exceptions and unresolved gaps. Carry these files across sessions. A task is not complete because components exist or a page resembles the reference.

Complete the staging build and evidence first. Nick approves the concrete comparison before production cutover. No real invitations/messages are authorised by this handover's testing instructions; use controlled synthetic accounts and isolated demo/test recipients.

