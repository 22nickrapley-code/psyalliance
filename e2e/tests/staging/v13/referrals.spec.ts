import { test, expect } from "@playwright/test";
import { account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// V13 workspace: Referrals on the real database. Fictional staging members only.
// Every check runs the way the app does: as the signed-in member, through the
// same functions the screens call.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const id = (n: string) => account(n).id;
const avery = id("avery"), bram = id("bram"), cass = id("cass"), fenn = id("fenn"), gale = id("gale"), dara = id("dara");
const pell = id("pell"), esme = id("esme"), sol = id("sol"), otto = id("otto");
const everyone = [avery, bram, cass, fenn, gale, dara];

const uuid = () => crypto.randomUUID();
const payload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual",
  insurance: "", language: "", prescribing: false, audience: "selected", selected: [bram, cass],
  timeframe: "Within two weeks", message: "Weekly sessions, no identifying details.", ...over,
});
const create = async (who: string, p: Record<string, unknown>) => (await asMember(who, `select public.referral_create($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;
const listOf = async (who: string) => (await asMember(who, `select public.workspace_referrals() as r`)).rows[0].r as any[];
const answer = async (who: string, ref: number, r: string, capacity = false, question?: string, cid?: string) =>
  (await asMember(who, `select public.referral_answer($1::bigint, $2, $3, $4, $5::uuid) as r`, [ref, r, capacity, question ?? null, cid ?? null])).rows[0].r;
const place = async (who: string, ref: number, colleague: string) => (await asMember(who, `select public.referral_place($1::bigint, $2::uuid) as r`, [ref, colleague])).rows[0].r;
const withdraw = async (who: string, ref: number) => (await asMember(who, `select public.referral_withdraw($1::bigint) as r`, [ref])).rows[0].r;
const add = async (who: string, ref: number, person: string) => (await asMember(who, `select public.referral_add($1::bigint, $2::uuid) as r`, [ref, person])).rows[0].r;
const worked = async (who: string) => ((await asMember(who, `select public.workspace_tiers() as r`)).rows[0].r.worked as string[]);
const mine = async (who: string, ref: number) => (await listOf(who)).find((r) => r.id === ref);
const deliveries = (who: string, type: string, like = "%") =>
  q(`select d.channel from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = $1 and e.event_type = $2 and coalesce(e.dedup_key, '') like $3 order by d.channel`, [who, type, like]);

async function wipe() {
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [everyone]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and notes = 'legacy-rf'`, [everyone]);
  await q(`delete from conversations where context_key like 'referral-%'`);
  await q(`delete from notification_events where dedup_key like 'referral%' or dedup_key like 'message:%'`);
  await q(`delete from professional_events where event_type in ('referral_sent', 'referral_response', 'referral_outcome') and (actor_profile_id = any($1::uuid[]))`, [everyone]);
  await q(`delete from trusted_colleagues where profile_id = $1`, [avery]);
  await q(`update licenses set status = 'active', expiration_date = null where profile_id = any($1::uuid[]) and status <> 'active'`, [[bram, cass, fenn, gale]]);
}
test.beforeEach(wipe);
test.afterAll(wipe);

test("RF-01 a referral is made once: the need, who was asked, and who was told", async () => {
  const r = await create(avery, payload({ secondary: "", age: "", insurance: "" }));
  expect(r).toMatchObject({ unchanged: false, dropped: [], asked: 2 });
  const row = await one(`select * from referral_requests where id = $1`, [r.referralId]);
  expect(row).toMatchObject({ requesting_profile_id: avery, status: "sent", state: "NY", modality: "virtual", audience_type: "selected", timeframe: "within_two_weeks", prescribing: false });
  expect(row.audience_profile_ids).toEqual([bram, cass]);
  const recipients = await q(`select profile_id, ord from referral_recipients where referral_request_id = $1 order by ord`, [r.referralId]);
  expect(recipients.map((x) => x.profile_id)).toEqual([bram, cass]);
  // The referrer's view.
  const v = await mine(avery, r.referralId);
  expect(v).toMatchObject({ owner: "me", status: "discussion", audience: "selected", timeframe: "Within two weeks", focus: "Anxiety/Panic Disorders", placedWith: null });
  expect(v.requests.map((x: any) => [x.person, x.status])).toEqual([[bram, "awaiting"], [cass, "awaiting"]]);
  // Each colleague is told in the same step; nobody else is.
  for (const who of [bram, cass]) expect((await deliveries(who, "referral_sent", `referral:${r.referralId}:%`)).map((x) => x.channel)).toEqual(["email", "in_app"]);
  expect(await deliveries(fenn, "referral_sent", `referral:${r.referralId}:%`)).toHaveLength(0);
  // A colleague sees only their own request, never who else was asked.
  const b = await mine(bram, r.referralId);
  expect(b.owner).toBe(avery);
  expect(b.requests).toHaveLength(1);
  expect(b.requests[0]).toMatchObject({ person: "me", status: "awaiting" });
  expect(JSON.stringify(b)).not.toContain(cass);
  // Someone who was not asked sees nothing.
  expect(await mine(fenn, r.referralId)).toBeUndefined();
  expect(await mine(dara, r.referralId)).toBeUndefined();
});

test("RF-02 sending twice (same request id) asks nobody twice", async () => {
  const p = payload();
  const a = await create(avery, p);
  const b = await create(avery, p);
  expect(b).toMatchObject({ referralId: a.referralId, unchanged: true });
  expect((await q(`select 1 from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).length).toBe(1);
  expect((await q(`select 1 from referral_recipients where referral_request_id = $1`, [a.referralId])).length).toBe(2);
  expect(await deliveries(bram, "referral_sent", "referral:%")).toHaveLength(2);
  await wipe();
  const p2 = payload();
  const [x, y] = await Promise.all([create(avery, p2), create(avery, p2)]);
  expect(x.referralId).toBe(y.referralId);
  expect([x.unchanged, y.unchanged].sort()).toEqual([false, true]);
  expect((await q(`select 1 from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).length).toBe(1);
});

test("RF-03 each selected colleague is checked against the client's needs at the moment of sending", async () => {
  // Dara is licensed only in MA, so she cannot take a New York client.
  const r = await create(avery, payload({ selected: [bram, dara] }));
  expect(r.asked).toBe(1);
  expect(r.dropped).toHaveLength(1);
  expect(r.dropped[0].person).toBe(dara);
  expect(r.dropped[0].reasons).toEqual(expect.arrayContaining(["No reviewed NY license"]));
  expect((await q(`select profile_id from referral_recipients where referral_request_id = $1`, [r.referralId])).map((x) => x.profile_id)).toEqual([bram]);
  expect(await deliveries(dara, "referral_sent", `referral:${r.referralId}:%`)).toHaveLength(0);
  // Nobody eligible in a hand-picked list: nothing is made.
  await expect(create(avery, payload({ selected: [dara] }))).rejects.toThrow(/Select at least one eligible colleague/);
  expect((await q(`select 1 from referral_requests where requesting_profile_id = $1 and client_request_id is not null`, [avery])).length).toBe(1);
  // The second focus counts here as in the screens: Bram lists OCD, Cass does not.
  const r2 = await create(avery, payload({ secondary: "Obsessive/Compulsive Disorder", selected: [bram, cass] }));
  expect(r2.asked).toBe(1);
  expect(r2.dropped[0]).toMatchObject({ person: cass });
  expect(r2.dropped[0].reasons).toEqual(["Obsessive/Compulsive Disorder not listed"]);
});

test("RF-04 a trusted circle or the whole network is asked only where the need matches", async () => {
  await q(`insert into trusted_colleagues (profile_id, colleague_id) values ($1, $2), ($1, $3), ($1, $4) on conflict do nothing`, [avery, bram, dara, fenn]);
  const t = await create(avery, payload({ audience: "trusted", selected: [] }));
  const tr = (await q(`select profile_id from referral_recipients where referral_request_id = $1`, [t.referralId])).map((x) => x.profile_id).sort();
  expect(tr).toEqual([bram, fenn].sort());
  expect(await deliveries(dara, "referral_sent", `referral:${t.referralId}:%`)).toHaveLength(0);
  expect((await q(`select audience_type from referral_requests where id = $1`, [t.referralId]))[0].audience_type).toBe("trusted");

  const n = await create(avery, payload({ audience: "network", selected: [] }));
  const got = (await q(`select profile_id from referral_recipients where referral_request_id = $1`, [n.referralId])).map((x) => x.profile_id);
  expect(got).toEqual(expect.arrayContaining([bram, cass, fenn]));
  for (const nope of [avery, dara, pell, esme, sol, otto]) expect(got).not.toContain(nope);
  expect((await q(`select audience_type from referral_requests where id = $1`, [n.referralId]))[0].audience_type).toBe("wider_network");
  // Everyone asked passes the same server check, and was told.
  for (const p of got) {
    expect((await q(`select private.referral_exclusions($1, $2) as x`, [n.referralId, p]))[0].x).toEqual([]);
  }
  expect((await deliveries(bram, "referral_sent", `referral:${n.referralId}:%`)).length).toBe(2);
  // The audience view for the referrer says "network".
  expect((await mine(avery, n.referralId)).audience).toBe("network");
});

test("RF-05 interest needs capacity, is not a placement, and a repeat changes nothing", async () => {
  const r = await create(avery, payload());
  await expect(answer(bram, r.referralId, "interested", false)).rejects.toThrow(/Confirm your current capacity/);
  const a = await answer(bram, r.referralId, "interested", true);
  expect(a).toMatchObject({ status: "interested", unchanged: false });
  const row = await one(`select * from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [r.referralId, bram]);
  expect(row.status).toBe("interested");
  expect(row.capacity_confirmed_at).not.toBeNull();
  // The referral is not placed: nobody was chosen.
  expect((await one(`select status from referral_requests where id = $1`, [r.referralId])).status).toBe("sent");
  const v = await mine(avery, r.referralId);
  expect(v.status).toBe("discussion");
  expect(v.placedWith).toBeNull();
  expect(v.requests.find((x: any) => x.person === bram)).toMatchObject({ status: "interested" });
  expect(v.requests.find((x: any) => x.person === bram).capacityConfirmedAt).toBeTruthy();
  // The referrer is told once.
  expect((await deliveries(avery, "referral_response", `referral_response:${r.referralId}:%`)).map((x) => x.channel)).toEqual(["email", "in_app"]);
  // Pressing again (a retry, a second tab) is a no-op.
  const again = await answer(bram, r.referralId, "interested", true);
  expect(again.unchanged).toBe(true);
  expect(await deliveries(avery, "referral_response", `referral_response:${r.referralId}:%`)).toHaveLength(2);
  expect((await q(`select 1 from referral_responses where referral_request_id = $1`, [r.referralId])).length).toBe(1);
  // The referrer cannot answer their own referral; someone not asked cannot answer.
  await expect(answer(avery, r.referralId, "interested", true)).rejects.toThrow(/Referral not found/);
  await expect(answer(fenn, r.referralId, "declined")).rejects.toThrow(/Referral not found/);
});

test("RF-06 a colleague can decline, change their mind, or ask first in the request's own conversation", async () => {
  const r = await create(avery, payload());
  await answer(bram, r.referralId, "declined");
  expect((await mine(avery, r.referralId)).requests.find((x: any) => x.person === bram).status).toBe("declined");
  expect((await mine(bram, r.referralId)).requests[0].status).toBe("declined");
  const back = await answer(bram, r.referralId, "interested", true);
  expect(back.unchanged).toBe(false);
  // A question: needs words; goes in one conversation per colleague; once per message id.
  await expect(answer(cass, r.referralId, "discussing", false, "  ")).rejects.toThrow(/Write your question first/);
  const cid = uuid();
  const a = await answer(cass, r.referralId, "discussing", false, "Do you need weekday evenings?", cid);
  expect(a.conversationKey).toBe(`referral-${r.referralId}-${cass}`);
  const again = await answer(cass, r.referralId, "discussing", false, "Do you need weekday evenings?", cid);
  expect(again.unchanged).toBe(true);
  expect(again.messageId).toBe(a.messageId);
  const msgs = await q(`select m.body, m.author_id from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1 order by m.created_at, m.id`, [a.conversationKey]);
  // Opens with the request itself (the referrer's words), then the question.
  expect(msgs.map((m) => m.body)).toEqual(["Weekly sessions, no identifying details.", "Do you need weekday evenings?"]);
  expect(msgs.map((m) => m.author_id)).toEqual([avery, cass]);
  const parts = await q(`select profile_id from conversation_participants p join conversations c on c.id = p.conversation_id where c.context_key = $1`, [a.conversationKey]);
  expect(parts.map((x) => x.profile_id).sort()).toEqual([avery, cass].sort());
  expect((await mine(avery, r.referralId)).requests.find((x: any) => x.person === cass).status).toBe("discussing");
  // Bram's and Cass's conversations are separate.
  const t = (await asMember(avery, `select public.referral_thread($1::bigint, $2::uuid) as r`, [r.referralId, bram])).rows[0].r;
  expect(t.conversationKey).toBe(`referral-${r.referralId}-${bram}`);
  expect(t.conversationKey).not.toBe(a.conversationKey);
  const t2 = (await asMember(cass, `select public.referral_thread($1::bigint) as r`, [r.referralId])).rows[0].r;
  expect(t2.conversationKey).toBe(a.conversationKey);
  // A colleague who was not asked cannot open it.
  await expect(asMember(fenn, `select public.referral_thread($1::bigint) as r`, [r.referralId])).rejects.toThrow(/Referral not found/);
});

test("RF-07 only the referrer can place, only with someone interested, once; the rest close", async () => {
  const workedBefore = await worked(avery);
  const r = await create(avery, payload({ selected: [bram, cass, fenn] }));
  await answer(bram, r.referralId, "interested", true);
  await answer(cass, r.referralId, "interested", true);
  await answer(fenn, r.referralId, "declined");
  expect(await worked(avery)).toEqual(workedBefore);
  // Not the referrer, not a colleague who has not replied interested.
  await expect(place(bram, r.referralId, bram)).rejects.toThrow(/Referral not found/);
  await expect(place(avery, r.referralId, fenn)).rejects.toThrow(/replied Interested/);
  await expect(place(avery, r.referralId, gale)).rejects.toThrow(/only choose a colleague you sent/);
  const p = await place(avery, r.referralId, bram);
  expect(p.unchanged).toBe(false);
  expect(await one(`select status from referral_requests where id = $1`, [r.referralId])).toMatchObject({ status: "connected" });
  expect((await one(`select status from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [r.referralId, bram])).status).toBe("accepted");
  // Each person sees their own truth.
  const owner = await mine(avery, r.referralId);
  expect(owner).toMatchObject({ status: "placed", placedWith: bram });
  expect(owner.requests.map((x: any) => [x.person, x.status])).toEqual([[bram, "placed"], [cass, "closed"], [fenn, "declined"]]);
  const chosen = await mine(bram, r.referralId);
  expect(chosen).toMatchObject({ status: "placed", placedWith: "me", placedElsewhere: false });
  expect(chosen.requests[0].status).toBe("placed");
  const other = await mine(cass, r.referralId);
  expect(other).toMatchObject({ status: "placed", placedWith: null, placedElsewhere: true });
  expect(other.requests[0].status).toBe("closed");
  expect(JSON.stringify(other)).not.toContain(bram);
  // A second press, or the second tab, changes nothing and tells nobody twice.
  expect((await place(avery, r.referralId, bram)).unchanged).toBe(true);
  expect(await deliveries(bram, "referral_connected", `referral_connected:${r.referralId}:%`)).toHaveLength(2);
  // A second colleague cannot be chosen.
  await expect(place(avery, r.referralId, cass)).rejects.toThrow(/already chosen/);
  // A placement is the one thing that makes a colleague "worked with".
  const after = await worked(avery);
  expect(after).toContain(bram);
  expect(after.includes(cass)).toBe(workedBefore.includes(cass));
  expect(after.includes(fenn)).toBe(workedBefore.includes(fenn));
  // The relationship is on the record for both.
  expect((await q(`select 1 from professional_events where event_type = 'referral_outcome' and actor_profile_id = $1 and related_profile_id = $2`, [avery, bram])).length).toBe(1);
});

test("RF-08 interest alone never makes a colleague 'worked with', and nothing changes after placement", async () => {
  const workedBefore = await worked(avery);
  const r = await create(avery, payload());
  await answer(bram, r.referralId, "interested", true);
  await answer(cass, r.referralId, "discussing", false, "A question", uuid());
  expect(await worked(avery)).toEqual(workedBefore);
  await place(avery, r.referralId, bram);
  await expect(answer(cass, r.referralId, "interested", true)).rejects.toThrow(/no longer taking replies/);
  await expect(add(avery, r.referralId, fenn)).rejects.toThrow(/no longer open/);
  await expect(withdraw(avery, r.referralId)).rejects.toThrow(/already been placed/);
  await expect(answer(bram, r.referralId, "declined")).rejects.toThrow(/already been chosen/);
});

test("RF-09 withdrawing closes the open requests and keeps every reply and conversation", async () => {
  const r = await create(avery, payload({ selected: [bram, cass, fenn] }));
  await answer(bram, r.referralId, "interested", true);
  await answer(cass, r.referralId, "discussing", false, "Quick question", uuid());
  await answer(fenn, r.referralId, "declined");
  await expect(withdraw(bram, r.referralId)).rejects.toThrow(/Referral not found/);
  expect((await withdraw(avery, r.referralId)).unchanged).toBe(false);
  expect((await withdraw(avery, r.referralId)).unchanged).toBe(true);
  const v = await mine(avery, r.referralId);
  expect(v.status).toBe("withdrawn");
  expect(v.withdrawnAt).toBeTruthy();
  expect(v.requests.map((x: any) => [x.person, x.status, x.beforeWithdrawal ?? null])).toEqual([[bram, "closed", "interested"], [cass, "closed", "discussing"], [fenn, "declined", null]]);
  // The replies and the conversation are still there.
  expect((await q(`select 1 from referral_responses where referral_request_id = $1`, [r.referralId])).length).toBe(3);
  expect((await q(`select 1 from conversations where context_key like $1`, [`referral-${r.referralId}-%`])).length).toBe(1);
  // Those still open were told (in the app only); the one who declined was not.
  expect((await deliveries(bram, "system_notice", `referral_withdrawn:${r.referralId}:%`)).map((x) => x.channel)).toEqual(["in_app"]);
  expect(await deliveries(fenn, "system_notice", `referral_withdrawn:${r.referralId}:%`)).toHaveLength(0);
  // Nothing can happen to it now.
  await expect(answer(bram, r.referralId, "interested", true)).rejects.toThrow(/no longer taking replies/);
  await expect(place(avery, r.referralId, bram)).rejects.toThrow(/closed/);
  await expect(add(avery, r.referralId, gale)).rejects.toThrow(/no longer open/);
  expect((await mine(bram, r.referralId)).status).toBe("withdrawn");
});

test("RF-10 asking another colleague applies the same requirements, once", async () => {
  const r = await create(avery, payload({ selected: [bram] }));
  await expect(add(bram, r.referralId, cass)).rejects.toThrow(/Referral not found/);
  await expect(add(avery, r.referralId, dara)).rejects.toThrow(/no longer matches this referral: No reviewed NY license/);
  await expect(add(avery, r.referralId, pell)).rejects.toThrow(/no longer matches/);
  expect((await add(avery, r.referralId, cass)).unchanged).toBe(false);
  expect((await add(avery, r.referralId, cass)).unchanged).toBe(true);
  expect((await q(`select profile_id from referral_recipients where referral_request_id = $1 order by ord`, [r.referralId])).map((x) => x.profile_id)).toEqual([bram, cass]);
  expect((await one(`select audience_profile_ids from referral_requests where id = $1`, [r.referralId])).audience_profile_ids).toEqual([bram, cass]);
  expect(await deliveries(cass, "referral_sent", `referral:${r.referralId}:%`)).toHaveLength(2);
  // The new colleague can reply, and sees only their own request.
  await answer(cass, r.referralId, "interested", true);
  const c = await mine(cass, r.referralId);
  expect(c.requests).toHaveLength(1);
  expect((await mine(avery, r.referralId)).requests.map((x: any) => x.person)).toEqual([bram, cass]);
});

test("RF-11 a licence that has lapsed since the request stops any reply until it is renewed", async () => {
  const r = await create(avery, payload());
  await q(`update licenses set status = 'expired', expiration_date = current_date - 30 where profile_id = $1`, [bram]);
  await expect(answer(bram, r.referralId, "interested", true)).rejects.toThrow(/isn't active/);
  await expect(answer(bram, r.referralId, "declined")).rejects.toThrow(/isn't active/);
  expect((await q(`select 1 from referral_responses where referral_request_id = $1`, [r.referralId])).length).toBe(0);
  // A licence that is current for another state does not help: the state of this client decides.
  await q(`update licenses set status = 'active', expiration_date = null where profile_id = $1`, [bram]);
  expect((await answer(bram, r.referralId, "interested", true)).status).toBe("interested");
});

test("RF-12 a blocked pair cannot see or answer each other's referral", async () => {
  const r = await create(avery, payload());
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [bram, avery]);
  try {
    expect(await mine(bram, r.referralId)).toBeUndefined();
    await expect(answer(bram, r.referralId, "declined")).rejects.toThrow(/Referral not found/);
    // Cass is unaffected.
    expect(await mine(cass, r.referralId)).toBeDefined();
  } finally {
    await q(`delete from blocked_members where profile_id = $1 and blocked_profile_id = $2`, [bram, avery]);
  }
});

test("RF-13 referrals made before the workspace are kept, with their replies", async () => {
  const a = await one(`insert into referral_requests (requesting_profile_id, state, notes, status, audience_type, audience_profile_ids, timeframe, specialism_lookup_id, specialism_lookup_ids)
     select $1, 'NY', 'legacy-rf', 'connected', 'selected', array[$2::uuid, $3::uuid], 'within_month', lv.id, array[lv.id] from lookup_values lv where lv.category = 'treatment_specialism' and lv.value = 'Anxiety/Panic Disorders' returning id`, [avery, bram, cass]);
  await q(`insert into referral_responses (referral_request_id, responding_profile_id, status) values ($1, $2, 'accepted')`, [a.id, bram]);
  await q(`insert into referral_responses (referral_request_id, responding_profile_id, status) values ($1, $2, 'interested')`, [a.id, cass]);
  const b = await one(`insert into referral_requests (requesting_profile_id, state, notes, status, audience_type, audience_profile_ids, timeframe, specialism_lookup_id, specialism_lookup_ids)
     select $1, 'NY', 'legacy-rf', 'sent', 'selected', array[$2::uuid], null, lv.id, array[lv.id] from lookup_values lv where lv.category = 'treatment_specialism' and lv.value = 'Anxiety/Panic Disorders' returning id`, [avery, fenn]);
  const owner = await listOf(avery);
  const aid = Number(a.id), bid = Number(b.id);
  const oa = owner.find((x) => x.id === aid), ob = owner.find((x) => x.id === bid);
  expect(oa).toMatchObject({ status: "placed", placedWith: bram, timeframe: "Within a month", setting: "either" });
  expect(oa.requests.map((x: any) => [x.person, x.status])).toEqual([[bram, "placed"], [cass, "closed"]]);
  expect(ob).toMatchObject({ status: "discussion", timeframe: "Flexible" });
  expect(ob.requests.map((x: any) => [x.person, x.status])).toEqual([[fenn, "awaiting"]]);
  expect((await mine(fenn, bid)).requests[0].status).toBe("awaiting");
  // The colleague who replied sees it too, and may still decline until it is placed.
  expect((await mine(cass, aid)).requests[0].status).toBe("closed");
  expect((await answer(fenn, bid, "declined")).status).toBe("declined");
});

test("RF-14 the server refuses what the screen should never send", async () => {
  await expect(create(avery, payload({ state: "New York" }))).rejects.toThrow(/state/);
  await expect(create(avery, payload({ focus: "" }))).rejects.toThrow(/main treatment area/);
  await expect(create(avery, payload({ focus: "Made up" }))).rejects.toThrow(/main treatment area/);
  await expect(create(avery, payload({ secondary: "Anxiety/Panic Disorders" }))).rejects.toThrow(/different second/);
  await expect(create(avery, payload({ timeframe: "Whenever" }))).rejects.toThrow(/timeframe/);
  await expect(create(avery, payload({ audience: "everyone" }))).rejects.toThrow(/who receives/);
  await expect(create(avery, payload({ message: "x".repeat(601) }))).rejects.toThrow(/600/);
  await expect(create(avery, payload({ setting: "phone" }))).rejects.toThrow(/setting/);
  await expect(create(pell, payload())).rejects.toThrow(/verified/);
  await expect(create(otto, payload())).rejects.toThrow(/verified|network/i);
  expect((await q(`select 1 from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [[avery, pell, otto]])).length).toBe(0);
});

test("RF-15 the colleague's own name and role reach the screen even if they have left the directory", async () => {
  const r = await create(avery, payload({ selected: [bram] }));
  const known = (await asMember(cass, `select public.workspace_known() as r`)).rows[0].r as any[];
  expect(known.map((k) => k.id)).not.toContain(avery); // still in Cass's directory, nothing extra
  await q(`update licenses set status = 'expired', expiration_date = current_date - 5 where profile_id = $1`, [avery]);
  try {
    // Avery is no longer visible to Bram, but the referral he was asked still names her.
    const k = (await asMember(bram, `select public.workspace_known() as r`)).rows[0].r as any[];
    expect(k.map((x) => x.id)).toContain(avery);
    expect(k.find((x) => x.id === avery)).toMatchObject({ limited: true });
    expect(await mine(bram, r.referralId)).toBeDefined();
  } finally {
    await q(`update licenses set status = 'active', expiration_date = null where profile_id = $1`, [avery]);
  }
});
