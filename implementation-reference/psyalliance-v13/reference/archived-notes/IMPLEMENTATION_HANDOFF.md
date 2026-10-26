# PsyAlliance — 48-hour implementation handover

Updated 26 October 2026. This is the private mock-up reference for the next product update. The original product was not changed by this work.

## Review verdict

Keep the established visual direction: The Hub's complete, user-controlled action list, the four product actions, direct colleague invitation, subtle workflow tints and relationship avatars. Mobile dialogs now float over the blurred page, with fixed headings/actions and one scrolling body bounded by the visible viewport. The strongest gains come from completing clear journeys and reducing ambiguity.

The latest revision removes the system-selected headline action. Count all actionable tasks and let the user expand and choose; distinct handovers and discussions in one plan must both be visible. Use matching treatment-area menus for Main need and Also. Keep Client referral labels through matching, review and progress; requesting interest never confirms placement. Group the inbox by colleague while showing the actual latest message, and open its exact context. Preserve separate context histories/drafts and stable message IDs through retry. The current verification record is in [QA_REVIEW.md](QA_REVIEW.md): 49 automated groups plus desktop, 320px, 390px and reduced-height browser checks.

The current Hub composition also replaces text-heavy summaries with an actual latest-reply preview and actionable colleague cards. Availability sits below the compact invitation on desktop; the two columns align. Colleague windows show one/two/three cards across phone/tablet/desktop, with accurate counts and no empty final slots. Message and Refer a client use the existing identity-preserving routes. Reopening the same targeted referral resumes its draft. Keep this as a presentation layer over the existing records; no migration/reset is needed. The current suite has 49 scenario groups, and this revision was browser-checked at desktop, 900px, 390px and 320px. See the newest QA section for the precise coverage and limits.

The fresh review found and corrected four concrete gaps:

| Finding | Implemented behaviour | Required production acceptance check |
| --- | --- | --- |
| A declined referral could retain an In discussion label | Explicit Awaiting replies, Needs your reply, Interest sent, Not available, Needs a colleague, Placed and Withdrawn states | Exercise every transition with sender and recipient accounts; never infer placement from interest |
| Active referrals had no clear exit or recovery route | Owner can withdraw after review; closed requests retain previous responses and conversations. Owner can ask another unasked eligible colleague on the same referral | Authorize on the server; revalidate eligibility on send; block duplicates, late responses and placement after withdrawal |
| Old Consult questions were difficult to find | Search titles, context, topics, authors and reply history; Following stays respected; pagination clamps to valid pages; clear-search recovery | Enforce audience permissions before returning search matches, including private questions and replies |
| Text sending rebuilt the composer | Clear the existing textarea and attachment preview in place; retain focus and allow the next draft while the prior message sends | Verify on physical iPhone/Safari and Android; send/retry identity must be enforced by the backend |

Additional refinements: actionable The Hub reminder when no referral offers remain; anonymous referral reference numbers; simpler creation/discussion headings; readable mobile Consult titles; tighter mobile ownership headers; recipient rendering no longer sorts the shared source array in place.

## Suggested delivery sequence

| Window | Work | Exit condition |
| --- | --- | --- |
| Hours 0–4 | Compare this reference with the original implementation, map existing record IDs/states, take a recoverable source/data checkpoint, agree the change list | A finite implementation checklist, with existing data and identifiers preserved |
| Hours 4–16 | Port the navigation, The Hub hierarchy, section naming, ownership headers and mobile sheet/composer layout | All seven sections and creation overlays can be used at desktop, 390px and 320px |
| Hours 16–30 | Implement and verify state transitions, context IDs, drafts, eligibility, response deadlines and referral recovery | Two-account tests pass for partial acceptance, competing acceptance, paused discussion, withdrawal, placement and retry |
| Hours 30–42 | Physical-device keyboard tests, accessibility/focus pass, attachments/audio, refresh/reconnect and permission failures | No hidden composer/primary controls, horizontal scrolling or cross-context leakage in the tested devices |
| Hours 42–48 | Fix confirmed defects, rerun critical scenarios and prepare the controlled release | Recorded evidence for each critical acceptance check and a rollback path |

## Rules that must survive the port

- Eligibility is checked per client before relationship priority. Bulk selection only prepares a plan; review precedes outreach.
- Cover agreed and Handover ready are separate. Acceptance closes competing invitations for that client; the plan owner must confirm all checklist items before completion.
- Sender chooses the sequential response deadline; discussion pauses progression. Production timing must run on the server, including when browsers are closed.
- Every conversation has its own stable arrangement/client identity, draft, unread state, history and retry identity. Grouping by colleague is presentation only.
- The four relationship tiers retain their agreed priority. Messaging or reactions alone do not create Worked with Before.
- Availability is fresh through day 90 and stale from day 91. Stale profiles remain searchable. Spaces are one overall number, with per-state settings; recent confirmation is not a guarantee.
- Referral interest is not placement. Withdrawal closes open requests but retains the original record, previous replies and conversation identity.
- Privacy reminder remains: No names, dates or details that identify a client.
- The direct colleague invitation stays available from The Hub and relevant workflows. Invitation delivery and automatic connection require production implementation.

## Verified here

39 automated scenario groups pass in `tests/refinements.cjs`, including the six new referral/search cases. Browser checks covered search and empty recovery, correct declined labels, eligible follow-up outreach, keep/withdraw confirmation, retained previous replies, continued composing across Sending/Sent, and phone-sized views. The full earlier journey matrix remains in `QA_REVIEW.md`.

## Not certified by this mock-up

This is fictional browser-local data. There is no verified backend delivery, concurrency control, server scheduler, production audience enforcement or multi-device reliability. Physical-phone keyboards, microphone recording, screen-reader sessions and the full browser/device matrix remain open checks. Supplied practice/legal templates retain their professional-review-pending status.

The local data shape remains compatible with the prior preview: existing IDs and histories are preserved; withdrawal adds optional `withdrawnAt` and `beforeWithdrawal` fields only when used. No destructive reset or automatic data migration was introduced.
