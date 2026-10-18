import { test, expect } from "@playwright/test";
import { account, memberClient } from "../../lib/auth";
import { q, one, asMember, assertLocal } from "../../lib/staging";
import { coverPlan, referral } from "../../lib/scenarios";

// R17-01 (17 Oct external retest): a member who is no longer eligible
// (suspended, or without a reviewed in-date license) must not be able to
// take on cover, offer on a referral, be chosen for one, or act on a
// consult, through any path: the app's functions or direct table writes.
// Declining stays possible. Gale is suspended for each test and put back.
test.describe.configure({ mode: "default" }); // one at a time, each test on its own
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const GALE = () => account("gale").id;
async function suspend(key = "gale") {
  await q(`update profiles set account_status = 'suspended' where id = $1`, [account(key).id]);
}
async function restore(key = "gale") {
  await q(`update profiles set account_status = 'active' where id = $1`, [account(key).id]);
}
const errorOf = async (p: PromiseLike<{ error: any }>) => (await p).error?.message || null;

test.afterEach(async () => restore());

test("R17-01-A suspended after the invitation: accepting cover is refused, nothing is assigned or announced", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client S"]);
  const id = plan.cases[0].requests.gale;
  const before = (await one(`select count(*)::int n from notification_events where created_at > now() - interval '1 minute'`)).n;
  await suspend();
  const gale = await memberClient("gale");
  const err = await errorOf(gale.rpc("respond_to_cover_request", { p_request: id, p_response: "accepted" }));
  const row = await one(`select status::text, (select assigned_clinician_id from coverage_plan_cases where id = $2) assigned from coverage_requests where id = $1`, [id, plan.cases[0].id]);
  const after = (await one(`select count(*)::int n from notification_events where created_at > now() - interval '1 minute'`)).n;
  expect(err, "the database refuses").toBeTruthy();
  expect(row.status).toBe("sent");
  expect(row.assigned ?? null).toBeNull();
  expect(after).toBe(before);
});

test("R17-01-B suspended: asking a question first (discussing) is refused too", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client T"]);
  await suspend();
  const gale = await memberClient("gale");
  const err = await errorOf(gale.rpc("respond_to_cover_request", { p_request: plan.cases[0].requests.gale, p_response: "discussing" }));
  expect(err).toBeTruthy();
});

test("R17-01-C suspended: declining still works", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client U"]);
  await suspend();
  const gale = await memberClient("gale");
  const err = await errorOf(gale.rpc("respond_to_cover_request", { p_request: plan.cases[0].requests.gale, p_response: "declined" }));
  expect(err).toBeNull();
  expect((await one(`select status::text from coverage_requests where id = $1`, [plan.cases[0].requests.gale])).status).toBe("declined");
});

test("R17-01-D suspended: the direct table write is refused as well", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client V"]);
  await suspend();
  const id = plan.cases[0].requests.gale;
  const err = await asMember(GALE(), `update coverage_requests set status = 'accepted', responded_at = now() where id = $1`, [id]).then(
    () => null,
    (e) => String(e.message)
  );
  expect(err).toBeTruthy();
  expect((await one(`select status::text from coverage_requests where id = $1`, [id])).status).toBe("sent");
});

test("R17-01-E an expired license after the invitation: accepting is refused", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client W"]);
  const lic = await q(`select id, expiration_date from licenses where profile_id = $1`, [GALE()]);
  await q(`update licenses set expiration_date = current_date - 1 where profile_id = $1`, [GALE()]);
  try {
    const gale = await memberClient("gale");
    const err = await errorOf(gale.rpc("respond_to_cover_request", { p_request: plan.cases[0].requests.gale, p_response: "accepted" }));
    expect(err).toBeTruthy();
  } finally {
    for (const l of lic) await q(`update licenses set expiration_date = $2 where id = $1`, [l.id, l.expiration_date]);
  }
});

test("R17-01-F suspended: offering on a referral is refused", async () => {
  const id = await referral("avery", ["gale"]);
  await suspend();
  const gale = await memberClient("gale");
  const err = await errorOf(gale.from("referral_responses").insert({ referral_request_id: id, responding_profile_id: GALE(), status: "interested", message: "QA" }));
  expect(err).toBeTruthy();
});

test("R17-01-G a colleague suspended after offering can't be chosen", async () => {
  const id = await referral("avery", ["gale"]);
  const gale = await memberClient("gale");
  const { data: resp, error } = await gale
    .from("referral_responses")
    .insert({ referral_request_id: id, responding_profile_id: GALE(), status: "interested", message: "QA" })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  await suspend();
  const avery = await memberClient("avery");
  const err = await errorOf(avery.rpc("choose_referral_colleague", { p_referral: id, p_colleague: GALE() }));
  expect(err, "the owner is told the colleague can't be chosen").toBeTruthy();
  expect((await one(`select count(*)::int n from referral_responses where referral_request_id = $1 and status = 'accepted'`, [id])).n).toBe(0);
});

test("R17-01-H suspended owner can't choose a colleague or mark a consult reply useful", async () => {
  const id = await referral("avery", ["gale"]);
  const gale = await memberClient("gale");
  const { data: resp } = await gale
    .from("referral_responses")
    .insert({ referral_request_id: id, responding_profile_id: GALE(), status: "interested", message: "QA" })
    .select("id")
    .single();
  await suspend("avery");
  try {
    const avery = await memberClient("avery");
    const err = await errorOf(avery.rpc("choose_referral_colleague", { p_referral: id, p_colleague: GALE() }));
    expect(err).toBeTruthy();
    const r = (await q(`select r.id from consultation_responses r join consultations c on c.id = r.consultation_id where c.author_profile_id = $1 limit 1`, [account("avery").id]))[0];
    if (r) {
      const err2 = await errorOf(avery.rpc("set_response_useful", { p_response: r.id, p_useful: true }));
      expect(err2).toBeTruthy();
    }
  } finally {
    await restore("avery");
  }
});

test("R17-01-I a colleague suspended after asking a question can't then offer (Interested)", async () => {
  const id = await referral("avery", ["gale"]);
  const gale = await memberClient("gale");
  const { error } = await gale.from("referral_responses").insert({ referral_request_id: id, responding_profile_id: GALE(), status: "question", message: "QA question" });
  expect(error, error?.message).toBeNull();
  await suspend();
  const err = await errorOf(gale.from("referral_responses").update({ status: "interested" }).eq("referral_request_id", id).eq("responding_profile_id", GALE()));
  const row = await one(`select status::text from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [id, GALE()]);
  expect(row.status, err || "no error").toBe("question");
});

test("R17-01-J control: an eligible colleague can accept cover and be chosen", async () => {
  const plan = await coverPlan("avery", ["gale"], ["Client X"]);
  const gale = await memberClient("gale");
  expect(await errorOf(gale.rpc("respond_to_cover_request", { p_request: plan.cases[0].requests.gale, p_response: "accepted" }))).toBeNull();
  const id = await referral("avery", ["gale"]);
  await gale.from("referral_responses").insert({ referral_request_id: id, responding_profile_id: GALE(), status: "interested", message: "QA" });
  const avery = await memberClient("avery");
  expect(await errorOf(avery.rpc("choose_referral_colleague", { p_referral: id, p_colleague: GALE() }))).toBeNull();
});
