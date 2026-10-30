-- 0124: search every message a member can see, not only each conversation's latest one (Release B, brief section 9).
--
-- The workspace search used to match a conversation's name and its latest message, and said so on screen. This adds
-- real history search: all of the caller's own messages, newest first, ten to fifty at a time, each result naming the
-- conversation it belongs to (by the same key the workspace uses) and the message's id so the screen can open the
-- exact message.
--
-- Who can see what is exactly what the workspace already allows:
--   * only conversations the caller is a participant of;
--   * not messages the author deleted;
--   * a two-person conversation with someone the caller has blocked (or who blocked them) is not searched;
--   * in a group, messages from people the caller has blocked are left out (the caller's own are kept).
-- It reads only. It changes no table, column, row, policy or existing function.
-- Words are matched in any order, each as a plain piece of text (no wildcards: a % or _ in the search is a literal).
--
-- If it has not been run, the screen keeps working: the search window shows the conversation matches it already had
-- and says that history search is not available yet.
--
-- Rollback:  drop function if exists public.search_message_history(text, bigint, integer);

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
