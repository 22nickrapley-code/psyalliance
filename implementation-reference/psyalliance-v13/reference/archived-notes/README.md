# PsyAlliance experience

A private, self-contained implementation for reviewing the finished visual direction and interactions. This is a separate example experience and does not connect to the live PsyAlliance application or its test accounts.

The latest comparison-prototype review and verification limits are recorded in [QA_REVIEW.md](QA_REVIEW.md). The regression suite passes 39 scenario groups. The 48-hour product port is covered by [IMPLEMENTATION_HANDOFF.md](IMPLEMENTATION_HANDOFF.md).

## Included

- Responsive professional workspace with the supplied PsyAlliance logo and brand palette.
- The Hub workspace, compact discussion pagination, availability editing and personal invitation review/copy without real sending.
- Full-height mobile conversations, search, independent drafts, immediate local sending, editing, reactions, attachments and microphone recording with preview.
- Network search and filters, contextual Cover and referral conversations, consultation discussions and an example practice library.
- Combined Cover setup, anonymous needs, colleague selection, review, and read-only closed-plan history.

## Data and limitations

All members, messages and arrangements are illustrative. Changes are saved locally in the viewer's browser. Files and recorded audio use IndexedDB. There is no server delivery, shared database, real verification, push notification service or production account integration. Invitations open an email draft for the user to review and send.

The practice resources are example interface content rather than the approved document pack. Wire this interface to the existing authenticated application and its authorisation rules before any production use.

## Source

`dist/index.html`, `dist/styles.css`, `dist/app.js` and `dist/assets/` are the complete implementation. No build step or external CDN is required. Lucide icons are bundled with their upstream licence header. The logo comes from the supplied PsyAlliance brand suite.

## Revision 2 — agreed workflow rules

The visual identity and responsive shell are retained. The Home action buttons create work in contextual dialogs; the navigation opens overview screens. The review uses 18 illustrative clinician profiles and 62 treatment focus options recovered from the original controlled vocabulary.

- Six cover reasons, up to 20 anonymous client needs, per-client eligibility and explained matching, recipient ordering and review before outreach.
- Parallel invitations assign the first acceptance and close competing invitations. Sequential requests advance on decline or a sender-selected response deadline. A discussion pauses this automatic progression.
- Acceptance is **Cover agreed**. The plan owner separately confirms start/contact arrangements, a secure handover and client communication before **Handover ready**. An incomplete plan cannot be marked completed.
- Cover and referral overviews separate outgoing and incoming work. The Cover calendar includes both directions. Referral interest requires the sender's final placement decision.
- Relationship priority: Trusted colleagues, Worked with before, Suggested by PsyAlliance, Everyone else. Ordinary conversations and useful marks do not count as prior work. Prior-work status follows an agreed cover arrangement or placed referral; useful responses can inform suggestions.
- Availability is one shared pool of spaces, with virtual/in-person settings per reviewed state. It remains current through day 90. Older confirmations stay searchable but are excluded from confirmed-available searches.
- Peer questions have explicit audiences and review, full reply history, following and private useful marks.

In this self-contained preview, outreach, replies and handover state are browser-local examples. Sequential deadline progression runs while the page is open or when revisited. Production rollout needs server-side scheduled progression, transaction-safe assignment, authorisation, delivery, identity and fresh availability integration.

## Current original-code review

The current `src/app/dashboard/cover/actions.ts`, `views.tsx` and `src/lib/coverage.ts` were read through GitHub. The original code sets covered status on acceptance, then shows handover guidance without a separately persisted readiness confirmation. It queues sequential requests but the reviewed outreach action has no sender-selected response deadline. The original per-client criteria and the practical handover guidance informed this revision.

The supplied global document pack is not modified by this interface revision. Example practice resources remain illustrative.

## Earlier revision verification

Twenty-five state/template checks passed, covering seven views, 20 clients, eligibility before ranking, first acceptance, sequential expiry, paused discussions, handover confirmation, closed-plan guards, 90-day availability, referral placement/context isolation, relationship signals, complete discussion histories, independent drafts, escaping and reset/autosave isolation.

Actual browser checks completed on the published private review page: a two-client Cover setup through matching, review, sending, simulated acceptance and owner handover confirmation; incomplete-plan completion stayed disabled. A prescribing referral matched psychiatrists only and proceeded through review into response tracking. A question was reviewed for two named recipients, posted and followed automatically; an existing full discussion accepted a fifth reply. Availability was updated to add in-person New York settings while retaining two overall spaces.

At a 390 × 844 browser viewport, the Cover opening and matching dialogs had no horizontal body overflow; the action footer remained within the viewport. Directory filters excluded stale confirmations. The calendar showed 42 date cells and the mobile agenda included both directions of cover. A mobile message sent immediately, its composer ended at the viewport bottom, and the single privacy sentence appeared once. The 91-day reminder appeared and cleared after reconfirmation. Browser console errors were absent during the checked flows. Mobile side-menu layering and hidden-menu focus were corrected during the review. This is viewport emulation; microphone capture and physical-device keyboard behaviour still require device testing.

## Refinement revision — October 2026

The existing visual design is retained with tighter choices and cards, consistent Home / Cover / Referrals / Consult / Network / Search / Messages / Library navigation, a quieter Home, individual relationship explanations, clickable profile names, and non-overlapping mobile network targets. Profile referral creation carries the intended colleague, checks eligibility and never silently substitutes another recipient. The supplied original source snapshot linked profiles to `/dashboard/refer/new?state=...`, carrying a state but no colleague identifier.

Cover now supports independent requirement duplication with monotonic identifiers, both matching views and explicit per-client bulk eligibility reports. Bulk changes prepare the review; sending revalidates eligibility. Tracking prioritises unassigned clients and unconfirmed handovers, with ready clients collapsed. Inbox groups preserve underlying context identities, draft text, attachments and audio. Sending/failed/sent and retry are browser-local demonstrations; retry reuses the message identifier. Consult replies appear newest first and use the label Useful.

Availability stays inclusive through day 90, with stale confirmations excluded only from confirmed-available results. One-tap reconfirmation preserves the one overall capacity number and state settings. A positive referral response requires capacity affirmation and does not create a placement. Mobile workflows use fixed headers and actions around a single scrolling body; conversation height follows the visual viewport to accommodate on-screen keyboards.

### Migration

The existing browser storage key is retained. New attachment/audio draft dictionaries default to empty; old message identities and histories are preserved. Interrupted sending states become retryable failures on reload. Missing client sequence counters derive from the existing highest identifier, then increment without reuse. No viewer data is reset by this release. Test interactions used only the isolated local preview's browser storage.

### Current validation

`node --check dist/app.js` and `node tests/refinements.cjs` pass. Fifteen automated scenario groups exercise 20-client duplication/edit isolation/removal, mixed eligibility and main/bulk consistency, acceptance and competing invitations, sequential discussion pauses, send-time eligibility, handover guards, the 90/91-day boundary, capacity confirmation, context identity and history, stable-ID retries, relationship rules, newest replies and all workflow templates.

Browser checks covered desktop and a 390 × 844 CSS viewport: a two-client Cover plan through mixed-eligibility bulk selection, review and simulated sending; 20-client draft, removal and duplication; grouped conversations and separate persistent drafts; sending, forced failure and retry without an extra message; profile-targeted referral and prescribing exclusions; Consult audience/review/posting and two newest-first replies; fixed mobile header/footer with no horizontal document overflow; mobile network target rectangles with zero overlaps; handover checklist rejection when empty, explicit readiness, collapsed completed clients and disabled incomplete completion; referral positive-capacity confirmation and interest without placement. Mobile composer was within the viewport (top 776, bottom 809 in an 844px sheet), with the correct per-context draft restored.

These are browser viewport checks, not physical-phone tests. Real iOS/Android keyboard behaviour, microphone capture and attachment upload/playback were not retested on physical devices. Backend delivery, real accounts, concurrent acceptance and production scheduling remain unverified because this is intentionally a browser-local prototype.

## Home and peer invitation revision — October 20, 2026

Home now leads with personal orientation and the four established actions. Its attention list groups work by arrangement, prioritises incoming requests, and omits outreach that is simply waiting for a response. Cover, Referral and Consult drafts sit in a separate compact resume strip. Unread messages open the unread inbox with stale search text cleared. The trusted-circle shortcut clears directory filters so the entire selected tier is visible.

The prominent invitation card is restored, alongside colleague discussions and overall availability. Invitation wording supports building a circle, reciprocal cover, referrals and consultation. Name, purpose and editable personal note persist on input and closing. Contextual invitation entry points preserve the originating workflow and contain no case details or discussion history. Preparing an invitation does not send anything, create an account, change relationship tiers or grant access to the private preview. The message uses the general PsyAlliance website; real personal invitation links and acceptance-to-connection require backend integration. No invitation or email was sent during testing.

The owner's supplied twenty PDFs are now available unchanged in the Library, alongside six existing illustrative guides. Search covers the complete collection, including original document names; collections, eight-item pagination, personal bookmarks, actual PDF links and downloads are implemented. Related templates can be opened from Cover, Referral and Consult review and closed back to the same draft. All supplied PDFs visibly retain pending professional-review status; their content was not edited or endorsed. Original archive bytes were compared before their SHA-256 hashes were retained in the portable regression test.

Cover overview rows now use plain-English next steps rather than repeated agreement and readiness counters. Mobile typography and Library cards were made readable, header overflow at 320px was fixed, and the mobile menu opens immediately to prevent quick successive taps missing moving items.

### Verification for this revision

Nineteen automated scenario groups pass, including the prior eligibility, context, retry, readiness and availability checks plus actionable Home prioritisation, separate drafts, invitation text isolation, full-collection Library search, saved collections and all twenty document hashes. JavaScript syntax and Git whitespace checks pass.

Desktop browser tests exercised invitation purpose selection, personal editing, close/reopen persistence, review, a contextual invitation from a twenty-client Cover draft and return with all twenty clients intact, and opening a real handoff PDF resource from review then returning to that review. Library search found a document from a later pagination page by its original name; saving, the Saved collection and its real PDF link were verified. The unread Home shortcut correctly recovered from an inbox search with no results.

All seven main pages were checked at 320px and 390px frame widths, with no horizontal document overflow after fixes. The reduced 390 × 480 viewport kept the invitation footer within the sheet and left one scrolling body (306px visible / 561px content). These are viewport tests; an actual phone keyboard, physical devices, microphone capture, native clipboard behaviour and real delivery were not validated in this revision. No production product, database or real account was modified.
## Pulse revision — October 21, 2026

The former Home screen has been rebuilt as Pulse, with consistent naming and an activity icon in desktop navigation, mobile navigation, breadcrumbs and document title. The persisted internal `home` view key is intentionally retained so existing browser-local data and navigation survive the presentation change.

### Decisions and behaviour

The screen was evaluated against four user jobs: respond to work that needs me, initiate a professional task, learn from useful peers, and strengthen my network. The previous dashboard gave all content similar visual weight. Pulse gives the next actionable arrangement one prominent place, keeps four creation/search actions immediate, and makes lower-priority work and saved drafts available in a compact strip. Pending outreach without a decision is excluded from the spotlight. A caught-up state invites a useful conversation instead of manufacturing urgency. “Why this first?” explains the deterministic prioritisation; this is not an AI inference or live activity prediction.

The Exchange shows one discussion at a time with full context available on opening. Followed discussions rank first, then trusted authors, with stable order within each group. The list never mutates the underlying discussion order. All/Following filters, bounded pagination, keyboard focus after paging and an empty Following state are provided. There are no invented online counts, fabricated social proof, endless feeds or notification urgency.

The prominent invitation panel frames growth as bringing a known colleague into useful work. It retains the existing editable, saved, review-and-copy prototype flow and sends nothing. The people section switches between the user's Trusted Colleagues and actual Suggested-tier colleagues, shows person-specific reasons, links every displayed colleague to their profile, and reports confirmation age and one overall capacity number. Suggestions never establish eligibility. Recently confirmed capacity remains explicitly provisional.

The visual direction uses deep forest, large editorial typography, a brighter invitation panel and fewer bordered containers. Existing action colour meanings and avatar relationship colours are preserved. Capacity management is a compact supporting strip. Mobile order puts the invitation before the exchange; DOM order matches this sequence. The four established shortcuts still open overlays, and saved workflow drafts resume through those entry points.

### Validation

23 automated scenario groups pass. New coverage checks discussion ranking without source mutation, empty/bounded pagination, actual relationship tiers and stale capacity, next-action updates after a response, caught-up rendering and safe escaping of plan text. Existing tests cover twenty clients, duplication, mixed eligibility, acceptance versus handover readiness, outreach discussion pauses, referral capacity confirmation, the inclusive 90-day freshness rule, separate message contexts and retry deduplication. All supplied PDF hashes remain unchanged.

Browser QA exercised exact-arrangement navigation from the focus action, all four quick actions, perspective paging with retained keyboard focus, suggested-person profile navigation, invitation draft persistence and review. Desktop and 390px/320px frame layouts were inspected; Pulse had no horizontal document overflow (375/375 and 305/305 client/scroll widths with frame scrollbars). At a reduced 390×480 viewport, the settled invitation sheet footer ended at 479px, with one scrollable body (306px visible / 561px content). These are viewport checks, not physical-phone or native keyboard testing. Backend delivery, real invitations and production reliability are outside this browser-local prototype. No real message or invitation was sent.

## Pulse and arrangement clarity refinement — 21 October 2026

Integrated the accurate remaining-next-step count into the headline action, updated all four action descriptions, separated Exchange and People into tinted tiles, reduced the invitation tile and refined availability presentation. Cover and Referrals now have explicit ownership labels with blue/sand panels. Calendar has ownership filters, daily plan counts and grouped date/month details. Unsent drafts have clear fallback names and confirmed deletion; deleting a profile-targeted referral draft restores the previously parked draft.

Validation: 27 automated scenario groups pass, including calendar overlap boundaries/ownership, pending versus accepted Cover and handover readiness, isolated draft deletion, next-step counts, eligibility, messaging retry/context separation, and 90-day freshness. Browser checks covered desktop and 390px/320px iframe viewports, date details, calendar filtering, keeping/deleting Cover drafts, Referral draft deletion and Pulse interactions. No horizontal overflow in tested narrow views. Physical phones/mobile keyboards and real backend delivery were not tested; this remains a local-data prototype.
