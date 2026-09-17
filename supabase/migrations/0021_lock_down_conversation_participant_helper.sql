-- The function defaults to EXECUTE granted to PUBLIC (standard Postgres
-- behavior for newly created functions), which is what let the anon role
-- call it directly via RPC per the security advisor. It only needs to be
-- callable from within RLS policies (as the defining role) and, at most,
-- by signed-in users - never by anonymous requests.
revoke execute on function is_conversation_participant(bigint, uuid) from public;
revoke execute on function is_conversation_participant(bigint, uuid) from anon;
