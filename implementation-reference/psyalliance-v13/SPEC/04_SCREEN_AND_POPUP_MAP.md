# Source map and state coverage

All paths below are under `reference/dist/`. Start with `app.js` and search the named functions/actions. `index.html` supplies CSS/script order. `data.js` supplies fictional clinicians, vocabulary, sample conversations/discussions and illustrative resources; `library-pack.js` adds the supplied PDFs.

| Area | Principal implementation | Required views/states |
| --- | --- | --- |
| Shell | `render`, `navigate`, `viewContent`, `syncSidebar`, `linkNames` | Seven navigation pages, mobile drawer/bottom bar, breadcrumbs, profile links, unread shortcut, focus/hover |
| Hub | `homeView`, `actionItems`, `hubInvitation`, `hubAvailability`, `hubNetwork`, `hubColleague`, `hubPeoplePageSize`, `homeDiscussions`, `pulseDiscussionList`, `pulsePeople` | Collapsed/expanded actions, zero/one/many actions, independent plan tasks, Consult All/Following/empty/new reply/paging, trusted/suggested/all people reachable, capacity fresh/stale/closed |
| Cover overview/calendar | `coverView`, `planRow`, `incomingCoverStatus`, `visiblePlans`, `calendarView`, `calendarPlans`, `calendarAgenda`, `draftBanner` | Own/incoming, active/past, list/calendar, month/scope/day, overlap, saved/deleted draft |
| Cover creation | `startWorkflow`, `coverModal`, `needFields`, `saveClient`, `duplicateClient`, `allocateClientId`, `matchingControls`, `colleagueMatching`, `matchList`, `bulkSelect`, `eligibilityExclusions` | Four steps; reasons/states/dates; 1/20 clients; add/edit/remove/duplicate; both matching views; bulk mixed eligibility; review/mode/deadline/recipient order |
| Cover tracking | `planModal`, `handoverModal`, `counts`, `unfinishedSummary`, `beginRequests`, `answerCover`, `advanceQueue`, `processTimeouts` | Clients/Colleagues/History, pending/discussing/accepted/ready, collapsed ready rows, disabled incomplete completion, cancelled/completed read-only, response history |
| Referrals | `referralsView`, `referralRow`, `referralStatus`, `referralModal`, `referralRecipients`, `referralModalDetail`, `referralJourney`, `answerReferral`, `withdrawReferral`, `addReferralColleague` | Three creation steps, pinned eligible/ineligible, audiences/review, outgoing/incoming, current-capacity response, interest/placement, no open offers, add/withdraw/history |
| Consult | `consultView`, `consultMatches`, `consultResults`, `peerModal`, `peerRecipients`, `audienceTiles`, `discussionModal` | Two question steps, all audiences/recipient review, search/empty/clear/paging, Following, full/newest replies, Useful, group context |
| Network | `networkView`, `circleMarkup`, `circleLegend`, `filteredPeople`, `directoryContent`, `directoryResults`, `personCard`, `relationshipReason`, `profileModal` | Four tiers, circle/directory, all filters, no-result recovery, specific reasons, profiles/trust/message/targeted referral, stale availability |
| Messages | `messagesView`, `inboxList`, `threadActivity`, `messagePreview`, `threadTime`, `threadContent`, `composerContent`, `messageBubble`, `openThread`, `openPersonMessage`, `coverConversation`, `referralConversation`, `dispatchMessage`, `refreshDelivery`, `sendMessage`, `startRecording`, `sendAudio`, `storeFile`, `restoreFiles` | Grouped latest-message inbox, expanded contexts, unread/search/deep link, separate drafts, sending/sent/failed/retry, next draft while sending, attachment/audio states, message options/edit, mobile back/composer |
| Availability | `availabilityModal`, `collectAvailability`, `syncViewport` and reconfirm actions | Open/closed, one total, per-state virtual/in-person/city, unsaved draft/close/reopen, unchanged confirmation, 90/91 days |
| Library | `libraryView`, `libraryMatches`, `libraryResults`, `workflowResource` | All/Saved/collections, query across all pages, empty/recovery, resource detail, save/PDF/download, open from workflow and return |
| Invitations | `hubInvitation`, `invitationForm`, `captureInvite`, `inviteNote`, `invitationText`, `invitationReview`, `invitationPrompt` | Purpose, personal note, saved draft, review/edit/copy, contextual entry and draft return, no hidden sending/access grant |
| Pop-up system | `openModal`, `closeModal`, `modalShell`, `renderModal`, `captureWorkflow`, `saveFlow`, `syncViewport` | Focus trap/return, nested back, backdrop/Escape, preserved drafts, fixed heading/progress/footer and one main scroll body |

## Rendered pop-up kinds

The source's `renderModal` recognises the following. See `source_inventory.json` for the automatically extracted list and form IDs.

- Workflow (`coverModal`, `referralModal`, `peerModal`) and plan details.
- Handover checklist, colleague profile and referral details.
- Referral withdrawal, additional-colleague selection and referral capacity confirmation.
- Consult discussion and availability editor.
- Directory/search overlay, global search and new-message chooser.
- Calendar date details and draft-delete confirmation.
- Ask-cover/ask-referral clarification, placement confirmation, plan cancellation and replacement-cover matching.
- Preferences/settings, group, resource, invitation form/review and notifications.
- Message editing.
- Preview controls and reset confirmation are **demo/test-only**, with isolated fixtures.
- `all-actions`/`other-actions` are compatibility handlers; the current Hub expands its complete list inline. Do not resurrect the old headline/remaining-actions UI merely because legacy handlers/styles exist.

## Forms and interactions that must remain connected

Cover plan/client/send forms; referral need/send/add/capacity forms; question and reply forms; handover and availability forms; directory filters; invitation form; direct/context message composer and edit form. Search by form ID in the code to find validation, input/change autosave and submit handlers. Copying templates without these handlers is incomplete.

The source inventory also lists action-handler kinds. It is a static coverage aid, not proof every case is a currently visible screen. Map actual rendered entry points through the UI rather than exposing every internal handler as a new button.

