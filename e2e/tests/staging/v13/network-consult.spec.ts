import { test, expect } from "@playwright/test";
import { account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// V13 workspace: Network, Consult, Library and notification choices on the
// real database. Fictional staging members only. Every check runs the way the
// app does: as the signed-in member, through the same functions the screens call.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const id = (n: string) => account(n).id;
const avery = id("avery"), bram = id("bram"), cass = id("cass"), fenn = id("fenn"), pell = id("pell"), sol = id("sol");
const everyone = [avery, bram, cass, fenn];
const uuid = () => crypto.randomUUID();

const rpc = async (who: string, sql: string, params: unknown[] = []) => (await asMember(who, sql, params)).rows[0].r;
const trust = (who: string, to: string, on: boolean) => rpc(who, `select public.trust_set($1::uuid, $2) as r`, [to, on]);
const post = (who: string, p: Record<string, unknown>) =>
  rpc(who, `select public.consult_post($1::jsonb) as r`, [JSON.stringify({ title: "How do you approach this?", body: "Some context.", topic: "Clinical practice", tags: [], confirmed: true, clientRequestId: uuid(), ...p })]);
const reply = (who: string, c: number, body: string, cid = uuid()) => rpc(who, `select public.consult_reply($1::bigint, $2, $3::uuid) as r`, [c, body, cid]);
const discussions = async (who: string) => (await rpc(who, `select public.workspace_discussions() as r`)) as any[];
const consult = async (who: string) => (await rpc(who, `select public.workspace_consult() as r`)) as any;
const tiers = async (who: string) => (await rpc(who, `select public.workspace_tiers() as r`)) as any;
const prefs = (who: string) => rpc(who, `select public.workspace_preferences() as r`);

async function wipe() {
  await q(`delete from consultations where author_profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from consultation_groups where created_by = any($1::uuid[])`, [everyone]);
  await q(`delete from trusted_colleagues where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from blocked_members where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from saved_resources where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from notification_preferences where profile_id = any($1::uuid[])`, [everyone]);
  await q(`update profiles set consultation_availability = 'yes', directory_visible = true where id = any($1::uuid[])`, [everyone]);
  await q(`delete from notification_events where dedup_key like 'trusted:%' or dedup_key like 'consult%'`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

const notices = (who: string, key: string) =>
  q(`select e.summary, d.channel from notification_deliveries d join notification_events e on e.id = d.notification_event_id
      where d.recipient_profile_id = $1 and e.dedup_key like $2 order by d.id`, [who, key]);

test("NC-01 trusted colleagues are chosen one way, the colleague is told once, and the rules still hold", async () => {
  expect(await trust(avery, bram, true)).toMatchObject({ on: true, added: true });
  expect(await trust(avery, bram, true)).toMatchObject({ on: true, added: false });
  expect((await tiers(avery)).trust).toEqual([bram]);
  expect((await tiers(bram)).trust).toEqual([]);
  expect((await notices(bram, `trusted:${avery}:${bram}`)).filter((n) => n.channel === "in_app").length).toBe(1);
  // Taking them off and adding again does not tell them a second time.
  expect(await trust(avery, bram, false)).toMatchObject({ on: false });
  expect(await trust(avery, bram, true)).toMatchObject({ on: true });
  expect((await notices(bram, `trusted:${avery}:${bram}`)).filter((n) => n.channel === "in_app").length).toBe(1);
  // Not yourself, not someone outside the network, not someone blocked.
  await expect(trust(avery, avery, true)).rejects.toThrow(/Choose a colleague/);
  await expect(trust(avery, pell, true)).rejects.toThrow(/can.t add this member/);
  await expect(trust(avery, sol, true)).rejects.toThrow(/can.t add this member/);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [cass, avery]);
  await expect(trust(avery, cass, true)).rejects.toThrow(/can.t add this member/);
});

test("NC-02 the three notification switches map onto the existing email settings and touch nothing else", async () => {
  expect(await prefs(avery)).toEqual({ messages: true, cover: true, community: true });
  await rpc(avery, `select public.set_workspace_preference('messages', false) as r`);
  let row = await one(`select * from notification_preferences where profile_id = $1`, [avery]);
  expect(row.email_on_message).toBe(false);
  expect(row.email_on_coverage_request && row.email_on_referral_request && row.email_on_consultation_response && row.email_on_endorsement === false).toBe(true);
  await rpc(avery, `select public.set_workspace_preference('cover', false) as r`);
  row = await one(`select * from notification_preferences where profile_id = $1`, [avery]);
  expect([row.email_on_coverage_request, row.email_on_coverage_response, row.email_on_referral_request, row.email_on_referral_response]).toEqual([false, false, false, false]);
  expect(row.email_on_consultation_response).toBe(true);
  expect(await prefs(avery)).toEqual({ messages: false, cover: false, community: true });
  await rpc(avery, `select public.set_workspace_preference('community', false) as r`);
  expect(await prefs(avery)).toEqual({ messages: false, cover: false, community: false });
  expect((await one(`select email_on_trusted_invitation, email_on_credential_reminder, digest_frequency from notification_preferences where profile_id = $1`, [avery]))).toMatchObject({ email_on_trusted_invitation: true, email_on_credential_reminder: true, digest_frequency: "weekly" });
  // A member who set only some of them in the older Settings page is not shown as off.
  await q(`update notification_preferences set email_on_coverage_request = true where profile_id = $1`, [avery]);
  expect((await prefs(avery)).cover).toBe(true);
  await rpc(avery, `select public.set_workspace_preference('cover', true) as r`);
  expect(await prefs(avery)).toEqual({ messages: false, cover: true, community: false });
  await expect(rpc(avery, `select public.set_workspace_preference('everything', true) as r`)).rejects.toThrow(/can.t be changed/);
});

test("NC-03 a question reaches exactly its audience, once, and colleagues who said Not now are not alerted", async () => {
  await trust(avery, bram, true);
  const t = await post(avery, { audience: "trusted" });
  expect(t.existing).toBe(false);
  expect((await discussions(bram)).map((d) => d.id)).toContain(t.id);
  expect((await discussions(cass)).map((d) => d.id)).not.toContain(t.id);
  const d = (await discussions(bram)).find((x) => x.id === t.id);
  expect(d).toMatchObject({ person: avery, audience: "trusted", tag: "Clinical practice", title: "How do you approach this?" });
  expect((await discussions(avery)).find((x) => x.id === t.id).person).toBe("me");
  expect((await notices(bram, `consult:${t.id}`)).length).toBeGreaterThan(0);
  expect((await notices(cass, `consult:${t.id}`)).length).toBe(0);

  // The same request id lands once.
  const cid = uuid();
  const a = await post(avery, { audience: "network", clientRequestId: cid });
  const b = await post(avery, { audience: "network", clientRequestId: cid });
  expect(b).toMatchObject({ id: a.id, existing: true });
  expect((await q(`select 1 from consultations where client_request_id = $1`, [cid])).length).toBe(1);
  expect((await discussions(fenn)).map((x) => x.id)).toContain(a.id);

  // One colleague, a few colleagues; one means one.
  const one1 = await post(avery, { audience: "one", recipients: [cass] });
  expect((await discussions(cass)).map((x) => x.id)).toContain(one1.id);
  expect((await discussions(bram)).map((x) => x.id)).not.toContain(one1.id);
  await expect(post(avery, { audience: "one", recipients: [cass, bram] })).rejects.toThrow(/Choose who should see this/);
  await expect(post(avery, { audience: "one", recipients: [] })).rejects.toThrow(/Choose who should see this/);
  await expect(post(avery, { audience: "few", recipients: [pell] })).rejects.toThrow(/can.t send this/);
  const few = await post(avery, { audience: "few", recipients: [bram, cass] });
  expect((await discussions(cass)).find((x) => x.id === few.id)).toMatchObject({ audience: "few" });
  expect((await discussions(fenn)).map((x) => x.id)).not.toContain(few.id);

  // Not now: still can read it if asked, but no alert.
  await q(`update profiles set consultation_availability = 'no' where id = $1`, [fenn]);
  const quiet = await post(avery, { audience: "few", recipients: [fenn, cass] });
  expect((await notices(fenn, `consult:${quiet.id}`)).length).toBe(0);
  expect((await notices(cass, `consult:${quiet.id}`)).length).toBeGreaterThan(0);
  expect((await consult(avery)).consultQuiet).toContain(fenn);

  // What the form asks of the question.
  await expect(post(avery, { audience: "network", title: "  " })).rejects.toThrow(/one sentence/);
  await expect(post(avery, { audience: "network", confirmed: false })).rejects.toThrow(/no client-identifying/);
  await expect(post(avery, { audience: "network", topic: "Gossip" })).rejects.toThrow(/listed topics/);
  await expect(post(avery, { audience: "wide" })).rejects.toThrow(/Choose who should see this/);
  await expect(post(pell, { audience: "network" })).rejects.toThrow(/verified/);
});

test("NC-04 a group question is for that group's members only, and only members can ask it", async () => {
  const g = await one(`insert into consultation_groups (name, purpose, created_by, cadence, meeting_length_minutes, meeting_format) values ('Thursday Circle', 'Think together', $1, 'Every two weeks', 60, 'video') returning id`, [avery]);
  await q(`insert into consultation_group_members (group_id, profile_id, status, role) values ($1, $2, 'joined', 'creator'), ($1, $3, 'joined', 'member'), ($1, $4, 'invited', 'member')`, [g.id, avery, bram, cass]);
  const groups = (await consult(bram)).groups;
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ id: Number(g.id), name: "Thursday Circle", cadence: "Every two weeks", minutes: 60, format: "video", count: 2, members: [avery] });
  expect((await consult(cass)).groups).toHaveLength(0);
  const p = await post(avery, { audience: "group", groupId: g.id });
  expect((await discussions(bram)).find((x) => x.id === p.id)).toMatchObject({ audience: "group", groupId: Number(g.id) });
  expect((await discussions(cass)).map((x) => x.id)).not.toContain(p.id);
  expect((await discussions(fenn)).map((x) => x.id)).not.toContain(p.id);
  await expect(post(cass, { audience: "group", groupId: g.id })).rejects.toThrow(/Only members of this group/);
  await expect(post(avery, { audience: "group" })).rejects.toThrow(/Only members of this group/);
});

test("NC-05 replies are stored once, newest first, seen only by those who can see the question, and the right people are told", async () => {
  const p = await post(avery, { audience: "network" });
  await q(`update consultations set created_at = now() - interval '2 hours' where id = $1`, [p.id]);
  const cid = uuid();
  const r1 = await reply(bram, p.id, "A first view.", cid);
  const again = await reply(bram, p.id, "A first view.", cid);
  expect(again).toMatchObject({ id: r1.id, existing: true });
  expect((await q(`select 1 from consultation_responses where consultation_id = $1`, [p.id])).length).toBe(1);
  await q(`update consultation_responses set created_at = now() - interval '1 hour' where consultation_id = $1`, [p.id]);
  await reply(cass, p.id, "A second view.");
  expect((await one(`select status from consultations where id = $1`, [p.id])).status).toBe("responses_received");
  const d = (await discussions(avery)).find((x) => x.id === p.id);
  expect(d.replies).toBe(2);
  expect(d.history.map((h: any) => h.text)).toEqual(["A second view.", "A first view."]);
  expect(d.history[0].person).toBe(cass);
  expect((await discussions(cass)).find((x) => x.id === p.id).history[0].person).toBe("me");
  // The asker is told (with email); a colleague who follows it sees it in the app only.
  expect((await notices(avery, `consult-reply:${p.id}:%`)).map((n) => n.channel).sort()).toEqual(["email", "email", "in_app", "in_app"]);
  await rpc(fenn, `select public.consult_follow($1::bigint, true) as r`, [p.id]);
  await reply(bram, p.id, "Another thought.");
  expect((await notices(fenn, `consult-follow:${p.id}:%`)).map((n) => n.channel)).toEqual(["in_app"]);
  // A reply must be real, and short enough.
  await expect(reply(bram, p.id, "   ")).rejects.toThrow(/Write a reply first/);
  await expect(reply(bram, p.id, "x".repeat(3001))).rejects.toThrow(/a little long/);
  // Not for someone who cannot see the question, or who is blocked from its author.
  const hidden = await post(avery, { audience: "one", recipients: [bram] });
  await expect(reply(cass, hidden.id, "Hello")).rejects.toThrow(/not available/);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [avery, fenn]);
  await expect(reply(fenn, p.id, "Hello")).rejects.toThrow(/not available/);
  expect((await discussions(fenn)).map((x) => x.id)).not.toContain(p.id);
  // Blocked replies drop out of what the blocker sees.
  await q(`delete from blocked_members where profile_id = $1`, [avery]);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [avery, cass]);
  expect((await discussions(avery)).find((x) => x.id === p.id).history.map((h: any) => h.person)).not.toContain(cass);
});

test("NC-06 following and Useful are private, Useful adds a colleague to Suggested, and no one sees who marked what", async () => {
  // PsyAlliance's own suggestions for Cass are set aside for this check and put back after.
  const kept = await q(`select * from suggested_colleagues where profile_id = $1`, [cass]);
  await q(`delete from suggested_colleagues where profile_id = $1`, [cass]);
  try {
    await usefulChecks();
  } finally {
    for (const k of kept) await q(`insert into suggested_colleagues (profile_id, colleague_id, position) values ($1, $2, $3) on conflict do nothing`, [k.profile_id, k.colleague_id, k.position]);
  }
});

async function usefulChecks() {
  const p = await post(avery, { audience: "network" });
  const r = await reply(bram, p.id, "Something helpful.");
  const rid = Number(String(r.id).slice(1));
  // Following: only the member's own, and it needs a discussion they can see.
  expect((await consult(avery)).following).toContain(Number(p.id));
  expect((await rpc(cass, `select public.consult_follow($1::bigint, true) as r`, [p.id])).on).toBe(true);
  expect((await consult(cass)).following).toEqual([Number(p.id)]);
  expect((await consult(fenn)).following).toEqual([]);
  expect((await rpc(cass, `select public.consult_follow($1::bigint, false) as r`, [p.id])).on).toBe(false);
  const hidden = await post(avery, { audience: "one", recipients: [bram] });
  await expect(rpc(cass, `select public.consult_follow($1::bigint, true) as r`, [hidden.id])).rejects.toThrow(/not available/);
  // Useful.
  expect((await tiers(cass)).suggested).not.toContain(bram);
  const bramBefore = (await tiers(bram)).suggested;
  expect((await rpc(cass, `select public.consult_useful($1::bigint, true) as r`, [rid])).on).toBe(true);
  expect((await consult(cass)).useful).toEqual([`r${rid}`]);
  expect((await consult(bram)).useful).toEqual([]);
  expect((await consult(avery)).useful).toEqual([]);
  expect((await tiers(cass)).suggested).toContain(bram);
  expect((await tiers(cass)).worked).not.toContain(bram);
  expect((await tiers(bram)).suggested).toEqual(bramBefore);
  expect(await q(`select 1 from consultation_response_useful`, [])).toHaveLength(1);
  await expect(asMember(bram, `select * from consultation_response_useful`).then((r) => r.rows)).resolves.toEqual([]);
  await expect(rpc(bram, `select public.consult_useful($1::bigint, true) as r`, [rid])).rejects.toThrow(/colleague.s reply/);
  expect((await rpc(cass, `select public.consult_useful($1::bigint, false) as r`, [rid])).on).toBe(false);
  expect((await tiers(cass)).suggested).not.toContain(bram);
  // The person who asked marking it also keeps the earlier author-only mark in step.
  await rpc(avery, `select public.consult_useful($1::bigint, true) as r`, [rid]);
  expect((await one(`select marked_useful from consultation_responses where id = $1`, [rid])).marked_useful).toBe(true);
  await rpc(avery, `select public.consult_useful($1::bigint, false) as r`, [rid]);
  expect((await one(`select marked_useful from consultation_responses where id = $1`, [rid])).marked_useful).toBe(false);
}

test("NC-07 people in a discussion who are no longer in the directory are still named, and removed questions disappear", async () => {
  const p = await post(avery, { audience: "network" });
  await reply(bram, p.id, "From someone who then left the directory.");
  await q(`update profiles set directory_visible = false where id = $1`, [bram]);
  const known = (await rpc(cass, `select public.workspace_known() as r`)) as any[];
  expect(known.map((k) => k.id)).toContain(bram);
  expect(known.find((k) => k.id === bram)).toMatchObject({ limited: true });
  const full = await rpc(cass, `select public.workspace_discussion($1::bigint) as r`, [p.id]);
  expect(full.history).toHaveLength(1);
  // An administrator removing a question (patient information) takes it out of every list.
  await q(`update consultations set status = 'removed' where id = $1`, [p.id]);
  expect((await discussions(cass)).map((x) => x.id)).not.toContain(p.id);
  expect(await rpc(cass, `select public.workspace_discussion($1::bigint) as r`, [p.id])).toBeNull();
});

test("NC-08 the library lists what the member may see; saving a resource is private and only for real ones", async () => {
  const res = await rpc(avery, `select public.workspace_resources() as r`);
  const codes = res.resources.map((x: any) => x.code);
  expect(codes).toEqual(expect.arrayContaining(["PA-01", "PA-03"]));
  expect(res.resources.every((x: any) => ["provisional", "published"].includes(x.status))).toBe(true);
  expect(res.saved).toEqual([]);
  expect(await rpc(avery, `select public.resource_save('PA-01', true) as r`)).toEqual({ on: true });
  expect(await rpc(avery, `select public.resource_save('guide:3', true) as r`)).toEqual({ on: true });
  expect((await rpc(avery, `select public.workspace_resources() as r`)).saved.sort()).toEqual(["PA-01", "guide:3"]);
  expect((await rpc(bram, `select public.workspace_resources() as r`)).saved).toEqual([]);
  expect(await rpc(avery, `select public.resource_save('PA-01', false) as r`)).toEqual({ on: false });
  await expect(rpc(avery, `select public.resource_save('PA-99', true) as r`)).rejects.toThrow(/isn.t available/);
  await expect(rpc(avery, `select public.resource_save('anything', true) as r`)).rejects.toThrow(/can.t be saved/);
  // A hidden (draft) template is not listed and cannot be saved.
  await q(`update documents set review_status = 'draft' where library_code = 'PA-03'`);
  try {
    expect((await rpc(avery, `select public.workspace_resources() as r`)).resources.map((x: any) => x.code)).not.toContain("PA-03");
    await expect(rpc(avery, `select public.resource_save('PA-03', true) as r`)).rejects.toThrow(/isn.t available/);
  } finally {
    await q(`update documents set review_status = 'provisional' where library_code = 'PA-03'`);
  }
});

test("NC-09 the workspace loads all of this with the first page, and nothing is marked reviewed by any of it", async () => {
  await trust(avery, bram, true);
  const boot = await rpc(avery, `select public.workspace_boot() as r`);
  expect(boot.gate).toBe("ok");
  expect(Object.keys(boot)).toEqual(expect.arrayContaining(["discussions", "following", "useful", "groups", "consultQuiet", "resources", "saved", "preferences"]));
  expect(boot.tiers.trust).toEqual([bram]);
  expect((await q(`select 1 from documents where review_status = 'published' and library_code is not null`)).length).toBe(0);
  expect((await q(`select 1 from document_reviews`)).length).toBe(0);
});
