-- Release C, part 2: the practice scenario catalogue.
-- The practice workspace itself runs in the visitor's browser on fixture data (src/tour/scenarios.ts), so it holds no
-- account, no real colleague and no production row. This table only records which scenarios exist, so the sandbox
-- project, the demo site and analytics agree on the ids. It is read-only to visitors and idempotent to re-apply.

create table if not exists public.practice_scenarios (
  id text primary key check (id in ('caseload', 'time_away', 'client_referral', 'perspective', 'reducing', 'offer_support')),
  journey text not null,
  title text not null,
  premise text not null,
  resets text not null,
  signup text not null,
  position int not null default 0
);
alter table public.practice_scenarios enable row level security;
drop policy if exists "practice scenarios are readable" on public.practice_scenarios;
create policy "practice scenarios are readable" on public.practice_scenarios for select to anon, authenticated using (true);
revoke insert, update, delete on public.practice_scenarios from anon, authenticated;

insert into public.practice_scenarios (id, journey, title, premise, resets, signup, position) values
  ('caseload', 'caseload', 'Rebuild a caseload', 'A new practice with no confirmed places yet.', 'Puts the profile, availability and every request back to the start.', '/start?need=caseload', 1),
  ('time_away', 'time-away', 'Arrange time away', 'Six weeks of leave and three clients who need a colleague.', 'Discards the cover plan and the colleagues chosen.', '/start?need=time_away', 2),
  ('client_referral', 'client-referral', 'Find a colleague for a client', 'A client who needs OCD-informed care in New York.', 'Clears the anonymous need and any selected colleagues.', '/start?need=client_referral', 3),
  ('perspective', 'perspective', 'Get another perspective', 'A practice question for a few trusted colleagues.', 'Discards the question and who was chosen.', '/start?need=perspective', 4),
  ('reducing', 'reducing', 'Reduce or wind down practice', 'Fewer new referrals, honest availability, cover for clients who cannot stay.', 'Puts availability back and clears any cover plan.', '/start?need=reducing', 5),
  ('offer_support', 'offer-support', 'Offer support to colleagues', 'Capacity and experience to share, in your own time.', 'Clears the replies written and the requests answered.', '/start?need=offer_support', 6)
on conflict (id) do update set journey = excluded.journey, title = excluded.title, premise = excluded.premise, resets = excluded.resets, signup = excluded.signup, position = excluded.position;
