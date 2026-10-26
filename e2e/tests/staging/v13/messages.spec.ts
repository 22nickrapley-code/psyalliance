import { test, expect } from "@playwright/test";
import { account } from "../../../lib/auth";
import { assertLocal, q, one, asMember } from "../../../lib/staging";

// V13 workspace: Messages on the real database. Fictional staging members only.
// Every check runs the way the app does: as the signed-in member, through the
// same functions the screens call.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
test.describe.configure({ mode: "serial" });

const id = (n: string) => account(n).id;
const avery = id("avery"), bram = id("bram"), cass = id("cass"), fenn = id("fenn"), pell = id("pell"), sol = id("sol");
const everyone = [avery, bram, cass, fenn];
const uuid = () => crypto.randomUUID();

const open = async (who: string, kind: string, a: number | null, b: number | null, person: string | null) =>
  (await asMember(who, `select public.conversation_open($1, $2::bigint, $3::bigint, $4::uuid) as r`, [kind, a, b, person])).rows[0].r as { key: string };
const send = async (who: string, key: string, body: string, cid = uuid(), attachment: unknown = null) =>
  (await asMember(who, `select public.message_send($1, $2, $3::uuid, $4::jsonb) as r`, [key, body, cid, attachment ? JSON.stringify(attachment) : null])).rows[0].r;
const edit = async (who: string, key: string, msg: string, body: string) => (await asMember(who, `select public.message_edit($1, $2, $3) as r`, [key, msg, body])).rows[0].r;
const remove = async (who: string, key: string, msg: string) => (await asMember(who, `select public.message_remove($1, $2) as r`, [key, msg])).rows[0].r;
const react = async (who: string, key: string, msg: string, on: boolean) => (await asMember(who, `select public.message_react($1, $2, $3) as r`, [key, msg, on])).rows[0].r;
const read = async (who: string, key: string) => (await asMember(who, `select public.conversation_read($1) as r`, [key])).rows[0].r;
const threads = async (who: string) => (await asMember(who, `select public.workspace_threads() as r`)).rows[0].r as any[];
const thread = async (who: string, key: string) => (await threads(who)).find((t) => t.id === key);
const directKey = (a: string, b: string) => `direct-${[a, b].sort()[0]}-${[a, b].sort()[1]}`;

const coverPayload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), name: "Autumn leave", reason: "short", other: "", start: "2026-11-02", end: "2026-11-13", mode: "parallel", deadline: 48,
  message: "Weekly appointments.", clients: [{ label: "Client 1", focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", age: "", setting: "virtual",
    insurance: "", frequency: "Weekly", prescribing: false, language: "", city: "", selected: [bram] }], ...over,
});
const referralPayload = (over: Record<string, unknown> = {}) => ({
  requestId: uuid(), focus: "Anxiety/Panic Disorders", secondary: "", state: "NY", city: "", age: "", setting: "virtual", insurance: "", language: "",
  prescribing: false, audience: "selected", selected: [bram], timeframe: "Within two weeks", message: "", ...over,
});

async function wipe() {
  await q(`delete from conversations where created_by = any($1::uuid[]) or id in (select conversation_id from conversation_participants where profile_id = any($1::uuid[]))`, [everyone]);
  await q(`delete from coverage_plans where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from referral_requests where requesting_profile_id = any($1::uuid[]) and client_request_id is not null`, [everyone]);
  await q(`delete from blocked_members where profile_id = any($1::uuid[])`, [everyone]);
  await q(`delete from notification_events where dedup_key like 'message:%' or dedup_key like 'referral%' or dedup_key like 'coverage%' or dedup_key like 'cover_%'`);
}
test.beforeEach(wipe);
test.afterAll(wipe);

test("MS-01 a direct conversation is opened once, whoever opens it", async () => {
  const a = await open(avery, "direct", null, null, bram);
  expect(a.key).toBe(directKey(avery, bram));
  const b = await open(bram, "direct", null, null, avery);
  expect(b.key).toBe(a.key);
  expect((await q(`select 1 from conversations where context_key = $1`, [a.key])).length).toBe(1);
  expect((await q(`select 1 from conversation_participants p join conversations c on c.id = p.conversation_id where c.context_key = $1`, [a.key])).length).toBe(2);
  // Only colleagues who can be messaged: pending and suspended members, yourself, and blocked pairs are refused.
  await expect(open(avery, "direct", null, null, pell)).rejects.toThrow(/can.t be messaged/);
  await expect(open(avery, "direct", null, null, sol)).rejects.toThrow(/can.t be messaged/);
  await expect(open(avery, "direct", null, null, avery)).rejects.toThrow(/Choose a colleague/);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [bram, cass]);
  await expect(open(cass, "direct", null, null, bram)).rejects.toThrow(/can.t be messaged/);
});

test("MS-02 a message is stored once however many times it is sent; the colleague is told once", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  const cid = uuid();
  const first = await send(avery, key, "Hello Bram.", cid);
  expect(first.duplicate).toBe(false);
  const retry = await send(avery, key, "Hello Bram.", cid);
  expect(retry).toMatchObject({ duplicate: true, dbId: first.dbId, id: cid });
  const [x, y] = await Promise.all([send(avery, key, "Second", uuid()), send(avery, key, "Second", uuid())]);
  expect(x.dbId).not.toBe(y.dbId);
  const same = uuid();
  const [p, r] = await Promise.all([send(avery, key, "Third", same), send(avery, key, "Third", same)]);
  expect(p.dbId).toBe(r.dbId);
  expect((await q(`select 1 from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1 and m.body in ('Hello Bram.', 'Third')`, [key])).length).toBe(2);
  // One in-app notice for Bram for the whole conversation (the same key never repeats within a day); the email waits an hour.
  const conv = (await one(`select id from conversations where context_key = $1`, [key])).id;
  const sent = await q(`select d.channel, d.send_after > now() + interval '50 minutes' as held from notification_deliveries d join notification_events e on e.id = d.notification_event_id
                        where d.recipient_profile_id = $1 and e.event_type = 'message_received' and e.dedup_key = $2 order by d.channel`, [bram, `message:${conv}`]);
  expect(sent.map((x) => x.channel)).toEqual(["email", "in_app"]);
  expect(sent.find((x) => x.channel === "email")!.held).toBe(true);
  // Empty, oversize and someone else's conversation.
  await expect(send(avery, key, "   ")).rejects.toThrow(/Write a message first/);
  await expect(send(avery, key, "x".repeat(4001))).rejects.toThrow(/under 4,000/);
  await expect(send(cass, key, "Let me in")).rejects.toThrow(/Conversation not found/);
});

test("MS-03 each person sees the same conversation from their own side; reading clears what is new", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  await send(avery, key, "One");
  await send(avery, key, "Two");
  const own = await thread(avery, key);
  expect(own).toMatchObject({ id: key, person: bram, type: "Direct", unread: 0, more: false });
  expect(own.messages.map((m: any) => [m.text, m.own])).toEqual([["One", true], ["Two", true]]);
  const theirs = await thread(bram, key);
  expect(theirs).toMatchObject({ person: avery, unread: 2 });
  expect(theirs.messages.map((m: any) => m.own)).toEqual([false, false]);
  expect(await read(bram, key)).toMatchObject({ ok: true });
  expect((await thread(bram, key)).unread).toBe(0);
  await send(bram, key, "Reply");
  expect((await thread(avery, key)).unread).toBe(1);
  // Strangers see nothing of it.
  expect(await thread(cass, key)).toBeUndefined();
  expect(await read(cass, key)).toMatchObject({ ok: false });
});

test("MS-04 the same colleague in a cover plan, a referral and a direct chat is three separate conversations", async () => {
  const plan = (await asMember(avery, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify(coverPayload())])).rows[0].r;
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify(referralPayload({ message: "Evenings if possible." }))])).rows[0].r;
  const caseId = Number((await one(`select id from coverage_plan_cases where coverage_plan_id = $1`, [plan.planId])).id);
  const c = await open(avery, "cover", plan.planId, caseId, bram);
  const r = await open(avery, "referral", ref.referralId, null, bram);
  const d = await open(avery, "direct", null, null, bram);
  expect(new Set([c.key, r.key, d.key]).size).toBe(3);
  expect(c.key).toBe(`cover-${plan.planId}-${caseId}-${bram}`);
  expect(r.key).toBe(`referral-${ref.referralId}-${bram}`);
  // Bram opening them from his side lands in the same three.
  expect((await open(bram, "cover", plan.planId, caseId, null)).key).toBe(c.key);
  expect((await open(bram, "referral", ref.referralId, null, null)).key).toBe(r.key);
  await send(avery, c.key, "About the cover only.");
  await send(avery, r.key, "About the referral only.");
  const all = await threads(avery);
  expect(all.map((t: any) => t.type).sort()).toEqual(["Cover", "Direct", "Referral"]);
  const cv = all.find((t: any) => t.id === c.key), rf = all.find((t: any) => t.id === r.key), dr = all.find((t: any) => t.id === d.key);
  // Cover and referral conversations open with the request itself, in the sender's words.
  expect(cv.messages.map((m: any) => m.text)).toEqual(["Weekly appointments.", "About the cover only."]);
  expect(rf.messages.map((m: any) => m.text)).toEqual(["Evenings if possible.", "About the referral only."]);
  expect(dr.messages).toHaveLength(0);
  expect(cv).toMatchObject({ coverId: plan.planId, clientId: caseId, referralId: null });
  expect(rf).toMatchObject({ referralId: ref.referralId, coverId: null });
  // The seeded line is the organiser's, and counts as new for Bram until he reads it.
  expect(cv.messages[0].own).toBe(true);
  const bc = await thread(bram, c.key);
  expect(bc.messages[0].own).toBe(false);
  // Someone who was not asked cannot open either.
  await expect(open(cass, "cover", plan.planId, caseId, null)).rejects.toThrow(/Conversation not found/);
  await expect(open(cass, "referral", ref.referralId, null, null)).rejects.toThrow(/Referral not found/);
});

test("MS-05 a request line with no note uses the usual wording", async () => {
  const plan = (await asMember(avery, `select public.cover_create_plan($1::jsonb) as r`, [JSON.stringify(coverPayload({ message: "" }))])).rows[0].r;
  const ref = (await asMember(avery, `select public.referral_create($1::jsonb) as r`, [JSON.stringify(referralPayload({ message: "" }))])).rows[0].r;
  const caseId = Number((await one(`select id from coverage_plan_cases where coverage_plan_id = $1`, [plan.planId])).id);
  const c = await open(avery, "cover", plan.planId, caseId, bram);
  const r = await open(avery, "referral", ref.referralId, null, bram);
  expect((await thread(avery, c.key)).messages[0].text).toBe("Client 1: Anxiety/Panic Disorders. Nov 2 – Nov 13. Shall we discuss the cover arrangements?");
  expect((await thread(avery, r.key)).messages[0].text).toBe("I’d like to discuss a anxiety/panic disorders referral in New York. Virtual appointments.");
});

test("MS-06 edit and remove are the author's, edit is open for fifteen minutes, removing keeps the order", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  const a = await send(avery, key, "First");
  const b = await send(bram, key, "From Bram");
  await send(avery, key, "Third");
  expect(await edit(avery, key, a.id, "First, corrected")).toMatchObject({ ok: true });
  const v = await thread(avery, key);
  expect(v.messages[0]).toMatchObject({ text: "First, corrected", edited: true });
  await expect(edit(avery, key, b.id, "Not mine")).rejects.toThrow(/Message not found/);
  await expect(edit(avery, key, a.id, "  ")).rejects.toThrow(/can.t be empty/);
  await expect(remove(avery, key, b.id)).rejects.toThrow(/Message not found/);
  await q(`update conversation_messages set created_at = now() - interval '20 minutes' where id = $1`, [a.dbId]);
  await expect(edit(avery, key, a.id, "Too late")).rejects.toThrow(/edited for 15 minutes/);
  // Removing is still allowed after that.
  expect(await remove(avery, key, a.id)).toMatchObject({ ok: true });
  expect((await thread(avery, key)).messages.map((m: any) => m.text)).toEqual(["From Bram", "Third"]);
  expect((await thread(bram, key)).messages.map((m: any) => m.text)).toEqual(["From Bram", "Third"]);
  // A message can be named by its stored number too (messages from before the workspace).
  const old = await one(`insert into conversation_messages (conversation_id, author_id, body) select id, $2, 'Older one' from conversations where context_key = $1 returning id`, [key, avery]);
  expect(await edit(avery, key, `m${old.id}`, "Older one, edited")).toMatchObject({ ok: true });
});

test("MS-07 a heart is private to whoever gave it; giving it twice is one", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  const m = await send(avery, key, "Useful note");
  expect(await react(bram, key, m.id, true)).toMatchObject({ on: true });
  await react(bram, key, m.id, true);
  expect((await q(`select 1 from message_reactions where message_id = $1`, [m.dbId])).length).toBe(1);
  expect((await thread(bram, key)).messages[0].reaction).toBe("♥");
  expect((await thread(avery, key)).messages[0].reaction).toBeUndefined();
  await react(bram, key, m.id, false);
  expect((await thread(bram, key)).messages[0].reaction).toBeUndefined();
  await expect(react(cass, key, m.id, true)).rejects.toThrow(/Conversation not found/);
});

test("MS-08 a file and a voice note belong to the conversation; only its two people can open them", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  const conv = (await one(`select id from conversations where context_key = $1`, [key])).id;
  const file = { kind: "file", path: `${conv}/${avery}/${uuid()}-plan.pdf`, name: "plan.pdf", size: 52_000, mime: "application/pdf" };
  const m = await send(avery, key, "", uuid(), file);
  const voice = await send(bram, key, "", uuid(), { kind: "audio", path: `${conv}/${bram}/${uuid()}.webm`, name: "Voice note", size: 9_000, mime: "audio/webm", duration: 75 });
  const t = await thread(avery, key);
  expect(t.messages[0].attachment).toMatchObject({ name: "plan.pdf", size: "51 KB", url: `/dashboard/message-files/${m.dbId}` });
  expect(t.messages[1].audio).toMatchObject({ duration: "1:15", url: `/dashboard/message-files/${voice.dbId}` });
  expect((await asMember(bram, `select public.message_file($1::bigint) as r`, [m.dbId])).rows[0].r).toMatchObject({ path: file.path, name: "plan.pdf", kind: "file" });
  expect((await asMember(cass, `select public.message_file($1::bigint) as r`, [m.dbId])).rows[0].r).toBeNull();
  // A path for somebody else's folder, a made-up kind, and a file over 20 MB are refused.
  await expect(send(avery, key, "", uuid(), { ...file, path: `${conv}/${bram}/x.pdf` })).rejects.toThrow(/attachment can.t be sent/);
  await expect(send(avery, key, "", uuid(), { ...file, kind: "video" })).rejects.toThrow(/attachment can.t be sent/);
  await expect(send(avery, key, "", uuid(), { ...file, size: 21 * 1024 * 1024 })).rejects.toThrow(/smaller than 20 MB/);
  // A voice note cannot be edited; removing a message returns the stored path so the file can go too.
  await expect(edit(bram, key, voice.id, "words")).rejects.toThrow(/voice note can.t be edited/);
  expect(await remove(avery, key, m.id)).toMatchObject({ ok: true, path: file.path });
  expect((await asMember(bram, `select public.message_file($1::bigint) as r`, [m.dbId])).rows[0].r).toBeNull();
  expect((await q(`select 1 from message_attachments where message_id = $1`, [m.dbId])).length).toBe(0);
});

test("MS-09 only the latest 200 come with the conversation; older ones come 100 at a time", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  const conv = (await one(`select id from conversations where context_key = $1`, [key])).id;
  await q(`insert into conversation_messages (conversation_id, author_id, body, created_at)
           select $1, $2, 'm' || g, now() - (310 - g) * interval '1 minute' from generate_series(1, 305) g`, [conv, avery]);
  const t = await thread(bram, key);
  expect(t.more).toBe(true);
  expect(t.messages).toHaveLength(200);
  expect(t.messages[0].text).toBe("m106");
  expect(t.messages.at(-1).text).toBe("m305");
  const first = (await asMember(bram, `select public.thread_older($1, $2::bigint) as r`, [key, t.messages[0].dbId])).rows[0].r;
  expect(first.messages).toHaveLength(100);
  expect(first.messages[0].text).toBe("m6");
  expect(first.messages.at(-1).text).toBe("m105");
  expect(first.more).toBe(true);
  const last = (await asMember(bram, `select public.thread_older($1, $2::bigint) as r`, [key, first.messages[0].dbId])).rows[0].r;
  expect(last.messages.map((m: any) => m.text)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
  expect(last.more).toBe(false);
  expect((await asMember(cass, `select public.thread_older($1, null) as r`, [key])).rows[0].r.messages).toEqual([]);
});

test("MS-10 a blocked pair stops seeing each other's conversation; their history is kept", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  await send(avery, key, "Before the block");
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [bram, avery]);
  expect(await thread(avery, key)).toBeUndefined();
  expect(await thread(bram, key)).toBeUndefined();
  expect((await q(`select 1 from conversation_messages m join conversations c on c.id = m.conversation_id where c.context_key = $1`, [key])).length).toBe(1);
  await expect(open(avery, "direct", null, null, bram)).rejects.toThrow(/can.t be messaged/);
});

test("MS-11 people from earlier conversations stay readable after they leave the directory", async () => {
  const { key } = await open(avery, "direct", null, null, bram);
  await send(bram, key, "Still here?");
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [avery, bram]);
  const known = (await asMember(avery, `select public.workspace_known() as r`)).rows[0].r as any[];
  expect(known.map((k) => k.id)).toContain(bram);
  expect(known.find((k) => k.id === bram)).toMatchObject({ limited: true, bio: "" });
  const boot = (await asMember(avery, `select public.workspace_boot() as r`)).rows[0].r;
  expect(Array.isArray(boot.threads)).toBe(true);
});
