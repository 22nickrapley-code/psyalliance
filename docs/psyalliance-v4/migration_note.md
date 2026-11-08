# 0130_v4_final.sql: what it changes and how to undo it

Run once on the sandbox, then once on live, after 0129. Safe to run again: new columns use `add column if not exists`, every function is `create or replace` written out in full, and the one-off steps (fresh founding places, NY and MA building their founding circle) record that they have run.

## New settings and tables

- `app_config.ai_enabled` (starts `false`): the "AI tech enabled" switch. One per site. `app_config.membership_price_cents` = 3000.
- `ai_usage`: AI uses per member per day (limit 20).
- `membership_activations`: who activated membership, in which state, founding or $30 a month. Nothing is charged.
- `founding_places_before_v4`: a copy of the founding places given automatically before v4. `founding_places` is then cleared (fresh start).

## New columns

- `coverage_requests` and `referral_responses`: `owner_agreed_at`, `confirm_reminded_at`, `confirm_lapsed_at` (the colleague confirms an agreement recorded after a discussion).
- `referral_requests.owner_closed_at` (Close), `referral_requests.details_changed_at`, `coverage_plans.details_changed_at` (Change details).
- `profiles.founding_priority_at` (original approval order of members approved before v4).
- `open_states.founding_circle` (true for NY and MA to start).

## New functions

`ai_status`, `ai_take`, `admin_set_ai`, `admin_ai_overview`, `cover_agreement_reply`, `referral_agreement_reply`, `cover_end_plan`, `cover_change_details`, `referral_change_details`, `referral_close`, `continuity_still_correct`, `my_membership`, `activate_membership`, `admin_membership`, `admin_set_founding_circle`, `founding_circle_states`, and private helpers. A job, `pa_agreement_deadlines`, runs every minute: the 24-hour reminder, the 48-hour point, and in the sandbox the fictional colleagues confirming.

## Replaced functions (same calls as before)

`cover_confirm`, `choose_referral_colleague`, `referral_place`, `cover_create_plan` ("until further notice" for closing or reciprocal cover), `guard_referral_response_change`, `private.cover_plan_json`, `private.referral_json`, `private.cover_request_text`.

## Changed behaviour to know about

- Founding places are no longer given automatically when a license is approved (the two triggers are dropped). They are given when a member activates membership.
- A referral to the whole network is refused for a client in a state that is building its founding circle (a trigger on `referral_requests`). Admin, States, "Founding circle complete" lifts it.

## Checked

- Ran twice in a row on the local staging copy without errors, and from scratch in a full rebuild.
- `e2e/staging/v3-workflow-checks.sql` (updated for the colleague confirmation) and `e2e/staging/v4-checks.sql` (AI switch and allowance, confirmation, reminders and lapse, open-ended cover, change details, Close, founding circle, membership and founding order, Still correct): all passed, rolled back.

## Rollback

Normally: roll back the site in Cloudflare and leave the database as it is. To switch AI off without a rollback: Admin, AI, Switch AI off.

If the old site version runs on top of 0130: "Cover agreed" after a discussion will wait for the colleague (the database decides), which the old screens show as "Question asked" until the colleague confirms. Founding places are not given on approval. Ask me for a restore file if you need the 0129 functions back. Don't drop the new columns or tables.
