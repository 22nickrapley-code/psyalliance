# Connect the exact UI to the original product

## Inspect and map before coding

Record the original repository/branch/commit, framework, authentication and authorisation model, database/schema/migrations, worker/API/service boundaries, job scheduling, notification/email service, media storage and demo isolation. Read its existing instructions and tests. Complete `verification/backend_mapping.csv` with actual locations and the intended adapters. Do not invent service APIs from the mock-up.

Prefer reusing the approved component markup, CSS and assets while mapping existing records into the view models. Keep live record IDs opaque and stable. The prototype's strings such as `cover-1-2-maya` illustrate distinct context identities; they are not a demand to rewrite existing production IDs to those strings.

## Required server guarantees

| Concern | Production requirement |
| --- | --- |
| Membership/licensing | Existing real verification and permissions remain authoritative. Fictional profile labels are not licence evidence. Validate recipient competence/requirements using approved real data. |
| Cover selection/sending | Revalidate eligibility and authorisation for every client/recipient at send time. Bulk UI selection is not a permission grant. |
| Acceptance | One assignee per client, transactionally. Close competing requests atomically; reject or harmlessly acknowledge duplicate/late replies. |
| Handover/completion | Owner-only checklist confirmation; completion blocked unless all client handovers are ready. Do not trust a client-set status. |
| Deadlines/discussion | Persist sender-selected deadline, request state and discussion pause. Scheduler advances while browsers are closed; jobs are idempotent. |
| Referrals | Capacity affirmation on positive response, separate interest/placement, owner-only confirmed placement/withdrawal/addition, no duplicate recipient, no late action after closure. |
| Messages | Authorised conversation membership/context; stable conversation/message IDs; per-message idempotency; correct unread/notification/search routing; retry/reconnect without duplication. |
| Drafts | Save by authenticated account and exact conversation/workflow identity. Switching contexts, media processing or delivery callbacks never move/erase another draft. |
| Media | Durable protected object references, not expiring local blob URLs. Validate size/type and authorisation, handle recording/upload/retry failures, preserve media drafts and refresh/reconnect behaviour. |
| Availability | One overall capacity, per-state settings, persisted confirmation time, inclusive 90-day rule and day-91 exclusion from confirmed-available-now queries. |
| Consult | Audience enforced before reading/searching/replying/notifying; correct recipients and group membership; full history and newest-first ordering; Following/Useful persistence. |
| Invitations | Valid product link lifecycle and intended recipient flow; copy does not secretly email; no grant of private-preview access; separate invitation/acceptance/trusted status. |
| Demos | Isolated fictional records/accounts; no production mutation/delivery; correct reset/resume/expiry; same approved components and rules. |

Treat timezone formatting and date-only cover ranges deliberately. Persist absolute request timestamps and use the chosen local display format. Test deadline boundaries, retries and interrupted jobs with a controlled clock, not blocking waits.

## Preserve existing records

Take a recoverable source checkpoint and appropriate data backup before any migration. Map old plan/client/request/referral/context/message/attachment IDs and statuses to the target model. Dry-run on a representative isolated copy, checking row counts, ownership, foreign keys, history, drafts, ordering and media references. Make backfills restartable/idempotent. Document rollback and any irreversible operation explicitly.

Do not reset users, create duplicate conversations, flatten different client threads into one colleague thread, mark old acceptances as handover-ready, multiply capacity by licensed states or infer placement from an interested reply. Do not silently discard unknown saved requirement values; flag/reconcile them visibly as the reference does.

The prototype retains its local storage key and adds optional fields; this is not a production migration script. The static `me` persona, client-side authorisation, fallback profile lookup, `state.failNextMessage`, `setTimeout` delivery, browser-triggered deadline processing and IndexedDB file store are **not production implementations**.

## Preserve original capabilities

Record original features that are not represented in the reference and their affected entry points. Keep them working and reconcile their approved UI treatment with Nick; absence in a mock-up is not permission to delete them. Keep authentication, verified account lifecycle, existing data-protection boundaries and admin capabilities intact. Avoid changing infrastructure/services merely to port a visual design.

