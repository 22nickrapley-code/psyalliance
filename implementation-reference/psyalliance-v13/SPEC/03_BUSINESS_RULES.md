# Hard workflow rules

## Network and matching

There are exactly four relationship tiers, in order: **Trusted Colleagues** (user-selected), **Worked with Before** (meaningful collaboration), **Suggested by PsyAlliance** (relevant fit/useful contributions), **Everyone else**. Ordinary messages or reactions alone do not establish Worked with Before. Preserve the reference's meaningful agreed-work behaviour and its specific person-level explanations. Do not infer a prior collaboration merely from contact.

Eligibility always comes before relationship ranking. Validate each client's state/licence, setting, prescribing, main/secondary treatment areas, age, insurance, language and applicable location requirements separately. The full controlled vocabulary is in `data.js`; map it to the original product's taxonomy deliberately rather than truncating it or treating the first two specialties displayed on a card as the person's full capability set.

## Cover

- Opening step keeps plan name, dates, applicable states and all six reasons: short planned absence, extended leave, unexpected absence, closing/reducing practice, reciprocal arrangement and Other.
- Support up to 20 separate anonymous client entries. Keep detailed requirements, save/edit/remove and duplicate requirements. Duplication makes an editable independent client, clears recipient/response/assignment state and allocates a unique monotonic identifier; removing the highest ID must not cause reuse.
- Main need and Also use the same treatment-area list. Preserve older nonstandard saved draft text visibly until the user selects a valid list value; do not silently discard the draft.
- By client and By colleague matching agree. Explain which clients a colleague can cover and why, and exclusions separately for every client. Bulk selection only prepares the plan. Never force eligibility, copy one client's eligibility to another or send before review.
- Sender chooses sequential or parallel outreach and a response deadline. Explain progression before sending. Sequential outreach advances after decline/deadline; discussion pauses it. Production scheduling must work while browsers are closed.
- Acceptance assigns that colleague for that client and closes competing open invitations transactionally. Late/competing acceptance cannot create a second assignee.
- **Cover agreed** is acceptance. **Handover ready** requires the plan owner's explicit confirmation of the checklist: start/urgent contact arrangements; secure handover information; client communication. Acceptance never checks these automatically. Every client must be ready before completing the plan.
- Tracking prioritises unfinished work in plain English and collapses completed client arrangements. Preserve all requirements, colleague responses, histories and checklist detail.
- Own plans and colleagues' plans remain explicitly separated. Calendar shows both, with ownership filters, date details and overlapping plans. Drafts have meaningful fallback labels and deliberate deletion; they are not live arrangements.

## Referrals

- One anonymous client need per referral, with detailed requirements and matching/review. Main need is a controlled-list menu. Matching/review/tracking clearly identify a **Client referral**, including treatment area and reference number.
- Profile/Hub-targeted referrals retain that colleague, check all eligibility, explain any exclusion and select no automatic substitute for an ineligible pinned person.
- Preserve audience options and recipient review. Outgoing and incoming referrals remain distinct. Positive responses require a current-capacity affirmation; a recent profile confirmation is not sufficient by itself.
- Interest is not placement. Owner explicitly chooses/confirms the receiving colleague and closes competing requests. The visual journey distinguishes request sent, replies/interest and placement confirmed.
- Exhausted offers show no open offers and an actionable route to another eligible unasked colleague. Only an active owner can add an unasked eligible person or withdraw. Withdrawal records closure, preserves previous response/history/context and does not create placement. No late response or placement after withdrawal.

## Consult

Keep question/context, explicit audience selection, recipient review, privacy confirmation, posting, full history, Following, search, tags/group context and pagination. Preserve the specific audience options in the source. New replies appear at the top; the label is **Newest first**. The reaction label is **Useful**. Reaction/message activity alone does not create a Worked with Before relationship. Hub newest-reply previews do not reorder or merge the underlying histories.

## Messages

Outer inbox is grouped by colleague and shows the latest sent/received message, its context and time/unread state. Opening the preview opens that exact context. Several conversations with one person keep separately labelled identities/histories, including different Cover clients in one plan, different plans, referrals and direct/group contexts.

Use stable conversation IDs incorporating the actual context identity and membership, never just the colleague ID. Drafts, attachments, audio drafts, unread counts, search matches, notifications, retries and deep links must retain the correct conversation. Switching context or receiving a delivery update must not erase or relocate a draft.

Preserve Sending, Sent and Failed states. Retry reuses the same logical message ID, destination and idempotency key. Repeated taps/reconnect must not duplicate the message. Composing the next message remains immediate while a prior send completes. Use real authenticated backend delivery, persistence and receipt semantics; do not represent a local timeout as delivery.

Keep existing file/audio recording, playback/preview/removal and sending controls. The reference file limit is 20 MB; preserve or explicitly reconcile stricter existing production rules. Blob URLs/IndexedDB are not a production attachment store. Request microphone access appropriately, handle denial/failure and verify real media across refresh/reconnect/devices.

Always preserve the compact reminder: **No names, dates or details that identify a client.**

## Availability and resources

Availability is confirmed through day 90 and stale from day 91. Stale profiles stay searchable but are excluded from confirmed-available-now results. Show confirmation age wherever capacity affects a decision. Provide one-tap confirmation when unchanged without discarding an unsaved availability edit.

Spaces are **one overall number** across licensed states. Virtual/in-person settings are per licensed state. Never multiply spaces by the number of states. Recent confirmation does not guarantee an opening. Referral positive responses ask for current capacity again.

Library retains search over the full collection, filters, saved resources, pagination, actual PDF links/downloads and contextual workflow resources. The 20 supplied PDFs are unchanged, byte-verified and included; existing professional-review-pending status must remain until an actual approved review changes it. Do not invent professional/legal approval.

