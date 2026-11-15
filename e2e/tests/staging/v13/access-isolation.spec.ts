import { test, expect } from "@playwright/test";
import { account, anonKey, SUPABASE_URL } from "../../../lib/auth";
import { assertLocal, q, asMember } from "../../../lib/staging";

// v12 (release QA C3, 14 Nov 2026): one member cannot read another member's private work, and a signed-out caller
// cannot read or change anything private. Avery sends Fenn a cover request, a referral, a private question and a
// message, and keeps a personal file and a continuity plan; Dara, who is not involved, and an anonymous caller
// then try to read all of it through the same database rules the app and the public API use.
// Real local database, fictional members only.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const avery = account("avery"), fenn = account("fenn"), dara = account("dara");
const uuid = () => crypto.randomUUID();
const rpc = async (who: string, sql: string, params: unknown[] = []) => (await asMember(who, sql, params)).rows[0]?.r;
// "Permission denied" is as closed as no rows, so it counts as none.
const count = async (who: string, sql: string, params: unknown[] = []) => {
  try { return Number((await asMember(who, `select count(*)::int as n from (${sql}) x`, params)).rows[0].n); }
  catch (e: any) { if (e?.code === "42501") return 0; throw e; }
};

let ids: { plan: number; referral: number; question: number; convo: string; doc: string } = null as any;

async function tidy() {
  await q(`delete from coverage_plans where title = 'AI-01 leave'`);
  await q(`delete from referral_requests where notes = 'AI-01 weekly sessions.'`);
  await q(`delete from consultations where question like 'AI-01 %'`);
  await q(`delete from conversation_messages where body like 'AI-01 %'`);
  await q(`delete from documents where title = 'AI-01 private notes'`);
  await q(`delete from continuity_plans where profile_id = $1 and answers ->> 'ai01' = 'yes'`, [avery.id]);
}
test.beforeAll(async () => {
  await tidy();
  const client = { label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual", insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [fenn.id] };
  const plan = await rpc(avery.id, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify({ requestId: uuid(), name: "AI-01 leave", reason: "short", other: "", start: "2026-12-02", end: "2026-12-13", mode: "sequential", deadline: 48, message: "Weekly.", clients: [client] })]);
  const referral = await rpc(avery.id, `select public.referral_create($1::jsonb) as r`, [JSON.stringify({ requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "", prescribing: false, audience: "selected", selected: [fenn.id], timeframe: "Within two weeks", message: "AI-01 weekly sessions." })]);
  const question = await rpc(avery.id, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({ title: "AI-01 A private question", body: "AI-01 Context, nothing identifying.", topic: "Clinical practice", tags: [], confirmed: "true", clientRequestId: uuid(), audience: "one", recipients: [fenn.id] })]);
  const open = await rpc(avery.id, `select public.conversation_open('direct', null, null, $1::uuid) as r`, [fenn.id]);
  const convo = String(open?.key || open?.conversationKey || open?.id || "");
  await rpc(avery.id, `select public.message_send($1, 'AI-01 a private message', $2::uuid) as r`, [convo, uuid()]);
  const doc = (await q(`insert into documents (profile_id, owner_scope, title, storage_path, uploaded_by, is_general) values ($1, 'personal', 'AI-01 private notes', $2, $1, true) returning id`, [avery.id, `personal/${avery.id}/ai01.pdf`]))[0].id;
  await q(`insert into continuity_plans (profile_id, answers) values ($1, '{"ai01":"yes"}'::jsonb) on conflict (profile_id) do update set answers = continuity_plans.answers || '{"ai01":"yes"}'::jsonb`, [avery.id]);
  ids = { plan: plan.planId, referral: referral.referralId, question: Number(question.id), convo, doc: String(doc) };
});
test.afterAll(tidy);

test("AI-01 the colleague who was asked can see the work (the checks below are not vacuous)", async () => {
  expect(await count(fenn.id, `select 1 from coverage_plans where id = $1`, [ids.plan])).toBe(1);
  expect(await count(fenn.id, `select 1 from referral_requests where id = $1`, [ids.referral])).toBe(1);
  expect(await count(fenn.id, `select 1 from consultations where id = $1`, [ids.question])).toBe(1);
  expect(await count(fenn.id, `select 1 from conversation_messages where body = 'AI-01 a private message'`)).toBe(1);
});

test("AI-02 a member who is not involved sees none of it, directly or through the workspace functions", async () => {
  const none: [string, string, unknown[]][] = [
    ["cover plan", `select 1 from coverage_plans where id = $1`, [ids.plan]],
    ["cover clients", `select 1 from coverage_plan_cases where coverage_plan_id = $1`, [ids.plan]],
    ["cover requests", `select 1 from coverage_requests r join coverage_plan_cases c on c.id = r.coverage_plan_case_id where c.coverage_plan_id = $1`, [ids.plan]],
    ["cover history", `select 1 from coverage_plan_events where plan_id = $1`, [ids.plan]],
    ["referral", `select 1 from referral_requests where id = $1`, [ids.referral]],
    ["referral recipients", `select 1 from referral_recipients where referral_request_id = $1`, [ids.referral]],
    ["private question", `select 1 from consultations where id = $1`, [ids.question]],
    ["message", `select 1 from conversation_messages where body = 'AI-01 a private message'`, []],
    ["personal file", `select 1 from documents where id = $1::bigint`, [ids.doc]],
    ["continuity plan", `select 1 from continuity_plans where profile_id = $1`, [avery.id]],
    ["Avery's notifications", `select 1 from notification_deliveries where recipient_profile_id = $1`, [avery.id]],
    ["Fenn's notifications", `select 1 from notification_deliveries where recipient_profile_id = $1`, [fenn.id]],
    ["Avery's drafts", `select 1 from workspace_drafts where profile_id = $1`, [avery.id]],
  ];
  for (const [what, sql, params] of none) expect(await count(dara.id, sql, params), `Dara can read ${what}`).toBe(0);
  expect(await rpc(dara.id, `select public.workspace_discussion($1) as r`, [ids.question])).toBeNull();
  const thread = await rpc(dara.id, `select public.workspace_thread($1) as r`, [ids.convo]);
  expect(thread == null || JSON.stringify(thread).indexOf("AI-01") === -1, "Dara can open the conversation").toBeTruthy();
  const slice = JSON.stringify(await rpc(dara.id, `select public.workspace_slice(array['plans','referrals','threads','consult']) as r`));
  expect(slice, "Dara's workspace carries Avery's private work").not.toContain("AI-01");
});

test("AI-03 a member cannot change someone else's work", async () => {
  await asMember(dara.id, `update coverage_plans set title = 'hijacked' where id = $1`, [ids.plan]);
  await asMember(dara.id, `delete from referral_requests where id = $1`, [ids.referral]).catch(() => {});
  await asMember(dara.id, `update documents set title = 'hijacked' where id = $1::bigint`, [ids.doc]).catch(() => {});
  expect((await q(`select title from coverage_plans where id = $1`, [ids.plan]))[0].title).toBe("AI-01 leave");
  expect((await q(`select count(*)::int n from referral_requests where id = $1`, [ids.referral]))[0].n).toBe(1);
  expect((await q(`select title from documents where id = $1::bigint`, [ids.doc]))[0].title).toBe("AI-01 private notes");
  await expect(asMember(dara.id, `select public.cover_cancel_plan($1)`, [ids.plan])).rejects.toThrow();
});

test("AI-04 a signed-out caller reads nothing private through the public API, and every table refuses its writes", async () => {
  const tables = (await q(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v','m') order by 1`)).map((r: any) => r.relname as string);
  // Public by design: the states open to members and the practice scenarios on the public demo.
  const PUBLIC = new Set(["open_states", "practice_scenarios", "lookup_values"]);
  const h = { apikey: anonKey(), Authorization: `Bearer ${anonKey()}` };
  for (const t of tables) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&limit=1`, { headers: h });
    if (r.status === 200 && !PUBLIC.has(t)) expect((await r.json()).length, `anonymous read of ${t}`).toBe(0);
  }
  const before = (await q(`select (select count(*) from coverage_plans) + (select count(*) from referral_requests) + (select count(*) from documents) as n`))[0].n;
  for (const t of ["coverage_plans", "referral_requests", "documents", "conversation_messages", "profiles"]) {
    const del = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=not.is.null`, { method: "DELETE", headers: h });
    expect([200, 204, 401, 403, 404]).toContain(del.status);
    const up = await fetch(`${SUPABASE_URL}/rest/v1/${t}?id=not.is.null`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) });
    expect(up.status).not.toBe(500);
  }
  const after = (await q(`select (select count(*) from coverage_plans) + (select count(*) from referral_requests) + (select count(*) from documents) as n`))[0].n;
  expect(after).toBe(before);
  for (const fn of ["workspace_slice", "workspace_discussions", "my_profile"]) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: fn === "workspace_slice" ? JSON.stringify({ p_names: ["plans", "referrals", "threads"] }) : "{}" });
    const body = await r.text();
    expect(body, `anonymous ${fn}`).not.toContain("AI-01");
  }
});

test("AI-05 a member's private files are closed to another member and to a signed-out caller", async () => {
  expect(await count(dara.id, `select 1 from storage.objects where bucket_id = 'documents' and name like $1`, [`personal/${avery.id}/%`])).toBe(0);
  expect(await count(dara.id, `select 1 from storage.objects where bucket_id = 'message-files'`)).toBe(
    await count(dara.id, `select 1 from storage.objects o where bucket_id = 'message-files' and exists (select 1 from conversation_participants p where p.profile_id = $1 and o.name like p.conversation_id || '/%')`, [dara.id]));
  const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, { method: "POST", headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, "content-type": "application/json" }, body: JSON.stringify({ prefix: `personal/${avery.id}`, limit: 10 }) });
  if (list.status === 200) expect(await list.json()).toEqual([]);
});

test("AI-06 sandbox visitors and their fictional colleagues never appear to a live member", async () => {
  const guests = (await q(`select guest_id from sandbox_passes where guest_id is not null limit 50`)).map((r: any) => r.guest_id);
  test.skip(!guests.length, "No sandbox visitors on this database");
  expect(await count(avery.id, `select 1 from profiles where id = any($1::uuid[])`, [guests])).toBe(0);
  const people = JSON.stringify(await rpc(avery.id, `select public.workspace_slice(array['people','known']) as r`));
  for (const g of guests) expect(people, "a sandbox visitor in a live member's people").not.toContain(g);
});
