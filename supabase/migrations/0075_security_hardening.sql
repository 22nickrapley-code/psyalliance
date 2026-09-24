-- Security advisor follow-ups.

-- Trigger and helper functions are not part of the public API.
revoke execute on function public.advance_cover_outreach() from public, anon, authenticated;
revoke execute on function public.guard_block_connection() from public, anon, authenticated;
revoke execute on function public.guard_block_message() from public, anon, authenticated;
revoke execute on function public.guard_block_participant() from public, anon, authenticated;
revoke execute on function public.guard_licence_review() from public, anon, authenticated;
revoke execute on function public.has_active_licence(uuid) from public, anon;
revoke execute on function public.network_licence_states() from public, anon;
revoke execute on function public.viewer_is_demo() from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.has_active_licence(uuid), public.network_licence_states(), public.viewer_is_demo(), public.is_blocked_between(uuid, uuid) to authenticated;

-- Blocks are private: a member may only ask about pairs that include
-- themselves (the database's own triggers run as the acting member).
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case
    when auth.uid() is not null and auth.uid() <> a and auth.uid() <> b then false
    else exists (
      select 1 from blocked_members
      where (profile_id = a and blocked_profile_id = b)
         or (profile_id = b and blocked_profile_id = a)
    ) end;
$$;

alter function private.html_escape(text) set search_path = public;
alter function private.email_frame(text, text, text, text) set search_path = public;
