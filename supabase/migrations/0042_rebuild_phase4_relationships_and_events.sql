-- Rebuild Phase 4 (data architecture), batch 1: the professional relationship
-- model and the professional event log. Everything else the rebuild needs
-- (Coverage, Consult, Referrals rebuild, Library governance, notifications)
-- sits on top of these two foundations, so they land first. Per the Master
-- Brief and Addendum: migrate/extend existing tables where the underlying
-- data is still good (connections, do_not_work_with) rather than replacing
-- them outright.
--
-- The new connection_tier value ('trusted_colleague') is added here on its
-- own - Postgres won't let a new enum value be used by another statement in
-- the same migration/transaction it was added in, so the data relabel that
-- uses it lives in the next migration file instead.

-- ---------------------------------------------------------------------------
-- Shared actor_type: who/what performed an action, for every event/audit
-- table the rebuild adds. Addendum Part B - required on every event/audit
-- log so a future authorised AI assistant acting on a member's behalf is
-- always distinguishable from the member acting directly in the browser.
create type actor_type as enum ('member_web', 'member_agent', 'admin', 'system');

-- Trusted Colleague keeps the *existing* connections table and its mutual
-- accept/decline flow (Master Brief #28-30) - that mechanic already matches
-- the spec ("explicitly chosen by the clinician", mutual) exactly, it just
-- needs the right label. 'partner' stays as a legacy enum value (existing
-- rows aren't rewritten out from under their FKs); the follow-up migration
-- relabels every accepted 'partner' row to 'trusted_colleague'. 'bench' is
-- left as-is for now - Addendum A8 says review and migrate useful
-- relationship data, not silently discard it, and its product fate (fold
-- into Saved Clinicians vs. drop) is a Phase 5+ (Network UI) decision.
alter type connection_tier add value if not exists 'trusted_colleague';
