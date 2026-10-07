-- 0096: quick reactions on messages. Applied to both projects.
-- Writes go only through react_to_message: the table has a read policy
-- and no write policies, so RLS refuses direct inserts and updates.

-- One reaction per person per message (like, dislike or heart), shown to
-- everyone in the conversation. Changed only through react_to_message.
create table if not exists public.message_reactions (
  message_id bigint not null references public.conversation_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike', 'heart')),
  created_at timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index if not exists message_reactions_conversation_idx on public.message_reactions (conversation_id);
create index if not exists message_reactions_profile_idx on public.message_reactions (profile_id);
alter table public.message_reactions enable row level security;
create policy "participants can see reactions" on public.message_reactions
  for select to authenticated using (private.is_conversation_participant(conversation_id, (select auth.uid())));

-- Sets, changes or (choosing the same one again) removes the caller's
-- reaction. Only participants can react, and not to removed messages.
create or replace function public.react_to_message(p_message bigint, p_reaction text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  me uuid := auth.uid();
  conv bigint;
  current_reaction text;
begin
  if me is null then
    raise exception 'Sign in to react.' using errcode = 'P0001';
  end if;
  if p_reaction not in ('like', 'dislike', 'heart') then
    raise exception 'Unknown reaction.' using errcode = 'P0001';
  end if;
  select m.conversation_id into conv from conversation_messages m where m.id = p_message and m.deleted_at is null;
  if conv is null or not private.is_conversation_participant(conv, me) then
    raise exception 'You can only react in your own conversations.' using errcode = 'P0001';
  end if;
  select reaction into current_reaction from message_reactions where message_id = p_message and profile_id = me;
  if current_reaction = p_reaction then
    delete from message_reactions where message_id = p_message and profile_id = me;
    return null;
  end if;
  insert into message_reactions (message_id, profile_id, conversation_id, reaction)
  values (p_message, me, conv, p_reaction)
  on conflict (message_id, profile_id) do update set reaction = excluded.reaction, created_at = now();
  return p_reaction;
end;
$function$;

-- In the sandbox, a colleague who replies to the guest also gives the
-- guest's message a thumbs up (applied by editing demo_autorespond in place).
do $do$
declare
  def text := pg_get_functiondef('private.demo_autorespond'::regproc);
  marker text := 'update conversations set last_message_at = now() where id = r.conversation_id;';
begin
  if strpos(def, 'message_reactions') > 0 then
    return;
  end if;
  if strpos(def, marker) = 0 then
    raise exception 'demo_autorespond marker not found';
  end if;
  def := replace(def, marker, marker || E'\n    insert into message_reactions (message_id, profile_id, conversation_id, reaction)\n    select m.id, responder, r.conversation_id, ''like'' from conversation_messages m\n    where m.conversation_id = r.conversation_id and m.author_id = r.owner order by m.created_at desc limit 1\n    on conflict do nothing;');
  execute def;
end
$do$;
