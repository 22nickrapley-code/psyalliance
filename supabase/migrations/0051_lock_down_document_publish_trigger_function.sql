-- Supabase's security advisor flagged enforce_document_publish_requirements()
-- (added in 0049) as directly callable via PostgREST RPC by anon and
-- authenticated. It's a trigger function only - it should never be invoked
-- directly (new/old aren't even set outside a trigger context) - so its
-- API-facing EXECUTE grant is revoked here. The trigger itself keeps
-- working; only direct RPC calls are blocked.
revoke execute on function enforce_document_publish_requirements() from public, anon, authenticated;
