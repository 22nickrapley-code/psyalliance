import { test, expect } from "@playwright/test";
import { account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// The final product's rules (decisions D-05 to D-17, D-22), on the real
// database. Fictional staging members only. Every check runs the way the app
// does: as the signed-in member, through the same functions the screens call.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const id = (n: string) => account(n).id;
const avery = id("avery"), bram = id("bram"), cass = id("cass"), fenn = id("fenn"), pell = id("pell"), dara = id("dara");
const uuid = () => crypto.randomUUID();

const refPayload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual",
  insurance: "", language: "", prescribing: false, audience: "selected", selected: [bram, cass],
  timeframe: "Within two weeks", message: "", ...over,
});
const coverPayload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), name: "Autumn leave", reason: "short", other: "", start: "2026-11-02", end: "2026-11-13", mode: "sequential", deadline: 48,
  message: "Weekly appointments.", clients: [{ label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual",
    insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [bram, cass, fenn] }], ...over,
});
const call = async (who: string, sql: string, params: unknown[] = []) => (await asMember(who, sql, params)).rows[0].r;
const createRef = (who: string, p: Record<string, unknown>) => call(who, `select public.referral_create($1::jsonb) as r`, [JSON.stringify(p)]);
const createPlan = (who: string, p: Record<string, unknown>) => call(who, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify(p)]);
const refList = async (who: string) => (await call(who, `select public.workspace_referrals() as r`)) as any[];
const refAnswer = (who: string, ref: number, r: string, capacity = false, question?: string) =>
  call(who, `select public.referral_answer($1::bigint, $2, $3, $4, null) as r`, [ref, r, capacity, question ?? null]);
const coverAnswer = (who: string, req: number, r: string, question?: string) =>
  call(who, `select public.cover_answer($1::bigint, $2, $3, null) as r`, [req, r, question ?? null]);
const setAvail = (who: string, open: boolean, spaces: number, states: unknown, paused: string | null = null, cover: string | null = null, consult: string | null = null) =>
  call(who, `select public.set_my_availability($1, $2, $3::jsonb, $4::date, $5, $6) as r`, [open, spaces, JSON.stringify(states), paused, cover, consult]);
const NY = { NY: { virtual: true, inPerson: false, city: "" } };
const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function reset() {
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [[avery, bram, cass, pell]]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [[avery, bram, cass, pell]]);
  await q(`delete from conversations where context_key like 'referral-%' or context_key like 'cover-%' or context_key like 'direct-%'`);
  await q(`delete from notification_events where dedup_key like 'referral%' or dedup_key like 'coverage%' or dedup_key like 'cover_%' or dedup_key like 'message:%' or dedup_key like 'consult%'`);
  await q(`delete from professional_events where event_type in ('referral_sent', 'referral_response', 'referral_outcome', 'coverage_response', 'coverage_completed', 'consultation_response', 'coverage_request_sent', 'coverage_confirmed')`);
  await q(`update profiles set primary_state = 'NY', psypact_participating = false, availability_paused_until = null, coverage_availability = 'yes',
            consultation_availability = 'yes', account_status = 'active' where id = any($1::uuid[])`, [[avery, bram, cass, fenn, pell]]);
  await q(`delete from licenses where profile_id = $1 and state = 'NJ'`, [bram]);
  await q(`update licenses set status = 'active', expiration_date = null where profile_id = any($1::uuid[]) and status <> 'active'`, [[bram, cass, fenn]]);
  await q(`update licenses set expiration_date = null where profile_id = any($1::uuid[]) and expiration_date is not null`, [[bram, cass, fenn]]);
  await q(`delete from member_invite_uses where inviter = $1`, [avery]);
  await q(`delete from trusted_colleagues where profile_id = any($1::uuid[])`, [[avery, pell, dara]]);
  await q(`delete from suggested_colleagues where profile_id = any($1::uuid[]) and colleague_id = $2`, [[pell, dara], avery]);
  await q(`delete from consultations where author_profile_id = any($1::uuid[]) and client_request_id is not null`, [[avery, bram]]);
}
test.beforeEach(reset);
test.afterAll(reset);

// D-17 ---------------------------------------------------------------------------
test("FP-01 PSYPACT: telehealth into a member state, virtual only, home state a member", async () => {
  await q(`update profiles set primary_state = 'NJ', psypact_participating = true where id = $1`, [bram]);
  await q(`insert into licenses (profile_id, state, license_number, license_type, status, reviewed_at) values ($1, 'NJ', 'FIC-NJ-1', 'Psychologist', 'active', now())`, [bram]);
  const kept = (r: any) => (r.dropped as any[]).map((d) => d.person);
  // Virtual into Pennsylvania (a member state): Bram is eligible, Cass (no licence there) is not.
  const a = await createRef(avery, refPayload({ state: "PA", setting: "virtual" }));
  expect(kept(a)).toEqual([cass]);
  expect(a.dropped[0].reasons[0]).toBe("No reviewed PA license");
  const mine = (await refList(avery)).find((r) => r.id === a.referralId);
  expect(mine.requests.map((x: any) => x.person)).toEqual([bram]);
  // Either setting: the virtual part is covered.
  const b = await createRef(avery, refPayload({ state: "PA", setting: "either" }));
  expect(kept(b)).toEqual([cass]);
  // In person: PSYPACT does not travel.
  await expect(createRef(avery, refPayload({ state: "PA", setting: "in_person", selected: [bram] }))).rejects.toThrow(/Select at least one eligible colleague/);
  // A state that is not a member: no licence there, no PSYPACT.
  await expect(createRef(avery, refPayload({ state: "CA", setting: "virtual", selected: [bram] }))).rejects.toThrow(/Select at least one eligible colleague/);
  // The table's own guard says the same: PSYPACT does not reach a state that is not a member.
  const wide = await createRef(avery, refPayload({ state: "CA", setting: "virtual", audience: "network", selected: [] }));
  await expect(asMember(bram, `insert into referral_responses (referral_request_id, responding_profile_id, status) values (${wide.referralId}, '${bram}', 'interested')`)).rejects.toThrow(/reviewed license in CA/);
  // Bram can say he is interested, and the server agrees with the screen.
  const ok = await refAnswer(bram, a.referralId, "interested", true);
  expect(ok.status).toBe("interested");
  // The cover rule is the same one.
  const ex = async (state: string, setting: string) =>
    (await one(`select private.cover_exclusions($1::uuid, $2, $3, false, null, null, null, null, null, null) as r`, [bram, state, setting])).r as string[];
  expect(await ex("PA", "virtual")).toEqual([]);
  expect(await ex("PA", "in_person")).toEqual(["No reviewed PA license"]);
  expect(await ex("CA", "virtual")).toEqual(["No reviewed CA license"]);
  // Not taking part, or a home state that is not a member: not covered.
  await q(`update profiles set psypact_participating = false where id = $1`, [bram]);
  expect(await ex("PA", "virtual")).toEqual(["No reviewed PA license"]);
  await q(`update profiles set primary_state = 'NY' where id = $1`, [bram]);
  await expect(q(`update profiles set psypact_participating = true where id = $1 returning psypact_participating`, [bram]).then((r) => r[0].psypact_participating)).resolves.toBe(false);
});

// D-05 ---------------------------------------------------------------------------
test("FP-02 a pause-until date and 'not open to cover' keep someone out of new requests", async () => {
  await q(`update profiles set availability_paused_until = $2 where id = $1`, [bram, isoDay(5)]);
  const a = await createRef(avery, refPayload({ selected: [bram, cass] }));
  expect(a.dropped).toHaveLength(1);
  expect(a.dropped[0].person).toBe(bram);
  expect(a.dropped[0].reasons[0]).toMatch(/^Paused until /);
  // A pause that has ended no longer counts.
  await q(`update profiles set availability_paused_until = $2 where id = $1`, [bram, isoDay(-1)]);
  const b = await createRef(avery, refPayload({ selected: [bram, cass] }));
  expect(b.dropped).toEqual([]);
  // Cover 'no' keeps someone out of cover but not out of referrals.
  await q(`update profiles set coverage_availability = 'no', availability_paused_until = null where id = $1`, [bram]);
  const c = await createRef(avery, refPayload({ selected: [bram, cass] }));
  expect(c.dropped).toEqual([]);
  const plan = await createPlan(avery, coverPayload());
  expect(plan.dropped.map((d: any) => d.person)).toContain(bram);
  expect(plan.dropped.find((d: any) => d.person === bram).reasons).toContain("Not open to cover");
  // 'Ask me first' is still eligible.
  await q(`update profiles set coverage_availability = 'ask_me' where id = $1`, [bram]);
  const d = await createPlan(avery, coverPayload());
  expect(d.dropped.map((x: any) => x.person)).not.toContain(bram);
});

test("FP-03 availability saves pause-until, cover and consult openness; colleagues see them", async () => {
  const until = isoDay(14);
  const saved = await setAvail(avery, true, 3, NY, until, "ask", "no");
  expect(saved).toMatchObject({ open: true, slots: 3, pausedUntil: until, cover: "ask", consult: false });
  const p = await one(`select referral_availability, availability_paused_until::text as paused, coverage_availability, consultation_availability, accepting_referrals from profiles where id = $1`, [avery]);
  expect(p).toMatchObject({ referral_availability: "yes", paused: until, coverage_availability: "ask_me", consultation_availability: "no", accepting_referrals: false });
  // The member's own record, and what a colleague sees.
  const me = await call(avery, `select public.workspace_me() as r`);
  expect(me).toMatchObject({ pausedUntil: until, cover: "ask", consult: false });
  const people = (await call(bram, `select public.workspace_people() as r`)) as any[];
  expect(people.find((x) => x.id === avery)).toMatchObject({ pausedUntil: until, cover: "ask", consult: false, slots: 0 });
  // The screen sends the whole form: an empty date clears the pause; openness left out stays.
  const cleared = await setAvail(avery, true, 3, NY, null);
  expect(cleared).toMatchObject({ open: true, pausedUntil: null, cover: "ask", consult: false });
  expect((await one(`select accepting_referrals from profiles where id = $1`, [avery])).accepting_referrals).toBe(true);
  // Back to yes / yes.
  expect(await setAvail(avery, true, 3, NY, null, "yes", "yes")).toMatchObject({ cover: "yes", consult: true });
  // Refusals.
  await expect(setAvail(avery, true, 3, NY, isoDay(-2))).rejects.toThrow(/pause end date/);
  await expect(setAvail(avery, true, 3, NY, isoDay(400))).rejects.toThrow(/pause end date/);
  await expect(setAvail(avery, true, 3, NY, null, "maybe")).rejects.toThrow(/cover/);
  await expect(setAvail(avery, true, 3, NY, null, null, "sometimes")).rejects.toThrow(/consultation/);
  // The three-argument call the earlier screens made still works.
  const plain = await call(avery, `select public.set_my_availability(true, 2, $1::jsonb) as r`, [JSON.stringify(NY)]);
  expect(plain.slots).toBe(2);
});

// D-10 ---------------------------------------------------------------------------
test("FP-04 a lapsed licence can still decline a referral, nothing else; a suspended account can do nothing", async () => {
  const a = await createRef(avery, refPayload({ selected: [bram] }));
  await q(`update licenses set expiration_date = current_date - 1 where profile_id = $1`, [bram]);
  await expect(refAnswer(bram, a.referralId, "interested", true)).rejects.toThrow(/license isn't current, so you can only decline/);
  await expect(refAnswer(bram, a.referralId, "discussing", false, "Is this weekly?")).rejects.toThrow(/only decline/);
  const d = await refAnswer(bram, a.referralId, "declined");
  expect(d.status).toBe("declined");
  const view = (await refList(bram)).find((r) => r.id === a.referralId);
  expect(view.requests[0].status).toBe("declined");
  // Suspended: nothing, including declining.
  const b = await createRef(avery, refPayload({ selected: [cass] }));
  await q(`update profiles set account_status = 'suspended' where id = $1`, [cass]);
  await expect(refAnswer(cass, b.referralId, "declined")).rejects.toThrow(/isn't active in the network/);
  // Blocked either way: the request is gone.
  await q(`update profiles set account_status = 'active' where id = $1`, [cass]);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2) on conflict do nothing`, [avery, cass]);
  await expect(refAnswer(cass, b.referralId, "declined")).rejects.toThrow(/Referral not found/);
  await q(`delete from blocked_members where profile_id = $1 and blocked_profile_id = $2`, [avery, cass]);
});

test("FP-05 the same for cover: decline allowed on a lapsed licence, accept and ask refused", async () => {
  const plan = await createPlan(avery, coverPayload({ mode: "parallel" }));
  const req = async (who: string) =>
    (await one(`select r.id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1 and r.requested_profile_id = $2`, [plan.planId, who])).id as number;
  await q(`update licenses set expiration_date = current_date - 1 where profile_id = any($1::uuid[])`, [[bram, cass, fenn]]);
  await expect(coverAnswer(bram, await req(bram), "accepted")).rejects.toThrow(/only decline this request/);
  await expect(coverAnswer(cass, await req(cass), "discussing", "Which days?")).rejects.toThrow(/only decline/);
  expect((await coverAnswer(bram, await req(bram), "declined")).status).toBe("declined");
  await q(`update profiles set account_status = 'suspended' where id = $1`, [fenn]);
  await expect(coverAnswer(fenn, await req(fenn), "declined")).rejects.toThrow(/isn't active in the network/);
  await q(`update profiles set account_status = 'active' where id = $1`, [fenn]);
});

// D-09 / D-13 ---------------------------------------------------------------------
test("FP-06 referrals are numbered per member, in order; both sides see the number", async () => {
  const dupes = await q(`select 1 from referral_requests group by requesting_profile_id, member_seq having count(*) > 1`);
  expect(dupes).toHaveLength(0);
  expect(await q(`select 1 from referral_requests where member_seq is null`)).toHaveLength(0);
  const top = async (who: string) => Number((await one(`select coalesce(max(member_seq), 0) m from referral_requests where requesting_profile_id = $1`, [who])).m);
  const a0 = await top(avery), b0 = await top(bram);
  const r1 = await createRef(avery, refPayload({ selected: [bram] }));
  const r2 = await createRef(avery, refPayload({ selected: [bram] }));
  const r3 = await createRef(bram, refPayload({ selected: [avery] }));
  expect([r1.number, r2.number]).toEqual([a0 + 1, a0 + 2]);
  expect(r3.number).toBe(b0 + 1);
  const mine = (await refList(avery)).find((r) => r.id === r1.referralId);
  expect(mine).toMatchObject({ number: a0 + 1, label: `Referral ${a0 + 1}` });
  const theirs = (await refList(bram)).find((r) => r.id === r1.referralId);
  expect(theirs).toMatchObject({ number: a0 + 1, label: `Referral ${a0 + 1}`, title: null });
  // A conversation about it carries the same number, not a database id.
  const q1 = await refAnswer(bram, r1.referralId, "discussing", false, "Is this weekly?");
  const conv = await one(`select title from conversations where context_key = $1`, [q1.conversationKey]);
  expect(conv.title).toMatch(new RegExp(`^Referral ${a0 + 1} `));
  // Sending twice with the same request id does not take another number.
  const again = await createRef(avery, refPayload({ requestId: (await one(`select client_request_id id from referral_requests where id = $1`, [r2.referralId])).id, selected: [bram] }));
  expect(again.unchanged).toBe(true);
  expect(await top(avery)).toBe(a0 + 2);
});

test("FP-07 a private title: only the referrer sees it; guardrails keep client details out", async () => {
  const r = await createRef(avery, refPayload({ title: "Anxiety, evenings", selected: [bram] }));
  const own = (await refList(avery)).find((x) => x.id === r.referralId);
  expect(own.title).toBe("Anxiety, evenings");
  const other = await refList(bram);
  expect(JSON.stringify(other)).not.toContain("Anxiety, evenings");
  expect(other.find((x) => x.id === r.referralId).title).toBeNull();
  // Not readable from the table, by the other side or by the owner directly.
  await expect(asMember(bram, `select * from referral_titles`)).rejects.toThrow(/permission denied/);
  await expect(asMember(avery, `select * from referral_titles`)).rejects.toThrow(/permission denied/);
  // Change, and clear.
  const set = (who: string, t: string) => call(who, `select public.referral_set_title($1::bigint, $2) as r`, [r.referralId, t]);
  expect((await set(avery, "Tuesday 6pm")).title).toBe("Tuesday 6pm");
  expect((await refList(avery)).find((x) => x.id === r.referralId).title).toBe("Tuesday 6pm");
  expect((await set(avery, "")).title).toBeNull();
  expect((await refList(avery)).find((x) => x.id === r.referralId).title).toBeNull();
  // Only the referrer can set one.
  await expect(set(bram, "Mine now")).rejects.toThrow(/Referral not found/);
  // Guardrails: initials, names of numbers, contact details, length.
  for (const bad of ["J.S.", "J S", "JS", "Call 555-1234", "born 03/04/1987", "a@b.com", "see www.x.org", "12345", "x".repeat(41)]) {
    await expect(set(avery, bad), bad).rejects.toThrow(/./);
    await expect(createRef(avery, refPayload({ title: bad, selected: [bram] })), `create ${bad}`).rejects.toThrow(/./);
  }
  for (const good of ["Anxiety NY", "Anxiety, evenings", "Teen, OCD, Mondays", "Couples - Thurs 6"]) {
    expect((await set(avery, good)).title).toBe(good);
  }
  // Nothing was created by the refused attempts.
  expect(await q(`select 1 from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).toHaveLength(1);
});

// D-12 ---------------------------------------------------------------------------
test("FP-08 an invitation: the inviter trusts the joiner; the joiner chooses, with the inviter first in Suggested", async () => {
  const token = (await call(avery, `select public.my_invite_link() as r`)) as string;
  expect(token).toBeTruthy();
  const trust = async (who: string) => (await q(`select colleague_id from trusted_colleagues where profile_id = $1`, [who])).map((r) => r.colleague_id);
  // Someone not yet in the network (Pell is still being verified): nothing happens until they are.
  const waiting = await call(pell, `select public.accept_member_invite($1) as r`, [token]);
  expect(waiting.connected).toBe(false);
  expect(await trust(avery)).not.toContain(pell);
  await q(`delete from member_invite_uses where invitee = $1`, [pell]);
  // A colleague already in the network.
  const res = await call(dara, `select public.accept_member_invite($1) as r`, [token]);
  expect(res.connected).toBe(true);
  expect(await trust(avery)).toContain(dara);
  expect(await trust(dara)).not.toContain(avery);
  const tiers = await call(dara, `select public.workspace_tiers() as r`);
  expect(tiers.trust).not.toContain(avery);
  expect(tiers.suggested[0]).toBe(avery);
  // One tap to add them.
  await call(dara, `select public.trust_set($1::uuid, true) as r`, [avery]);
  expect(await trust(dara)).toContain(avery);
  const after = await call(dara, `select public.workspace_tiers() as r`);
  expect(after.trust).toContain(avery);
  expect(after.suggested).not.toContain(avery);
  // No mutual connection row was made.
  expect(await q(`select 1 from connections where (requester_id = $1 and addressee_id = $2) or (requester_id = $2 and addressee_id = $1)`, [avery, dara])).toHaveLength(0);
});

// D-14 ---------------------------------------------------------------------------
test("FP-09 the asker can mark a question resolved; a resolved question takes no replies; it can be reopened", async () => {
  const post = await call(avery, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({
    clientRequestId: uuid(), title: "How do you handle late cancellations?", body: "", topic: "Professional life", audience: "network", confirmed: "true", tags: [] })]);
  const reply = (who: string, text: string) => call(who, `select public.consult_reply($1::bigint, $2, $3::uuid) as r`, [post.id, text, uuid()]);
  await reply(bram, "A written policy helps.");
  const status = async () => (await one(`select status from consultations where id = $1`, [post.id])).status;
  expect(await status()).toBe("responses_received");
  // Only the asker.
  await expect(call(bram, `select public.consult_resolve($1::bigint, true) as r`, [post.id])).rejects.toThrow(/Only the person who asked/);
  expect((await call(avery, `select public.consult_resolve($1::bigint, true) as r`, [post.id])).status).toBe("resolved");
  const seen = (await call(cass, `select public.workspace_discussions() as r`) as any[]).find((d) => d.id === post.id);
  expect(seen.status).toBe("resolved");
  await expect(reply(cass, "Another idea.")).rejects.toThrow(/marked resolved/);
  // Not even by writing to the table directly.
  await expect(asMember(cass, `insert into consultation_responses (consultation_id, responder_profile_id, response_type, body) values (${post.id}, '${cass}', 'reply', 'sneaky')`)).rejects.toThrow(/marked resolved/);
  // Reopen.
  expect((await call(avery, `select public.consult_resolve($1::bigint, false) as r`, [post.id])).status).toBe("responses_received");
  await reply(cass, "Another idea.");
  expect(Number((await one(`select count(*) c from consultation_responses where consultation_id = $1`, [post.id])).c)).toBe(2);
});

// D-08 ---------------------------------------------------------------------------
test("FP-10 worked with before means agreed work: a consult reply does not count, completed cover does", async () => {
  const has = async () => (await q(`select 1 from worked_with_before where profile_id = $1 and colleague_id = $2`, [dara, fenn])).length === 1;
  const workedList = async () => ((await call(dara, `select public.workspace_tiers() as r`)).worked as string[]);
  await q(`insert into professional_events (event_type, actor_profile_id, related_profile_id, actor_type) values ('consultation_response', $1, $2, 'member_web')`, [fenn, dara]);
  expect(await has()).toBe(false);
  expect(await workedList()).not.toContain(fenn);
  await q(`insert into professional_events (event_type, actor_profile_id, related_profile_id, actor_type) values ('coverage_completed', $1, $2, 'member_web')`, [fenn, dara]);
  expect(await has()).toBe(true);
  expect(await workedList()).toContain(fenn);
  expect((await one(`select interaction_count from worked_with_before where profile_id = $1 and colleague_id = $2`, [dara, fenn])).interaction_count).toBe("1");
});

// D-22 ---------------------------------------------------------------------------
test("FP-11 a message can be edited for 15 minutes; removing is always allowed", async () => {
  const conv = await call(avery, `select public.conversation_open('direct', null, null, $1::uuid) as r`, [bram]);
  const cid = uuid();
  await call(avery, `select public.message_send($1, 'First version', $2::uuid, null) as r`, [conv.key, cid]);
  const edit = (t: string) => call(avery, `select public.message_edit($1, $2, $3) as r`, [conv.key, cid, t]);
  expect((await edit("Second version")).ok).toBe(true);
  await q(`update conversation_messages set created_at = now() - interval '14 minutes' where client_message_id = $1`, [cid]);
  expect((await edit("Still fine")).ok).toBe(true);
  await q(`update conversation_messages set created_at = now() - interval '16 minutes' where client_message_id = $1`, [cid]);
  await expect(edit("Too late")).rejects.toThrow(/15 minutes/);
  expect((await one(`select body from conversation_messages where client_message_id = $1`, [cid])).body).toBe("Still fine");
  const rm = await call(avery, `select public.message_remove($1, $2) as r`, [conv.key, cid]);
  expect(rm).toBeTruthy();
});
