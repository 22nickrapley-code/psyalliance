# Final product decisions (Nick and Claude, 27 Oct 2026)

The goal: one final product that combines the best of the original product and the approved mock-up (v13), built once and then tested end to end by Nick. Each decision below is Nick's, taken in conversation. Concern numbers (C-xx) refer to `concerns_for_nick.md`.

## Round 1: shell, safety, supervision, contrast

| # | Question | Decision | What it means for the build |
|---|----------|----------|------------------------------|
| D-01 | C-06: pages the mock-up does not cover (profile editing, documents, continuity plan, credentials, notifications, physician referrals, admin) | **Reskin them into the new shell.** | One sidebar, tokens and components everywhere. Functionality of these pages unchanged underneath. A new build task per page, tested for parity with today's behaviour. |
| D-02 | C-25: report and block | **Add both, small and quiet.** | "Report" text link in the discussion window (question and reply) and a "Block" row in the profile window, in the approved styles. Reports go to the existing moderation queue; block uses the existing database rule. |
| D-03 | C-27: Supervision | **Hide for launch, keep the data.** | No Supervision tab or page in the final product's screens. Tables, rules and routes stay so it can return. |
| D-04 | C-37: contrast | **Darken slightly, keep the look.** | Small muted text colours move to the passing values in `a11y_contrast_findings.csv` (same hue, median 3 points darker); the amber badge a little darker. Recorded as an approved exception to the frozen CSS. |
