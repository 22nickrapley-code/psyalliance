# Design and interaction reference

## Use the actual source

`reference/dist/index.html` declares the authoritative stylesheet order:

1. `styles.css`
2. `product.css`
3. `refinements.css`
4. `home.css`
5. `pulse.css`
6. `directions.css`
7. `polish.css`
8. `feedback.css`
9. `hub.css`

Do not copy only the first stylesheet or recreate it from a screenshot. Later files intentionally override earlier iterations. Internal identifiers containing `home` or `pulse` are compatibility details; they do not authorise those labels in the UI.

The frozen font stack is `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. There is no bundled Inter font file or external font download. Compare both apps in the same browser/OS so fallback typography is comparable. Do not silently substitute a new font. Bundled Lucide icons and their licence header are included. Preserve `assets/logo.svg` and `assets/favicon.png`; the compact sidebar uses the icon mark.

Core tokens in `styles.css` include forest `#203b32`, forest-dark `#142b23`, green `#3f6958`, sage `#e9efea`, cream `#f7f6f1`, ink `#26352e`, muted `#778079`, line `#e5e9e3` and gold `#a38a55`. Component-specific colours, sizes and effects must come from the complete CSS cascade, not this abbreviated list.

## Shell and naming

Navigation order: **The Hub, Cover, Referrals, Consult, Network / Search, Messages, Library**. Page titles, breadcrumbs, mobile navigation and buttons use the approved product names. The four Hub shortcuts open creation/search overlays; navigation opens overview pages. The Hub uses the grid icon. Any displayed person's name opens that person's profile, preserving the originating workflow/draft.

Cover, Referrals, Consult and Network retain their existing action colours and subtle page/workflow tints. Relationship colours belong to avatars and relationship labels. Status colours express actual state or urgency. Sent versus received is communicated by explicit ownership labels and the blue/sand treatment, not red/green direction coding. Meaning remains readable without colour.

## The Hub

- Accurate count expands the complete set of required actions. The user chooses what to do. Cover discussions, unfilled needs and unfinished handovers can appear as separate tasks within one plan. Opening a task does not resolve it. Pending outreach, drafts and completed work do not inflate the count.
- Four compact, individually tinted shortcuts retain their exact labels/descriptions.
- Consult shows author, question, actual participants and the newest reply preview. Full question text/history remain in the discussion dialog. All/Following and compact pagination work with empty/bounded states. Do not invent online counts or activity.
- Desktop Consult aligns with the invitation/availability rail. The invitation remains visible and actionable. Availability shows a single total, confirmation age, licensed-state settings, Edit and Confirm unchanged. No capacity graphic or invented aggregate.
- Colleague cards expose relationship, treatment areas, reviewed licence states, one overall availability number and confirmation age. Suggested colleagues have specific reasons. Message opens a direct context; Refer a client preserves the chosen person while checking requirements. Reopening the same targeted draft resumes it.
- The colleague window is one card at widths up to 760px, two at 761–1100px, and three above 1100px. Arrows move the visible window by one colleague, with accurate counts, clamping and full final windows. Every colleague stays reachable.

## Pop-ups, phones and keyboards

Substantial workflows stay in rounded, inset overlays over a visible blurred background. The final `feedback.css` mobile rule uses 28px vertical/14px horizontal inset, reduced to 9px in compact viewports, with a 7px backdrop blur. Use the final source cascade for the full contract. Do not substitute the earlier edge-to-edge sheets.

Keep fixed headings, progress and primary actions with **one main vertical scrolling area**. Avoid nested scrolling for long saved-client lists, state selections and recipient lists. Fields and native dates use consistent mobile typography and fit their columns. Footer controls never cover editable content.

Preserve `syncViewport()`, visual-viewport height/top handling, keyboard-related field visibility, background scroll containment, modal focus trap, return focus, Escape, dialog stacking/back and draft restoration. Mobile chat may fill its conversation viewport; this is distinct from the inset workflow pop-ups. Composer, privacy reminder and send/media controls stay visible when the keyboard reduces the viewport.

Physical iPhone/Safari and Android keyboard/media checks remain necessary. Reduced-height desktop/iframe testing is not equivalent. Check touch targets, focus rings, labels, long names/options, landscape/rotation, no horizontal document overflow and reduced motion.

## Content density and states

Keep compact cards, specific explanations, clear next steps and full detail available on demand. Do not replace the source with a long generic dashboard or an endless feed. Do not reintroduce the oversized green manifesto, a 'pick up a draft' strip, abstract section labels, repeated status counters or a system-chosen priority action.

For visual comparison capture the same fixture/state at 320×700, 390×844, 900×760 and desktop (1365×900 and/or 1440×1000), plus 390×390 short viewport. Compare initial pages, scrolled content, overlays, dropdowns, hover/focus, errors, disabled controls, empty lists and long workflows. Dynamic timestamps/record content must be aligned or explicitly identified; do not use broad image-diff exclusions that conceal layout drift.

