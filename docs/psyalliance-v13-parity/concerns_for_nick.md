# Concerns and pushback for Nick (running list)

Nick asked (26 Oct) that anything I would push back on, or keep from the original, in design, functionality or usability is raised at the end so it can be discussed. This list is added to as the port proceeds and is finalised in the hand-over report. Nothing here has been changed in the build without being listed; where a choice was needed to keep working, the default taken is stated.

| # | Area | Concern | Default taken meanwhile |
|---|------|---------|-------------------------|
| C-01 | Settings / account | The approved Settings window only offers Availability, Notification preferences and Preview controls. A real member also needs profile and licences, privacy, data export, account deletion, sign out, continuity plan, admin. None are in the mock-up. | Preview controls are removed in production (kept in demos). Extra rows added in the same row style, listed as EXC-01 for approval. |
| C-02 | Availability | The approved screen has no pause-until date, no separate Cover / Consult openness. Both exist today. | They stay on the existing Availability page, reachable from Settings. The Hub card does not show a pause. |
| C-03 | Availability copy | Copy says "After 90 days, we'll ask you to reconfirm", but reminder emails go out from day 30 today. | Reminder emails unchanged; copy unchanged. Your call. |
| C-04 | Vocabulary | The mock-up's insurer, modality and language lists differ from the product's controlled lists (28 vs 19 insurers, 40 vs 49 modalities). Session types are "Individual / Couples" in the mock-up and "Face to Face / Virtual" in the product. | Live screens use the product's lists, so what can be asked for is what profiles can carry. |
| C-05 | Worked with before | Today a consult reply counts as "worked with" in the database. The approved rules say messages and reactions alone must not. | Workspace uses cover agreed, confirmed referral placement and recorded completions only. Old pages' definition left alone. |
| C-06 | Design / navigation | The new screens and the pages not in the mock-up (profile editing, admin, documents, credentials) have two different shells. Moving between them is a full page load and looks like two products. | Accepted for now; recommend reskinning the remaining pages as a follow-up. |
| C-07 | Scale | The mock-up loads the whole directory into the browser and filters there. Fine for founding-cohort numbers; will not be at several thousand members. | Full list loaded now; paged server search is the follow-up. |
| C-08 | Engine | The approved UI is a 200 KB string-template script that re-renders whole pages. It reproduces the design exactly, but focus handling, screen-reader announcements and long-term maintainability are weaker than componentised code. | Kept as-is for fidelity. Accessibility checked in tests; findings listed. |
| C-09 | Messages | No live push; messages arrive by polling every ~20 s. | Polling now; realtime is a later option. |
| C-10 | Keyboard hint | "⌘ K" is shown on Windows and phones where it does not apply. | Left as approved. |
