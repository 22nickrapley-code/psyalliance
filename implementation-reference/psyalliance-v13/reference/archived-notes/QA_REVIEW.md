# PsyAlliance mock-up release review — 21 October 2026

## The Hub visual and functional revision — 26 October 2026

The current Hub keeps the complete action count/list at the top and the four established creation/search shortcuts. Each shortcut now has its own subtle workflow tint and a larger icon. The former Pulse name is The Hub throughout the product.

The desktop community area pairs Consult with a compact invitation and availability rail. Both columns finish together, removing the empty area beneath the invitation. The invitation remains a saved, personal review/copy flow. Availability shows one overall number, confirmation age and the settings for each licensed state, with Edit and Confirm unchanged controls. There is no aggregate or per-state capacity graphic.

Consult now shows the actual question author, question title, participating colleagues and the newest reply preview. The repeated full question excerpt is removed from the Hub; opening the discussion retains the complete question and history. Preview ordering reads a copy of the reply array and does not mutate conversation history. Every named person and contributor avatar opens the corresponding profile.

Colleague cards separate relationship, treatment areas, licenses and availability into scannable sections. Message opens the person's direct conversation; Refer a client starts a targeted requirements/review flow, retaining the chosen person and checking eligibility. Reopening a targeted draft for the same person resumes its saved requirements instead of creating a blank replacement. Suggested profiles retain their specific connection reasons. Full capacity is neutral, stale capacity explicitly asks for confirmation, and relationship colours remain attached to avatars/relationship labels.

Colleague browsing shows one card on phones, two at the tablet breakpoint, and three on desktop. Arrows move the visible window by one person, so every colleague remains reachable and the final desktop window has no empty card slots. Counts clamp correctly after resizing or changing groups. The compact sidebar now uses the existing icon mark rather than clipping the wordmark.

Validation: **49 automated scenario groups pass**, including responsive colleague windows, actual-newest-reply preview, immutable history, profile action identities, stale/full availability and one total across licensed-state settings. Syntax and Git whitespace checks pass. Browser checks covered desktop and 900px, 390px and 320px iframe widths without horizontal overflow. The desktop Consult and personal rail bottoms aligned. All four Trusted Colleagues were reachable on mobile; tablet rendered two cards and phone rendered one after resizing. Person-specific suggestions, discussion paging/full history, invitation close/reopen/review, direct-message draft restoration and one-tap availability reconfirmation worked. A targeted referral retained Imani, then excluded that colleague when prescribing was required with no automatic substitute; closing and reopening preserved those requirements. No real message or invitation was sent.

These are browser viewport checks, not new physical-device or native-keyboard tests. Existing prototype and backend limits described below still apply. The temporary viewport harness was removed before packaging.

## User-led Pulse and interaction review — 26 October 2026

This is the current reference. Earlier dated sections below record previous iterations; the former headline-action prioritisation and edge-to-edge mobile sheets have been replaced.

- Pulse begins with an accurate count that expands into every required action. Cover discussions, handovers and unfilled needs are separate tasks, even within one plan. The user chooses what to address. Workflow grouping does not rank importance. Pending outreach, completed work and unsent drafts do not inflate the count. Previously deferred work remains visible in the complete list.
- The oversized green headline panel is removed. The four product actions follow the compact action control. Invitation, Consult, Network / Search and availability cards remain.
- Main need and Also use the same treatment-area menu in Cover and Referrals. An older nonstandard saved entry remains visible until the user chooses a valid treatment area; no stored draft is silently erased.
- Matching, review and tracking label the anonymous client referral explicitly. A visual route connects Your client to Colleagues asked, with distinct request, reply and confirmed-placement stages. Exhausted offers and withdrawal are handled truthfully.
- Each outer inbox row shows the latest sent or received message and its context. Tapping the preview opens that exact conversation. Several contexts remain individually labelled under one colleague, with separate IDs, histories, unread state and drafts. New messages have sortable timestamps; older histories are retained.
- Mobile workflows float within rounded, inset dialogs over the visible blurred page. Fixed headings/progress and actions surround one main scrolling body. Short viewports reduce the chrome. Focus returns to a useful action after completed workflows as well as ordinary dismissal.

### Checks completed for this revision

`node --check dist/app.js`, `node tests/refinements.cjs` and `git diff --check` pass. **45 automated scenario groups** cover the prior eligibility, twenty-client, acceptance/handover, response deadline, availability, context identity, retry and PDF integrity safeguards plus complete action counts, separate tasks within one plan, dropdown parity/legacy draft retention, referral progress states and latest-message routing/order.

Browser checks covered all seven sections on desktop and at 320px and 390px iframe widths, with no horizontal document overflow. Pulse expanded five actual tasks; choosing a handover, attempting an incomplete checklist and then confirming all three items reduced the list to four while the incomplete overall plan remained blocked. Referral menus, matching/review labels, recipient review, local sending and anonymous progress were exercised. Incoming/outgoing latest-message previews, exact context opening, unread clearing, separate drafts, local sending/failure/retry and continued composing were checked; retry retained three message rows and the next draft.

Cover, Referral, Consult and availability dialogs were exercised on narrow screens. Cover and availability edits survived close/reopen. Consult recipient review, local posting, Following and two newest-first replies worked; Escape returned focus to Ask a question. At 320px the Cover dialog was inset horizontally with one scrolling body, no overflowing descendants and fixed actions. A 390×390 short-viewport check left the Cover name field above the footer; the message composer ended at 390px and its input at 355px, fully inside the viewport. Keyboard Tab/Shift+Tab stayed inside the dialog. The backdrop was visibly inset, computed as blur(7px), and the underlying app remained inert.

These are browser viewport and prototype-state checks, not physical-phone or native-keyboard tests. Physical iOS/Android keyboards, microphone capture, production file delivery, screen-reader sessions, concurrent accounts and real backend reliability were not verified in this pass. Existing attachment/audio paths are preserved. No real messages, invitations, accounts, production database or original product were changed. The temporary viewport harness was removed before packaging.

## Fresh review addendum — 22 October 2026

The current regression suite passes **39 scenario groups**. Added live Consult search with empty-state recovery and pagination clamping; corrected referral response labels; added owner-only withdrawal and additional eligible-colleague outreach on the same referral; preserved previous replies after withdrawal; surfaced exhausted referrals on Pulse; kept the message textarea stable through sending; simplified workflow headings; improved mobile Consult readability and ownership-header density. See [IMPLEMENTATION_HANDOFF.md](IMPLEMENTATION_HANDOFF.md) for the 48-hour port sequence and production acceptance gates.

The new behaviour was exercised in the browser, including narrow 320px/390px views and continued composing while a local send completes. The physical-device and backend limits listed below still apply. The following sections retain the earlier review record.

This review covers the existing private Sites mock-up. It does not certify the original product or any backend. All exercised messages, invitations, responses and placements used fictional browser-local data.

## Changes made during this review

- Removed the Pulse “Pick up a draft” selectors. Draft storage and the overview deletion controls remain intact.
- Used Consult and Network / Search labels on Pulse, matching navigation. Replaced abstract card titles with Questions from your colleagues and Your colleagues.
- Added previous/next colleague controls and an accurate range so all four Trusted Colleagues can be reached.
- Added Not now: a next step is set aside for 24 hours and can be restored immediately. This never changes a Cover, Referral, response or handover status.
- Tightened action cards and enlarged their icons; gave the mobile navigation a contrasting dark background.
- Shortened the Cover opening heading and removed the redundant introductory subtitle.
- Contained native date controls inside their grid, with consistent 16px mobile text.
- Removed the visible underlying page and second page scrollbar from mobile workflows. Sheets use fixed headings/actions and one main scrolling body, with a smaller header/progress area in short viewports.
- Fixed chat option controls that extended outside message rows and created a horizontal scrollbar. Mobile conversations now prevent background scrolling and retain the composer in a short viewport.
- Fixed narrow footer controls that could extend beyond a 320px sheet.
- Preserved keyboard focus when closing a dialog after the underlying page renders again; Escape returns to the originating action.
- Prevented one-tap availability reconfirmation from silently discarding unsaved availability edits.
- Corrected singular reply/colleague counts.

## Browser scenarios exercised

| Area | Verification |
| --- | --- |
| Pulse | Four action descriptions, product labels, Not now/restore and remaining-step count; every trusted colleague reachable |
| Cover creation | Twenty-client fixture; removal, duplication into Client 21, independent edit, both matching views, mixed eligible/ineligible bulk selection, exclusion reasons, review and local sending |
| Cover tracking | Own/incoming separation; partial acceptance; incomplete checklist cannot mark ready; full checklist does; acceptance does not mark handover ready; unfinished client keeps completion disabled |
| Calendar | Current month, month navigation, overlapping own/incoming plans, ownership filters, date details and grouped plan lists (also checked in preceding refinement) |
| Referrals | Profile-targeted creation retained colleague; requirements/matches, audience review and local sending; incoming interest required capacity confirmation and remained separate from placement |
| Consult | Question, context, privacy confirmation, recipient review, posting, automatic Following, full history and new reply; newest-first logic covered by automated checks |
| Network | Specific collaboration/suggestion reasons, profile actions, directory search, no results, clear filters, pagination and stale availability labels |
| Messaging | Grouped colleague inbox; two Maya contexts; separate drafts after switching; unread clearing/navigation; context search; local failed → retry → sending → sent with same record; compact composer |
| Library | Full collection, supplied PDF resource search, resource details, saving, PDF paths, empty search recovery. All 20 supplied PDF hashes verified by automated checks |
| Navigation | All seven desktop overview templates; mobile Pulse/Cover/Referrals/Consult/Network/Messages/Library; More menu; global search and context-labelled results; notifications |
| Mobile | 390×844 and 320×700 iframe viewports; 390×390 short-viewport simulation; Cover, Referral, Consult and availability sheets; fixed controls; page/chat horizontal overflow and background scroll containment |

## Automated scenarios

`node tests/refinements.cjs` passes 33 scenario groups. They cover 20-client IDs/cap, per-client eligibility (license, setting, prescribing, language, secondary need, insurance, age), matching-view agreement, send revalidation, sequential discussion/timeout behaviour, acceptance/competition, handover completion guard, 90/91-day availability, referral capacity, conversation identity, idempotent local retry, relationship tier rules, specific reasons, reply ordering, view/workflow rendering, invitations, PDF integrity, Library search, Pulse ranking/empty/count states, calendar boundaries, draft deletion, deferral, all trusted profiles and action-handler/reference integrity.

JavaScript syntax checks pass. The deployment uses the existing project and owner-private audience. No production product, database or real account was changed.

## Limits and release judgement

This is a finished comparison prototype for the tested journeys, not evidence of production reliability or measured user satisfaction. “All scenarios” cannot literally cover every possible input and device combination; the matrix above records the actual coverage.

Physical iPhone/iPad Safari, the native iOS keyboard and the ChatGPT preview host's Edit site controls were not directly testable here. Short-viewport testing checks layout behaviour but is not equivalent to a physical-phone keyboard test. Microphone permission/recording, real audio delivery, actual attachment upload/download persistence across browser restarts, screen-reader sessions and a complete cross-browser matrix remain unverified in this review. Existing audio/file handling was preserved and inspected; local message routing/retry tests do not verify a backend.

The original product has not been re-tested in this pass. The published mock-up is the comparison reference; backend integration and real-account acceptance testing remain a separate gate.
