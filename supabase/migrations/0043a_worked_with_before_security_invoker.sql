-- Recovered from the live migration history (applied 22 Sept 2026, never
-- committed). Already applied on both hosted projects.
alter view worked_with_before set (security_invoker = true);
