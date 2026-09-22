-- Rebuild Phase 4, batch 3: Referrals rebuild (Master Brief #23-24), part
-- 1 of 2 - new enum values only, since Postgres won't let a value be used
-- by another statement in the same transaction it was added in. The new
-- audience/criteria columns that don't depend on these values land in the
-- next migration.
--
-- Master Brief's referral lifecycle: Need identified -> Matches found ->
-- Referral sent -> Interested/unavailable/question -> Professional
-- connection -> Warm handoff/transition -> Closed. "Matches found" is a
-- computed, not a persisted, state (the matching function's own output);
-- the rest map onto referral_requests.status (request-level) and
-- referral_responses.status (per-responder). Existing values ('open',
-- 'matched', 'offered', 'accepted', etc.) are kept - nothing is removed,
-- existing rows keep meaning what they already meant.
alter type referral_status add value if not exists 'sent';
alter type referral_status add value if not exists 'connected';
alter type referral_status add value if not exists 'handoff';
alter type referral_response_status add value if not exists 'interested';
alter type referral_response_status add value if not exists 'unavailable';
alter type referral_response_status add value if not exists 'question';
