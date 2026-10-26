import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { account } from "../../../lib/auth";
import { assertLocal, q, one, asMember, runJobs } from "../../../lib/staging";

// V13 workspace: Cover on the real database. Fictional staging members only.
// Every check here runs the way the app does: as the signed-in member, through
// the same functions the screens call.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const id = (n: string) => account(n).id;
const avery = id("avery"), bram = id("bram"), cass = id("cass"), fenn = id("fenn"), gale = id("gale"), dara = id("dara");

const uuid = () => crypto.randomUUID();
const client = (over: Record<string, unknown> = {}) => ({
  label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual",
  insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [], ...over,
});
const payload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), name: "Autumn leave", reason: "short", other: "", start: "2026-11-02", end: "2026-11-13",
  mode: "sequential", deadline: 48, message: "Weekly appointments.", clients: [client({ selected: [bram, cass, fenn] })], ...over,
});
const create = async (who: string, p: Record<string, unknown>) => (await asMember(who, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify(p)])).rows[0].r;
const plansOf = async (who: string) => (await asMember(who, `select public.workspace_plans() as r`)).rows[0].r as any[];
const answer = async (who: string, req: number | string, r: string, question?: string, cid?: string) =>
  (await asMember(who, `select public.cover_answer($1::bigint, $2, $3, $4::uuid) as r`, [req, r, question ?? null, cid ?? null])).rows[0].r;
const requestOf = async (planId: number, who: string) =>
  one(`select r.* from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1 and r.requested_profile_id = $2 order by r.id desc limit 1`, [planId, who]);
const caseOf = async (planId: number, n = 0) => (await q(`select * from coverage_plan_cases where coverage_plan_id = $1 order by id`, [planId]))[n];

async function wipe() {
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [[avery, bram, cass, fenn, gale, dara]]);
  await q(`delete from conversations where context_key like 'cover-%'`);
  await q(`delete from notification_events where dedup_key like 'coverage%' or dedup_key like 'cover_%' or dedup_key like 'message:%'`);
  await q(`delete from professional_events where event_type like 'coverage%'`);
  await q(`update profiles set qualification_level = 'PhD' where id = $1 and qualification_level = 'MD'`, [gale]);
  await q(`update licenses set status = 'active', expiration_date = null where profile_id = any($1::uuid[]) and status <> 'active'`, [[bram, cass, fenn, gale]]);
}
test.beforeEach(wipe);
test.afterAll(wipe);

test("CV-01 a plan is made once: clients, first request, queue, deadline, history", async () => {
  const r = await create(avery, payload());
  expect(r.unchanged).toBe(false);
  expect(r.dropped).toEqual([]);
  const plan = await one(`select * from coverage_plans where id = $1`, [r.planId]);
  expect(plan).toMatchObject({ profile_id: avery, status: "active", outreach_mode: "sequential", response_hours: 48, reason: "short", absence_type: "short_planned" });
  const c = await caseOf(r.planId);
  expect(c).toMatchObject({ status: "awaiting_response", via_hub: true, jurisdiction_state: "NY", modality: "virtual" });
  expect(c.outreach_queue).toEqual([cass, fenn]);
  const reqs = await q(`select * from coverage_requests where coverage_plan_case_id = $1`, [c.id]);
  expect(reqs).toHaveLength(1);
  expect(reqs[0].requested_profile_id).toBe(bram);
  const hours = (new Date(reqs[0].expires_at).getTime() - new Date(reqs[0].sent_at).getTime()) / 3600000;
  expect(hours).toBeCloseTo(48, 1);
  const view = (await plansOf(avery))[0];
  expect(view.owner).toBe("me");
  expect(view.clients[0].status).toBe("awaiting");
  expect(view.clients[0].requests.map((x: any) => [x.person, x.status, x.order])).toEqual([[bram, "awaiting", 1], [cass, "queued", 2], [fenn, "queued", 3]]);
  expect(view.history.map((h: any) => h.text)).toEqual(expect.arrayContaining(["Plan created with one anonymous client need.", "Sequential invitations sent. Response deadline: 48 hours."]));
  // The colleague is told in the same step.
  const n = await q(`select d.channel from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = $1 and e.event_type = 'coverage_request'`, [bram]);
  expect(n.map((x) => x.channel).sort()).toEqual(["email", "in_app"]);
  // Nobody else was told.
  expect(await q(`select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = any($1::uuid[]) and e.event_type = 'coverage_request'`, [[cass, fenn]])).toHaveLength(0);
});

test("CV-02 sending twice (same request id) asks nobody twice", async () => {
  const p = payload();
  const a = await create(avery, p);
  const b = await create(avery, p);
  expect(b).toMatchObject({ planId: a.planId, unchanged: true });
  expect((await q(`select 1 from coverage_plans where profile_id = $1`, [avery])).length).toBe(1);
  expect((await q(`select 1 from coverage_requests`)).length).toBe(1);
  // Two at once as well.
  await wipe();
  const p2 = payload();
  const [x, y] = await Promise.all([create(avery, p2), create(avery, p2)]);
  expect(x.planId).toBe(y.planId);
  expect((await q(`select 1 from coverage_plans where profile_id = $1`, [avery])).length).toBe(1);
  expect((await q(`select 1 from coverage_requests`)).length).toBe(1);
});

test("CV-03 each recipient is checked against each client at the moment of sending", async () => {
  await q(`update profiles set qualification_level = 'MD' where id = $1`, [gale]);
  const pending = (await q(`select id from profiles where verification_status = 'pending' and full_name like 'Pell%'`))[0].id;
  const r = await create(avery, payload({
    mode: "parallel",
    clients: [
      client({ label: "Client 1", selected: [bram, dara, pending, gale], state: "NY" }),
      client({ label: "Client 2", selected: [bram, cass], insurance: "Cigna" }),
      client({ label: "Client 3", selected: [gale, bram], prescribing: true }),
    ],
  }));
  const why = (label: string, who: string) => r.dropped.find((d: any) => d.client === label && d.person === who)?.reasons;
  expect(why("Client 1", dara)).toEqual(["No reviewed NY license", "Anxiety/Panic Disorders not listed"]);
  expect(why("Client 1", pending)).toEqual(["Not a colleague you can ask"]);
  expect(why("Client 2", cass)).toEqual(["Insurance does not match"]);
  expect(why("Client 3", bram)).toEqual(["Prescribing required"]);
  const asked = await q(`select c.case_reference, r.requested_profile_id from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1 order by 1, 2`, [r.planId]);
  expect(asked.map((x) => `${x.case_reference}:${x.requested_profile_id}`).sort()).toEqual(
    [`Client 1:${bram}`, `Client 1:${gale}`, `Client 2:${bram}`, `Client 3:${gale}`].sort());
  // Dropped people are told nothing and kept off the plan.
  expect(await q(`select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id where e.event_type like 'coverage%' and d.recipient_profile_id = any($1::uuid[])`, [[dara, pending, cass]])).toHaveLength(0);
});

test("CV-04 the server's eligibility rules give the same answers as the screens' own", async () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "..", "src/workspace/engine.ts"), "utf8");
  const m = src.match(/function eligibilityExclusions\(n,p\)\{[\s\S]*?return out;\}/);
  expect(m).toBeTruthy();
  const settingLabel = (s: string) => (s === "virtual" ? "Virtual" : s === "in_person" ? "In person" : "Virtual or in person");
  const js = new Function("settingLabel", `${m![0]}; return eligibilityExclusions;`)(settingLabel) as (n: any, p: any) => string[];
  await q(`update profiles set qualification_level = 'MD' where id = $1`, [gale]);
  await q(`insert into profile_lookup_values (profile_id, lookup_value_id) select $1, id from lookup_values where category = 'age_group_specialism' and value = (select min(value) from lookup_values where category = 'age_group_specialism') on conflict do nothing`, [bram]);
  const people = (await asMember(avery, `select public.workspace_people() as r`)).rows[0].r as any[];
  expect(people.length).toBeGreaterThan(4);
  const ages = (await q(`select value from lookup_values where category = 'age_group_specialism' order by value`)).map((x) => x.value);
  const focuses = ["Anxiety/Panic Disorders", "Depression", "Trauma/PTSD", "Obsessive/Compulsive Disorder"];
  const needs: any[] = [];
  for (const state of ["NY", "MA", "CA"]) for (const setting of ["virtual", "in_person", "either"]) for (const focus of focuses.slice(0, 3)) {
    needs.push({ state, setting, focus, secondary: "", prescribing: false, age: "", insurance: "", language: "", city: "" });
  }
  needs.push(
    { state: "NY", setting: "in_person", focus: "Depression", secondary: "Trauma/PTSD", prescribing: false, age: "", insurance: "Aetna", language: "English", city: "Brook" },
    { state: "NY", setting: "in_person", focus: "Anxiety/Panic Disorders", secondary: "", prescribing: true, age: ages[0], insurance: "Cigna", language: "Spanish", city: "ithaca" },
    { state: "NY", setting: "either", focus: "Anxiety/Panic Disorders", secondary: "Obsessive/Compulsive Disorder", prescribing: false, age: ages[0], insurance: "", language: "", city: "Manh" },
    { state: "MA", setting: "virtual", focus: "Depression", secondary: "", prescribing: false, age: "", insurance: "Cigna", language: "", city: "" },
  );
  let checked = 0;
  for (const n of needs) {
    for (const p of people) {
      // The screens read city from the profile; the server also accepts the licence's own in-person city.
      const lic = p.licenses[n.state];
      const jsOut = js(n, { ...p, city: [p.city, lic?.city].filter(Boolean).join(" | ") });
      const sql = (await q(`select private.cover_exclusions($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r`, [p.id, n.state, n.setting, n.prescribing, n.focus, n.secondary, n.age, n.insurance, n.language, n.city]))[0].r as string[];
      expect(sql, `${p.name} / ${JSON.stringify(n)}`).toEqual(jsOut);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(100);
});

test("CV-05 a decline asks the next colleague, with a fresh deadline", async () => {
  const r = await create(avery, payload());
  const b1 = await requestOf(r.planId, bram);
  await answer(bram, b1.id, "declined");
  const c = await caseOf(r.planId);
  const next = await requestOf(r.planId, cass);
  expect(next.status).toBe("sent");
  expect(next.expires_at).not.toBeNull();
  expect(c.outreach_queue).toEqual([fenn]);
  expect(c.status).toBe("awaiting_response");
  const view = (await plansOf(avery))[0].clients[0];
  expect(view.requests.map((x: any) => [x.person, x.status])).toEqual([[bram, "declined"], [cass, "awaiting"], [fenn, "queued"]]);
  expect(view.status).toBe("awaiting");
  expect((await plansOf(avery))[0].history[0].text).toBe("Client 1: " + (await one(`select regexp_replace(full_name, '^Dr\\.? ', '') as n from profiles where id = $1`, [cass])).n + " asked next.");
  expect((await q(`select 1 from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = $1 and e.event_type = 'coverage_request' and d.channel = 'in_app'`, [cass])).length).toBe(1);
});

test("CV-06 a missed deadline closes the request and asks the next; running the job again changes nothing", async () => {
  const r = await create(avery, payload());
  const b1 = await requestOf(r.planId, bram);
  // Not yet due: nothing happens.
  await runJobs(["pa_cover_deadlines"]);
  expect((await requestOf(r.planId, bram)).status).toBe("sent");
  await q(`update coverage_requests set expires_at = now() - interval '1 minute' where id = $1`, [b1.id]);
  await runJobs(["pa_cover_deadlines"]);
  const after = await requestOf(r.planId, bram);
  expect(after).toMatchObject({ status: "expired", closed_reason: "deadline", expires_at: null });
  expect((await requestOf(r.planId, cass)).status).toBe("sent");
  await runJobs(["pa_cover_deadlines", "pa_cover_deadlines"]);
  expect((await q(`select 1 from coverage_requests where coverage_plan_case_id = (select id from coverage_plan_cases where coverage_plan_id = $1)`, [r.planId])).length).toBe(2);
  const v = (await plansOf(avery))[0];
  expect(v.clients[0].requests.map((x: any) => x.status)).toEqual(["expired", "awaiting", "queued"]);
  expect(v.history.map((h: any) => h.text).join("|")).toContain("did not reply before the deadline.");
  // The owner is told in the app, and nobody is emailed about a missed deadline.
  const note = await q(`select d.channel from notification_deliveries d join notification_events e on e.id = d.notification_event_id where d.recipient_profile_id = $1 and e.dedup_key = $2`, [avery, "cover_deadline:" + b1.id]);
  expect(note.map((x) => x.channel)).toEqual(["in_app"]);
});

test("CV-07 a colleague who is discussing pauses the sequence until they answer", async () => {
  const r = await create(avery, payload());
  const b1 = await requestOf(r.planId, bram);
  const cid = uuid();
  const a = await answer(bram, b1.id, "discussing", "Could we talk about timing first?", cid);
  expect(a).toMatchObject({ status: "discussing", unchanged: false });
  const row = await requestOf(r.planId, bram);
  expect(row).toMatchObject({ status: "discussing", expires_at: null });
  // Days pass: no deadline, no next colleague.
  await q(`update coverage_requests set sent_at = now() - interval '30 days' where id = $1`, [b1.id]);
  await runJobs(["pa_cover_deadlines"]);
  expect((await requestOf(r.planId, bram)).status).toBe("discussing");
  expect(await q(`select 1 from coverage_requests where requested_profile_id = $1`, [cass])).toHaveLength(0);
  const v = (await plansOf(avery))[0].clients[0];
  expect(v.status).toBe("discussing");
  expect(v.requests.map((x: any) => x.status)).toEqual(["discussing", "queued", "queued"]);
  // The question is in that request's own conversation, once, with the organiser in it.
  const key = a.conversationKey as string;
  expect(key).toBe(`cover-${r.planId}-${(await caseOf(r.planId)).id}-${bram}`);
  const again = await answer(bram, b1.id, "discussing", "Could we talk about timing first?", cid);
  expect(again.messageId).toBe(a.messageId);
  const msgs = await q(`select m.body, m.author_id from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1`, [key]);
  expect(msgs).toHaveLength(1);
  const parts = await q(`select p.profile_id from conversation_participants p join conversations c on c.id = p.conversation_id where c.context_key = $1`, [key]);
  expect(parts.map((x) => x.profile_id).sort()).toEqual([avery, bram].sort());
  // The final answer resumes it: a decline asks the next colleague.
  await answer(bram, b1.id, "declined");
  expect((await requestOf(r.planId, cass)).status).toBe("sent");
});

test("CV-08 accepting takes the client for good; the others close as taken; only one can win", async () => {
  const r = await create(avery, payload({ mode: "parallel" }));
  const [rb, rc] = [await requestOf(r.planId, bram), await requestOf(r.planId, cass)];
  const results = await Promise.allSettled([answer(bram, rb.id, "accepted"), answer(cass, rc.id, "accepted")]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const failed = results.find((x) => x.status === "rejected") as PromiseRejectedResult;
  expect(String(failed.reason)).toMatch(/already taken on this client|closed/);
  const c = await caseOf(r.planId);
  expect(c.status).toBe("confirmed");
  const winner = c.assigned_clinician_id as string;
  expect([bram, cass]).toContain(winner);
  const loser = winner === bram ? cass : bram;
  expect(await requestOf(r.planId, loser)).toMatchObject({ status: "expired", closed_reason: "competing" });
  const owner = (await plansOf(avery))[0].clients[0];
  expect(owner.status).toBe("agreed");
  expect(owner.assignee).toBe(winner);
  expect(owner.handover).toEqual({ contact: false, summary: false, client: false });
  // The loser sees the client as covered, without who covered it.
  const lv = (await plansOf(loser))[0].clients[0];
  expect(lv.coveredElsewhere).toBe(true);
  expect(lv.assignee).toBeNull();
  expect(JSON.stringify(await plansOf(loser))).not.toContain(winner);
  // The winner sees themself.
  expect((await plansOf(winner))[0].clients[0].assignee).toBe("me");
  // Answering the same way twice is harmless.
  const wr = await requestOf(r.planId, winner);
  expect((await answer(winner, wr.id, "accepted")).unchanged).toBe(true);
  // Worked-with now includes them, for both.
  const tiers = (await asMember(avery, `select public.workspace_tiers() as r`)).rows[0].r;
  expect([...tiers.trust, ...tiers.worked]).toContain(winner);
});

test("CV-09 handover is the organiser's, needs an agreed colleague and all three confirmations", async () => {
  const r = await create(avery, payload());
  const c = await caseOf(r.planId);
  const handover = (who: string, a = true, b = true, cc = true) => asMember(who, `select public.cover_confirm_handover($1, $2, $3, $4, $5) as r`, [r.planId, c.id, a, b, cc]);
  await expect(handover(avery)).rejects.toThrow(/colleague needs to agree/);
  await answer(bram, (await requestOf(r.planId, bram)).id, "accepted");
  await expect(handover(bram)).rejects.toThrow(/Plan not found/);
  await expect(handover(avery, true, true, false)).rejects.toThrow(/all three/);
  expect((await plansOf(avery))[0].clients[0].status).toBe("agreed");
  expect((await handover(avery)).rows[0].r.unchanged).toBe(false);
  const v = (await plansOf(avery))[0].clients[0];
  expect(v.status).toBe("ready");
  expect(v.handover).toEqual({ contact: true, summary: true, client: true });
  expect((await handover(avery)).rows[0].r.unchanged).toBe(true);
  expect((await plansOf(bram))[0].clients[0].status).toBe("ready");
  expect(await q(`select 1 from notification_events where dedup_key = $1`, ["cover_handover:" + c.id])).toHaveLength(1);
});

test("CV-10 a plan completes only when every client has an agreed colleague and a ready handover", async () => {
  const r = await create(avery, payload({ clients: [client({ label: "Client 1", selected: [bram] }), client({ label: "Client 2", selected: [cass], focus: "Trauma/PTSD" })] }));
  const [c1, c2] = await q(`select * from coverage_plan_cases where coverage_plan_id = $1 order by id`, [r.planId]);
  const complete = (who = avery) => asMember(who, `select public.cover_complete_plan($1) as r`, [r.planId]);
  await expect(complete()).rejects.toThrow(/Confirm every handover/);
  await answer(bram, (await requestOf(r.planId, bram)).id, "accepted");
  await asMember(avery, `select public.cover_confirm_handover($1, $2, true, true, true)`, [r.planId, c1.id]);
  await expect(complete()).rejects.toThrow(/Confirm every handover/);
  await answer(cass, (await requestOf(r.planId, cass)).id, "accepted");
  await expect(complete()).rejects.toThrow(/Confirm every handover/);
  await asMember(avery, `select public.cover_confirm_handover($1, $2, true, true, true)`, [r.planId, c2.id]);
  await expect(complete(bram)).rejects.toThrow(/Plan not found/);
  expect((await complete()).rows[0].r.unchanged).toBe(false);
  expect((await plansOf(avery))[0].status).toBe("completed");
  expect((await complete()).rows[0].r.unchanged).toBe(true);
  const ev = await q(`select related_profile_id from professional_events where event_type = 'coverage_completed' and actor_profile_id = $1`, [avery]);
  expect(ev.map((x) => x.related_profile_id).sort()).toEqual([bram, cass].sort());
  expect((await plansOf(avery))[0].history[0].text).toBe("Arrangement completed. All handovers were confirmed.");
});

test("CV-11 cancelling closes open requests, keeps the record, and nothing is asked afterwards", async () => {
  const r = await create(avery, payload());
  const b1 = await requestOf(r.planId, bram);
  await asMember(avery, `select public.cover_cancel_plan($1)`, [r.planId]);
  expect(await requestOf(r.planId, bram)).toMatchObject({ status: "expired", closed_reason: "plan_ended" });
  expect(await q(`select 1 from coverage_requests where requested_profile_id = any($1::uuid[])`, [[cass, fenn]])).toHaveLength(0);
  await q(`update coverage_requests set expires_at = now() - interval '1 hour' where id = $1`, [b1.id]);
  await runJobs(["pa_cover_deadlines"]);
  expect(await q(`select 1 from coverage_requests where requested_profile_id = any($1::uuid[])`, [[cass, fenn]])).toHaveLength(0);
  await expect(answer(bram, b1.id, "accepted")).rejects.toThrow(/has ended|closed/);
  const v = (await plansOf(avery))[0];
  expect(v.status).toBe("cancelled");
  expect(v.clients[0].requests.map((x: any) => x.status)).toEqual(["closed", "closed", "closed"]);
  expect(v.history[0].text).toBe("Plan cancelled. Outstanding invitations closed.");
  expect((await asMember(avery, `select public.cover_cancel_plan($1) as r`, [r.planId])).rows[0].r.unchanged).toBe(true);
  await expect(asMember(bram, `select public.cover_cancel_plan($1)`, [r.planId])).rejects.toThrow(/Plan not found/);
});

test("CV-12 a colleague sees only their own requests, clients and history", async () => {
  const r = await create(avery, payload({ mode: "parallel", clients: [client({ label: "Client 1", selected: [bram, cass] }), client({ label: "Client 2", selected: [cass], focus: "Trauma/PTSD" })] }));
  const b = await plansOf(bram);
  expect(b).toHaveLength(1);
  expect(b[0].owner).toBe(avery);
  expect(b[0].clients.map((x: any) => x.label)).toEqual(["Client 1"]);
  expect(b[0].clients[0].requests).toHaveLength(1);
  expect(b[0].clients[0].requests[0].person).toBe("me");
  expect(b[0].clients[0].selected).toEqual(["me"]);
  expect(JSON.stringify(b)).not.toContain(cass);
  expect(b[0].history.map((h: any) => h.text)).toEqual(["Avery asked you to help with one client need."]);
  const cv = await plansOf(cass);
  expect(cv[0].clients.map((x: any) => x.label)).toEqual(["Client 1", "Client 2"]);
  expect(cv[0].history.map((h: any) => h.text)).toEqual(["Avery asked you to help with two client needs."]);
  // Not in it, not shown it.
  expect(await plansOf(fenn)).toEqual([]);
  // Someone else's request can't be answered.
  await expect(answer(fenn, (await requestOf(r.planId, bram)).id, "declined")).rejects.toThrow(/Request not found/);
  // Blocking ends the colleague's view of the plan.
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [bram, avery]);
  try {
    expect(await plansOf(bram)).toEqual([]);
  } finally {
    await q(`delete from blocked_members where profile_id = $1 and blocked_profile_id = $2`, [bram, avery]);
  }
});

test("CV-13 the organiser can ask another colleague; repeats and ineligible choices are refused", async () => {
  const r = await create(avery, payload({ clients: [client({ selected: [bram] })] }));
  const c = await caseOf(r.planId);
  const ask = (who: string, person: string) => asMember(who, `select public.cover_ask($1, $2, $3) as r`, [r.planId, c.id, person]);
  const first = (await ask(avery, gale)).rows[0].r;
  expect(first.unchanged).toBe(false);
  expect((await ask(avery, gale)).rows[0].r.unchanged).toBe(true);
  expect(await q(`select 1 from coverage_requests where requested_profile_id = $1`, [gale])).toHaveLength(1);
  expect((await requestOf(r.planId, gale)).expires_at).not.toBeNull();
  await expect(ask(avery, dara)).rejects.toThrow(/No reviewed NY license/);
  await expect(ask(avery, avery)).rejects.toThrow(/Choose a colleague/);
  await expect(ask(bram, gale)).rejects.toThrow(/Plan not found/);
  const h = (await plansOf(avery))[0].history[0].text;
  expect(h).toMatch(/^Client 1: a new request was sent to /);
  await answer(gale, (await requestOf(r.planId, gale)).id, "accepted");
  await expect(ask(avery, cass)).rejects.toThrow(/already has cover/);
});

test("CV-14 answering checks the licence again; a lapsed licence can't take the client", async () => {
  const r = await create(avery, payload());
  await q(`update licenses set status = 'expired' where profile_id = $1`, [bram]);
  try {
    await expect(answer(bram, (await requestOf(r.planId, bram)).id, "accepted")).rejects.toThrow(/license for NY isn't current|isn't current|verified/);
    expect((await caseOf(r.planId)).status).toBe("awaiting_response");
  } finally {
    await q(`update licenses set status = 'active' where profile_id = $1`, [bram]);
  }
});

test("CV-15 the sequence passes over someone who is no longer eligible, and says so", async () => {
  const r = await create(avery, payload());
  await q(`update licenses set status = 'expired' where profile_id = $1`, [cass]);
  try {
    await answer(bram, (await requestOf(r.planId, bram)).id, "declined");
    expect(await q(`select 1 from coverage_requests where requested_profile_id = $1`, [cass])).toHaveLength(0);
    expect((await requestOf(r.planId, fenn)).status).toBe("sent");
    expect((await caseOf(r.planId)).outreach_queue).toEqual([]);
    expect((await plansOf(avery))[0].history.map((h: any) => h.text).join("|")).toContain("could not be asked because they are no longer an eligible match.");
  } finally {
    await q(`update licenses set status = 'active' where profile_id = $1`, [cass]);
  }
});

test("CV-16 the server refuses what the form should never send", async () => {
  const bad = (over: Record<string, unknown>) => create(avery, payload(over));
  await expect(bad({ name: "" })).rejects.toThrow(/short name/);
  await expect(bad({ reason: "holiday" })).rejects.toThrow(/kind of cover/);
  await expect(bad({ mode: "all" })).rejects.toThrow(/how colleagues are asked/);
  await expect(bad({ deadline: 5 })).rejects.toThrow(/deadline/);
  await expect(bad({ start: "2026-11-10", end: "2026-11-02" })).rejects.toThrow(/before the first day/);
  await expect(bad({ clients: [] })).rejects.toThrow(/at least one client/);
  await expect(bad({ clients: [client({ focus: "Nonsense" })] })).rejects.toThrow(/main treatment area/);
  await expect(bad({ clients: [client({ state: "N" })] })).rejects.toThrow(/needs a state/);
  await expect(bad({ clients: [client({ setting: "phone" })] })).rejects.toThrow(/setting/);
  await expect(bad({ clients: [client({ secondary: "Anxiety/Panic Disorders" })] })).rejects.toThrow(/different second/);
  await expect(bad({ clients: [client({ insurance: "Made-up Plan" })] })).rejects.toThrow(/insurance/);
  await expect(bad({ clients: [client({ selected: Array.from({ length: 11 }, () => uuid()) })] })).rejects.toThrow(/up to ten/);
  // An unknown person is dropped, never asked.
  const ghost = uuid();
  const g = await create(avery, payload({ clients: [client({ selected: [ghost, bram] })] }));
  expect(g.dropped.map((d: any) => d.person)).toEqual([ghost]);
  await wipe();
  // A pending applicant can't ask anyone.
  const pending = (await q(`select id from profiles where verification_status = 'pending' and full_name like 'Pell%'`))[0].id;
  await expect(create(pending, payload())).rejects.toThrow(/verified/);
  expect(await q(`select 1 from coverage_plans where profile_id = $1`, [avery])).toHaveLength(0);
});

test("CV-17 a plan from before the workspace still shows, and keeps its own rules", async () => {
  const p = await one(`insert into coverage_plans (profile_id, plan_type, title, status, absence_type, jurisdiction_state, outreach_mode, starts_on, ends_on) values ($1, 'ad_hoc', 'Older plan', 'active', 'short_planned', 'NY', 'parallel', '2026-10-01', '2026-10-05') returning id`, [avery]);
  const c = await one(`insert into coverage_plan_cases (coverage_plan_id, case_reference, specialism_lookup_ids, modality, status, jurisdiction_state) values ($1, 'Client 1', array[(select id from lookup_values where category = 'treatment_specialism' and value = 'Depression'), (select id from lookup_values where category = 'treatment_specialism' and value = 'Trauma/PTSD')], 'virtual', 'awaiting_response', 'NY') returning id`, [p.id]);
  const rq = await one(`insert into coverage_requests (coverage_plan_case_id, requested_profile_id, sequence_order) values ($1, $2, 1) returning id, expires_at`, [c.id, bram]);
  expect(rq.expires_at).toBeNull();
  await runJobs(["pa_cover_deadlines"]);
  expect((await requestOf(p.id, bram)).status).toBe("sent");
  const v = (await plansOf(avery))[0];
  expect(v).toMatchObject({ name: "Older plan", reason: "short", mode: "parallel", start: "2026-10-01" });
  expect(v.clients[0]).toMatchObject({ focus: "Depression", secondary: "", status: "awaiting" });
  expect(v.history.map((h: any) => h.text)).toEqual(["Plan created."]);
  await answer(bram, rq.id, "accepted");
  expect((await plansOf(avery))[0].clients[0].status).toBe("agreed");
});
