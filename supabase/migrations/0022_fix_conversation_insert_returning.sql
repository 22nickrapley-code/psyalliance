-- INSERT ... RETURNING also has to satisfy the table's SELECT policy (not
-- just the INSERT policy's WITH CHECK) - so creating a conversation and
-- immediately reading back its id failed RLS, because the creator's own
-- conversation_participants row hasn't been inserted yet at that point
-- (chicken-and-egg: the participant row's conversation_id doesn't exist
-- until the conversation itself is created). Letting the creator always see
-- a conversation they created removes the ordering trap and is harmless -
-- they will always end up as a participant anyway.
drop policy "participants can view their conversations" on conversations;

create policy "participants can view their conversations" on conversations
  for select using (
    created_by = (select auth.uid())
    or is_conversation_participant(id, (select auth.uid()))
  );
