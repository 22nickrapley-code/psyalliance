-- 0123: one definition of "unread messages" for the whole product (Release A, finding F01).
--
-- The workspace has always counted unread MESSAGES: messages written by someone else, not deleted, newer than the
-- member's last read of that conversation, and (in group conversations) not from someone they have blocked.
-- The account pages (Profile, Settings, Documents and so on) counted something different: conversations with any new
-- activity, plus company notices. This function gives the account pages the workspace's own number. Company notices
-- and other notifications are counted separately, on the bell.
--
-- Additive and safe to run on its own: it adds one read-only function and changes no table or row.
-- If it has not been run, the account pages fall back to the older count and nothing breaks.
--
-- Rollback:  drop function if exists public.my_unread_message_count();

create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(sum(u.n), 0)::integer
    from (
      select (
        select count(*)
          from conversation_messages m
         where m.conversation_id = cp.conversation_id
           and m.deleted_at is null
           and m.author_id <> cp.profile_id
           and m.created_at > cp.last_read_at
           and (g.size <= 2 or not public.is_blocked_between(cp.profile_id, m.author_id))
      ) as n
        from conversation_participants cp
        cross join lateral (
          select count(*) as size from conversation_participants x where x.conversation_id = cp.conversation_id
        ) g
       where cp.profile_id = auth.uid()
    ) u;
$function$;

revoke all on function public.my_unread_message_count() from public, anon;
grant execute on function public.my_unread_message_count() to authenticated;
