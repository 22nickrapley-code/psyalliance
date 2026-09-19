-- CAQH ProView is the industry-standard credentialing data portal that
-- 90%+ of US commercial insurers (Aetna, UHC, Cigna, BCBS, plus behavioral
-- health networks like Optum/Magellan) require before processing a
-- provider's insurance-panel application - a well-established fact in
-- credentialing guidance, not specific to this platform. It sits alongside
-- the license/CE/insurance-panel tracking already built here (0018), and
-- CAQH profiles require re-attestation at least every 120 days or the
-- profile goes inactive and panel applications/claims can stall - the
-- "120-day rule" is CAQH's own well-documented requirement. Tracking a
-- provider's CAQH ID and last-attested date here lets the same
-- expiry-reminder pattern already used for licenses/panels cover this too,
-- rather than a psychologist finding out only when a payer rejects them.
alter table profiles add column caqh_provider_id text;
alter table profiles add column caqh_last_attested_date date;
