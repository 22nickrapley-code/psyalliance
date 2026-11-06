# 0129_v3_corrective.sql: what it changes and how to undo it

Run once on the sandbox, then once on live, after 0128. Safe to run again: every column uses `add column if not exists`, every constraint is dropped and re-added, and every function is `create or replace` written out in full.

## New columns (all additive, with safe defaults)

- `coverage_requests.closed_reason` may now also be `owner` (you declined that colleague).
- `coverage_plan_cases.outreach_mode` (one at a time or everyone at once, per client).
- `coverage_plans.arranged_at`, `coverage_plans.auto_completed`.
- `referral_requests.outreach_mode` (default everyone at once), `response_hours`, `outreach_queue`.
- `referral_recipients.expires_at`, `closed_reason`, `closed_at`, plus an index for deadlines.

## New functions

`cover_decline`, `cover_set_recipients`, `cover_mark_arranged`, `referral_decline`, `referral_set_recipients`, and private helpers for sending the next invitation, advancing a referral queue, referral deadlines and plan auto-completion. A trigger on `referral_responses` moves a one-at-a-time referral on when someone says Not available.

## Replaced functions (same calls as before)

`cover_confirm`, `cover_complete_plan`, `cover_create_plan`, `cover_answer`, `cover_process_deadlines` (the once-a-minute job now also completes finished plans and runs referral deadlines), `cover_log_request`, `cover_event_text`, `cover_plan_json`, `referral_create`, `referral_answer`, `referral_add`, `choose_referral_colleague`, `referral_withdraw`, `referral_json`, `workspace_groups`, `workspace_tiers`.

## Checked

- Ran twice in a row on the staging copy without errors.
- `e2e/staging/v3-workflow-checks.sql` (rolled back at the end) passes all checks: V3-SEQ, AGREE, ADD, ORDER, DECLINE, R03, EXPIRY, ARR, AUTO, RSEQ, RAGREE, REXP, RDEC.

## Rollback

Normally: roll back the site in Cloudflare and leave the database as it is.

To restore the old functions as well, re-run the function definitions from 0128 and earlier for the replaced functions above. Ask me and I will put them in one restore file. Don't drop the new columns: replies already recorded depend on them, and the old functions ignore them.
