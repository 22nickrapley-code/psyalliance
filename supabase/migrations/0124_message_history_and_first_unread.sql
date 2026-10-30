-- 0124 (Release B, brief section 9): two changes to messages, both about what a member can find or see.
--
-- PART 1. Search every message, not only each conversation's latest one.
--
-- The workspace search used to match a conversation's name and its latest message, and said so on screen. This adds
-- real history search: all of the caller's own messages, newest first, up to fifty at a time (twenty by default), each result naming the
-- conversation it belongs to (by the same key the workspace uses) and the message's id so the screen can open the
-- exact message.
--
-- Who can see what is exactly what the workspace already allows:
--   * only conversations the caller is a participant of;
--   * not messages the author deleted;
--   * a two-person conversation with someone the caller has blocked (or who blocked them) is not searched;
--   * in a group, messages from people the caller has blocked are left out (the caller's own are kept).
-- It reads only. It changes no table, column, row or policy.
-- Words are matched in any order, each as a plain piece of text (no wildcards: a % or _ in the search is a literal).
--
-- If it has not been run, the screen keeps working: the search window shows the conversation matches it already had
-- and says that history search is not available yet.
--
-- PART 2. The first message in a new conversation is unread for the person it was sent to.
--
-- A conversation about a referral or a cover client is created in the same step as its first message (for example
-- when a colleague chooses "Discuss first"). Both the other person's read marker and that message were stamped with
-- the same instant, and "unread" means "newer than the read marker", so the message was never counted as unread.
-- This replaces private.context_conversation so that a person added to a new conversation has read everything up to
-- one millisecond ago, not up to this instant. Nothing else about it changes. Conversations that already exist are
-- not touched, and nothing is rewritten.
--
-- Rollback:
--   drop function if exists public.search_message_history(text, bigint, integer);
--   and, to restore the earlier behaviour of part 2, run the function body from 0117_v13_workspace.sql
--   (private.context_conversation) again. Neither change needs to be undone after a code rollback.

-- PART 1

create or replace function public.search_message_history(p_query text, p_before bigint default null, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  q text := btrim(coalesce(p_query, ''));
  pats text[];
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  found jsonb;
  n integer;
begin
  if me is null then
    raise exception 'Please sign in again.' using errcode = 'P0001';
  end if;
  if char_length(q) < 2 then
    return jsonb_build_object('results', '[]'::jsonb, 'more', false);
  end if;
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into pats
    from (select w from unnest(regexp_split_to_array(lower(q), '\s+')) w where w <> '' limit 6) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', h.key, 'dbId', h.id, 'at', h.created_at, 'own', h.author_id = me,
           'author', h.author_id, 'text', h.snippet) order by h.id desc), '[]'::jsonb),
         count(*)
    into found, n
    from (
      select m.id, m.author_id, m.created_at, coalesce(c.context_key, 'c-' || c.id) as key,
             case when char_length(m.body) <= 220 then m.body
                  else (case when pos > 60 then '…' else '' end)
                       || substr(m.body, greatest(pos - 60, 1), 200)
                       || (case when pos - 60 + 200 < char_length(m.body) then '…' else '' end) end as snippet
        from conversation_messages m
        join conversation_participants mp on mp.conversation_id = m.conversation_id and mp.profile_id = me
        join conversations c on c.id = m.conversation_id
        cross join lateral (select greatest(position(split_part(lower(q), ' ', 1) in lower(m.body)), 1) as pos) p
        cross join lateral (select count(*) as size from conversation_participants x where x.conversation_id = c.id) g
       where m.deleted_at is null
         and (p_before is null or m.id < p_before)
         and (select bool_and(m.body ilike t escape '\') from unnest(pats) t)
         and (
               (g.size > 2 and (m.author_id = me or not public.is_blocked_between(me, m.author_id)))
            or (g.size = 2 and not public.is_blocked_between(me, (select x.profile_id from conversation_participants x where x.conversation_id = c.id and x.profile_id <> me limit 1)))
         )
       order by m.id desc
       limit lim + 1
    ) h;

  -- One more row than asked for tells us there is another page; drop it from what is returned.
  if n > lim then
    select jsonb_agg(e) into found from (select e from jsonb_array_elements(found) with ordinality t(e, i) order by i limit lim) z;
  end if;
  return jsonb_build_object('results', coalesce(found, '[]'::jsonb), 'more', n > lim);
end;
$function$;

revoke all on function public.search_message_history(text, bigint, integer) from public, anon;
grant execute on function public.search_message_history(text, bigint, integer) to authenticated;

-- PART 2

create or replace function private.context_conversation(p_key text, p_title text, p_participants uuid[], p_creator uuid,
                                                         p_seed_author uuid default null, p_seed_body text default null, p_seed_at timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v bigint; fresh boolean := false;
begin
  select id into v from conversations where context_key = p_key;
  if v is null then
    insert into conversations (created_by, title, context_key) values (p_creator, p_title, p_key)
    on conflict (context_key) where context_key is not null do nothing
    returning id into v;
    fresh := v is not null;
    if v is null then
      select id into v from conversations where context_key = p_key;
    end if;
  end if;
  -- One millisecond before now: a message written in this same step is then newer than the read marker, so it is unread.
  insert into conversation_participants (conversation_id, profile_id, last_read_at)
  select v, x, now() - interval '1 millisecond' from unnest(p_participants) x
  on conflict do nothing;
  if fresh and p_seed_author is not null and nullif(btrim(coalesce(p_seed_body, '')), '') is not null then
    insert into conversation_messages (conversation_id, author_id, body, client_message_id, created_at)
    values (v, p_seed_author, left(btrim(p_seed_body), 2000), md5(p_key || ':request')::uuid, coalesce(p_seed_at, now()))
    on conflict do nothing;
  end if;
  return v;
end;
$function$;
revoke all on function private.context_conversation(text, text, uuid[], uuid, uuid, text, timestamptz) from public, anon, authenticated;
