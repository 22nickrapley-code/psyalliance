import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { memberClient, account, disposableMember } from "../../lib/auth";
import { q, one, assertLocal } from "../../lib/staging";

// Release-review findings that live in the data layer, exercised through the
// same supabase-js calls the app's server actions make, with each member's
// own permissions. Each test states the correct behaviour: on the deployed
// baseline (c131fdc) these are expected to FAIL, reproducing the finding.
//
// N16-02  one winner for a cover case and for a referral
// R04     erasure cannot leave stored files behind
// N01     the consultation author can mark a reply useful, and it saves

const NY = "NY";
const today = new Date().toISOString().slice(0, 10);
const inWeeks = (n: number) => new Date(Date.now() + n * 7 * 86400000).toISOString().slice(0, 10);

async function coverCaseWithRequests(ownerKey: string, recipientKeys: string[]) {
  const owner = await memberClient(ownerKey);
  const ownerId = account(ownerKey).id;
  const { data: plan, error: e1 } = await owner
    .from("coverage_plans")
    .insert({ profile_id: ownerId, title: `QA staging plan ${Date.now()}`, plan_type: "extended_leave", absence_type: "extended_leave", jurisdiction_state: NY, outreach_mode: "parallel", starts_on: inWeeks(2), ends_on: inWeeks(6), status: "active" })
    .select("id")
    .single();
  expect(e1, e1?.message).toBeNull();
  const { data: kase, error: e2 } = await owner
    .from("coverage_plan_cases")
    .insert({ coverage_plan_id: plan!.id, case_reference: "Client 1", specialism_lookup_ids: [7], modality: "either", jurisdiction_state: NY })
    .select("id")
    .single();
  expect(e2, e2?.message).toBeNull();
  const requests: Record<string, number> = {};
  for (const [i, k] of recipientKeys.entries()) {
    const { data: r, error } = await owner
      .from("coverage_requests")
      .insert({ coverage_plan_case_id: kase!.id, requested_profile_id: account(k).id, sequence_order: i + 1 })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    requests[k] = r!.id;
  }
  return { planId: plan!.id as number, caseId: kase!.id as number, requests };
}

// What the app does to accept (src/lib/coverage.ts): the locking database
// function where the build has it, otherwise a direct update.
const missing = (e: any) => e && (e.code === "PGRST202" || /could not find the function/i.test(e.message || ""));
async function accept(key: string, requestId: number, direct = false) {
  const c = await memberClient(key);
  if (!direct) {
    const { data, error } = await c.rpc("respond_to_cover_request", { p_request: requestId, p_response: "accepted" });
    if (!missing(error)) return { error: error?.message ?? null, rows: error ? 0 : 1, via: "rpc", data };
  }
  const { data, error } = await c.from("coverage_requests").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", requestId).select("id");
  return { error: error?.message ?? null, rows: data?.length ?? 0, via: "direct" };
}

async function caseState(caseId: number) {
  return one<{ status: string; assigned: string | null; accepted: number }>(
    `select c.status::text status, c.assigned_clinician_id::text assigned,
            (select count(*)::int from coverage_requests r where r.coverage_plan_case_id = c.id and r.status = 'accepted') accepted
       from coverage_plan_cases c where c.id = $1`,
    [caseId]
  );
}

test.describe("N16-02 one winner", () => {
  test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

  test("N16-02-A sequential: a second colleague cannot accept an already covered case", async ({}, info) => {
    const { caseId, requests } = await coverCaseWithRequests("avery", ["bram", "cass"]);
    const first = await accept("bram", requests.bram);
    expect(first.error).toBeNull();
    const second = await accept("cass", requests.cass);
    const s = await caseState(caseId);
    await info.attach("outcome.json", { body: JSON.stringify({ first, second, case: s }, null, 2), contentType: "application/json" });
    expect(s.accepted, "accepted requests for the case").toBe(1);
    expect(s.assigned, "assigned clinician").toBe(account("bram").id);
    expect(second.error ?? (second.rows === 0 ? "no row changed" : null), "the later acceptance is refused").not.toBeNull();
  });

  test("N16-02-B concurrent: two colleagues accept at the same moment, one wins", async ({}, info) => {
    const { caseId, requests } = await coverCaseWithRequests("avery", ["bram", "cass"]);
    const [b, c] = await Promise.all([accept("bram", requests.bram), accept("cass", requests.cass)]);
    const s = await caseState(caseId);
    await info.attach("outcome.json", { body: JSON.stringify({ bram: b, cass: c, case: s }, null, 2), contentType: "application/json" });
    expect(s.accepted).toBe(1);
    expect([account("bram").id, account("cass").id]).toContain(s.assigned);
    const winners = [b, c].filter((r) => !r.error && r.rows > 0).length;
    expect(winners, "exactly one acceptance succeeded").toBe(1);
  });

  test("N16-02-C duplicate submission by the same colleague stays one acceptance", async ({}, info) => {
    const { caseId, requests } = await coverCaseWithRequests("avery", ["bram", "cass"]);
    const [x, y] = await Promise.all([accept("bram", requests.bram), accept("bram", requests.bram)]);
    const s = await caseState(caseId);
    await info.attach("outcome.json", { body: JSON.stringify({ x, y, case: s }, null, 2), contentType: "application/json" });
    expect(s.accepted).toBe(1);
    expect(s.assigned).toBe(account("bram").id);
    expect(s.status).toBe("confirmed");
  });

  test("N16-02-D the other colleagues' open requests are settled when one accepts", async ({}, info) => {
    const { caseId, requests } = await coverCaseWithRequests("avery", ["bram", "cass", "fenn"]);
    await accept("bram", requests.bram);
    const rows = await q(`select requested_profile_id::text who, status::text from coverage_requests where coverage_plan_case_id = $1 order by sequence_order`, [caseId]);
    await info.attach("requests.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    const open = rows.filter((r: any) => ["sent", "discussing"].includes(r.status));
    expect(open, "no request is left open on a covered case").toHaveLength(0);
  });

  async function referralWithInterest(ownerKey: string, keys: string[]) {
    const owner = await memberClient(ownerKey);
    const ids = keys.map((k) => account(k).id);
    const { data: ref, error } = await owner
      .from("referral_requests")
      .insert({ requesting_profile_id: account(ownerKey).id, specialism_lookup_ids: [7], specialism_lookup_id: 7, state: NY, status: "sent", audience_type: "selected", audience_profile_ids: ids, timeframe: "within_month" })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    for (const k of keys) {
      const c = await memberClient(k);
      const { error: e } = await c.from("referral_responses").insert({ referral_request_id: ref!.id, responding_profile_id: account(k).id, status: "interested" });
      expect(e, e?.message).toBeNull();
    }
    return { owner, referralId: ref!.id as number };
  }

  // What establishProfessionalConnection does (src/lib/referrals-v2.ts):
  // the locking function where the build has it, otherwise two updates.
  async function choose(owner: any, referralId: number, key: string, direct = false) {
    if (!direct) {
      const { error } = await owner.rpc("choose_referral_colleague", { p_referral: referralId, p_colleague: account(key).id });
      if (!missing(error)) return { error: error?.message ?? null, via: "rpc" };
    }
    const r1 = await owner.from("referral_responses").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("referral_request_id", referralId).eq("responding_profile_id", account(key).id).select("id");
    if (r1.error) return { error: r1.error.message };
    const r2 = await owner.from("referral_requests").update({ status: "connected" }).eq("id", referralId).select("id");
    return { error: r2.error?.message ?? null, rows: r1.data?.length ?? 0 };
  }

  test("N16-02-E referral: choosing a second colleague leaves one chosen colleague", async ({}, info) => {
    const { owner, referralId } = await referralWithInterest("avery", ["bram", "cass"]);
    const first = await choose(owner, referralId, "bram");
    const second = await choose(owner, referralId, "cass");
    const rows = await q(`select responding_profile_id::text who, status from referral_responses where referral_request_id = $1`, [referralId]);
    await info.attach("outcome.json", { body: JSON.stringify({ first, second, rows }, null, 2), contentType: "application/json" });
    expect(rows.filter((r: any) => r.status === "accepted")).toHaveLength(1);
  });

  test("N16-02-F referral: two choices at the same moment leave one chosen colleague", async ({}, info) => {
    const { owner, referralId } = await referralWithInterest("avery", ["bram", "cass"]);
    const owner2 = await memberClient("avery");
    await Promise.all([choose(owner, referralId, "bram"), choose(owner2, referralId, "cass")]);
    const rows = await q(`select responding_profile_id::text who, status from referral_responses where referral_request_id = $1`, [referralId]);
    await info.attach("outcome.json", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
    expect(rows.filter((r: any) => r.status === "accepted")).toHaveLength(1);
  });
});

test.describe("N16-02 one winner for direct calls", () => {
  test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

  test("N16-02-G direct table updates (bypassing the app) still leave one winner", async ({}, info) => {
    const { caseId, requests } = await coverCaseWithRequests("avery", ["bram", "cass"]);
    const [b, c] = await Promise.all([accept("bram", requests.bram, true), accept("cass", requests.cass, true)]);
    const s = await caseState(caseId);
    await info.attach("outcome.json", { body: JSON.stringify({ bram: b, cass: c, case: s }, null, 2), contentType: "application/json" });
    expect(s.accepted).toBe(1);
  });

  test("N16-02-H a stale accept after the plan was cancelled is refused", async ({}, info) => {
    const { planId, caseId, requests } = await coverCaseWithRequests("avery", ["bram"]);
    const owner = await memberClient("avery");
    await owner.from("coverage_plans").update({ status: "cancelled" }).eq("id", planId);
    const r = await accept("bram", requests.bram);
    const s = await caseState(caseId);
    await info.attach("outcome.json", { body: JSON.stringify({ accept: r, case: s }, null, 2), contentType: "application/json" });
    expect(s.accepted).toBe(0);
    expect(r.error).toBeTruthy();
  });
});

test.describe("R04 erasure", () => {
  test("R04-A calling delete_my_account directly cannot leave a member's stored file behind", async ({ baseURL }, info) => {
    assertLocal(baseURL!);
    const m = await disposableMember("erasure");
    await q(
      `insert into profiles (id, full_name, qualification_level, primary_state, verification_status) values ($1, 'Disposable Erasure', 'PhD', 'NY', 'pending')`,
      [m.id]
    );
    const bytes = Buffer.from(`%PDF-1.4\n% fictional staging bytes ${Date.now()}\n%%EOF\n`);
    const objectPath = `personal/${m.id}/${Date.now()}-qa-erasure.pdf`;
    const up = await m.client.storage.from("documents").upload(objectPath, bytes, { contentType: "application/pdf" });
    expect(up.error, up.error?.message).toBeNull();
    const before = await q(`select id from storage.objects where bucket_id = 'documents' and name = $1`, [objectPath]);
    expect(before).toHaveLength(1);
    const onDisk = () => {
      const root = "/opt/stage/storage-files";
      const hits: string[] = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (p.includes(m.id)) hits.push(p);
        }
      };
      walk(root);
      return hits;
    };
    expect(onDisk().length, "file bytes written").toBeGreaterThan(0);

    const rpc = await m.client.rpc("delete_my_account", { p_confirm: "DELETE" });
    const user = await q(`select id from auth.users where id = $1`, [m.id]);
    const after = await q(`select id from storage.objects where bucket_id = 'documents' and name like $1`, [`personal/${m.id}/%`]);
    const bytesLeft = onDisk();
    await info.attach("outcome.json", { body: JSON.stringify({ rpcError: rpc.error?.message ?? null, userRemains: user.length, objectRows: after.length, fileBytesOnDisk: bytesLeft.length }, null, 2), contentType: "application/json" });
    // Acceptable outcomes: the direct call is refused while files remain, or
    // the account and every stored file are gone together.
    if (user.length === 0) {
      expect(after, "storage rows left after erasure").toHaveLength(0);
      expect(bytesLeft, "file bytes left after erasure").toHaveLength(0);
    } else {
      expect(rpc.error, "a refused direct call says why").not.toBeNull();
      expect(after).toHaveLength(1);
    }
  });
});

test.describe("N01 useful", () => {
  test("N01-A the consultation author marks a reply useful and it saves; the replier cannot", async ({ baseURL }, info) => {
    assertLocal(baseURL!);
    const avery = await memberClient("avery");
    const bram = await memberClient("bram");
    const { data: c, error } = await avery
      .from("consultations")
      .insert({ author_profile_id: account("avery").id, question: `QA useful ${Date.now()}: a fictional practice question for staging.`, status: "open", audience_type: "selected", audience_profile_ids: [account("bram").id], deidentification_confirmed: true })
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const { data: r, error: e2 } = await bram.from("consultation_responses").insert({ consultation_id: c!.id, responder_profile_id: account("bram").id, body: "A fictional reply.", response_type: "reply" }).select("id").single();
    expect(e2, e2?.message).toBeNull();
    // What setResponseUseful does (src/lib/consult.ts): the author-only
    // function where the build has it, otherwise a direct update.
    let mark: any = await avery.rpc("set_response_useful", { p_response: r!.id, p_useful: true });
    if (missing(mark.error)) mark = await avery.from("consultation_responses").update({ marked_useful: true }).eq("id", r!.id).select("id, marked_useful");
    const saved = await one<{ marked_useful: boolean }>(`select marked_useful from consultation_responses where id = $1`, [r!.id]);
    let byReplier: any = await bram.rpc("set_response_useful", { p_response: r!.id, p_useful: false });
    if (missing(byReplier.error)) byReplier = await bram.from("consultation_responses").update({ marked_useful: false }).eq("id", r!.id).select("id");
    const afterReplier = await one<{ marked_useful: boolean }>(`select marked_useful from consultation_responses where id = $1`, [r!.id]);
    await info.attach("outcome.json", { body: JSON.stringify({ markError: mark.error?.message ?? null, rowsChanged: mark.data?.length ?? 0, saved, replierRows: byReplier.data?.length ?? 0, afterReplier }, null, 2), contentType: "application/json" });
    expect(saved.marked_useful, "author's mark saved").toBe(true);
    expect(afterReplier.marked_useful, "replier cannot unset it").toBe(true);
  });
});

test.describe("N16-03 notification writes", () => {
  test("N16-03-B a member's notification is written whole: event, in-app and held email, or nothing", async ({ baseURL }, info) => {
    assertLocal(baseURL!);
    const avery = await memberClient("avery");
    const dara = account("dara");
    const now = new Date().toISOString();
    const later = new Date(Date.now() + 60 * 60000).toISOString();
    const key = `qa-n16-03-b-${Date.now()}`;
    // What raiseNotification does (src/lib/notifications-v2.ts): one call,
    // every column given.
    const ok = await avery.rpc("raise_notification", {
      p_event_type: "message_received",
      p_summary: "QA: a fictional message notification.",
      p_deep_link: "/dashboard/messages",
      p_dedup_key: key,
      p_metadata: {},
      p_actor_type: "member_web",
      p_deliveries: [
        { recipient: dara.id, channel: "in_app", status: "sent", delivered_at: now, send_after: now },
        { recipient: dara.id, channel: "email", status: "pending", delivered_at: null, send_after: later },
      ],
    });
    const rows = await q(`select d.channel, d.status, d.send_after > now() + interval '30 minutes' as held, e.actor_type::text
                            from notification_events e join notification_deliveries d on d.notification_event_id = e.id where e.dedup_key = $1 order by 1`, [key]);
    // A delivery that can't be written takes the event with it.
    const badKey = `${key}-bad`;
    const bad = await avery.rpc("raise_notification", {
      p_event_type: "message_received",
      p_summary: "QA: should not be kept.",
      p_deep_link: null,
      p_dedup_key: badKey,
      p_metadata: {},
      p_actor_type: "member_web",
      p_deliveries: [{ recipient: dara.id, channel: "in_app", status: "not-a-status", delivered_at: now, send_after: now }],
    });
    const leftovers = await q(`select id from notification_events where dedup_key = $1`, [badKey]);
    await info.attach("outcome.json", { body: JSON.stringify({ okError: ok.error?.message ?? null, rows, badError: bad.error?.message ?? null, leftovers: leftovers.length }, null, 2), contentType: "application/json" });
    expect(ok.error, ok.error?.message).toBeNull();
    expect(rows).toEqual([
      { channel: "email", status: "pending", held: true, actor_type: "member_web" },
      { channel: "in_app", status: "sent", held: false, actor_type: "member_web" },
    ]);
    expect(bad.error, "an unwritable delivery is refused").not.toBeNull();
    expect(leftovers, "no event left without its deliveries").toHaveLength(0);
  });
});
