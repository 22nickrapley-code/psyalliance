-- Real bug caught by the real-role RLS test: the previous policy's
-- "profile_id = auth.uid() OR you're the creator" shape let ANY signed-in
-- user add THEMSELVES as a participant of ANY conversation_id they could
-- guess or enumerate, regardless of whether they were invited - the
-- "profile_id = auth.uid()" branch had no tie back to the target
-- conversation at all. The two cases (creator adding themselves, creator
-- adding someone else) are really the same rule: only the conversation's
-- creator may insert participant rows into it, for anyone.
drop policy "creator seeds participants at conversation start" on conversation_participants;

create policy "creator seeds participants at conversation start" on conversation_participants
  for insert with check (
    exists (
      select 1 from conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid())
    )
  );
