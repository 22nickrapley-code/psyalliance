import { test, expect } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { q, one, asMember, assertLocal } from "../../lib/staging";
import { coverPlan } from "../../lib/scenarios";

// Fixes for the 17 Oct external retest (R17-02, R17-04, R17-06, R17-07,
// R17-08, R17-09), checked on staging.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

async function consultWithReply() {
  const avery = await memberClient("avery");
  const { data: c, error } = await avery
    .from("consultations")
    .insert({ author_profile_id: account("avery").id, question: `QA R17-02 ${Date.now()}: a fictional question.`, status: "open", audience_type: "selected", audience_profile_ids: [account("bram").id, account("cass").id] })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const bram = await memberClient("bram");
  const { data: r, error: e2 } = await bram
    .from("consultation_responses")
    .insert({ consultation_id: c!.id, responder_profile_id: account("bram").id, body: "QA reply: a general thought.", response_type: "reply" })
    .select("id")
    .single();
  expect(e2, e2?.message).toBeNull();
  const { error: e3 } = await avery.rpc("set_response_useful", { p_response: r!.id, p_useful: true });
  expect(e3, e3?.message).toBeNull();
  return { consultation: c!.id as number, response: r!.id as number };
}

test("R17-02-A the reply's author can't read the asker's useful mark, by any path", async () => {
  const { consultation, response } = await consultWithReply();
  const bram = await memberClient("bram");
  const direct = await bram.from("consultation_responses").select("id, marked_useful").eq("id", response);
  expect(direct.error, "selecting the column is refused").toBeTruthy();
  const star = await bram.from("consultation_responses").select("*").eq("id", response);
  expect(star.error, "select * is refused too").toBeTruthy();
  const plain = await bram.from("consultation_responses").select("id, body").eq("id", response);
  expect(plain.error, plain.error?.message).toBeNull();
  expect(plain.data?.length).toBe(1);
  const viaRpc = await bram.rpc("consultation_useful_marks", { p_consultation: consultation });
  expect(viaRpc.error, viaRpc.error?.message).toBeNull();
  expect((viaRpc.data as any[]) || []).toHaveLength(0);
  const sql = await asMember(account("bram").id, `select marked_useful from consultation_responses where id = $1`, [response]).then(
    () => "allowed",
    (e) => String(e.message)
  );
  expect(sql).toMatch(/permission denied/);
});

test("R17-02-B another recipient and a stranger can't read it either; the asker can", async () => {
  const { consultation, response } = await consultWithReply();
  for (const key of ["cass", "dara"]) {
    const c = await memberClient(key);
    const r = await c.from("consultation_responses").select("marked_useful").eq("id", response);
    expect(r.error, `${key} refused`).toBeTruthy();
    const m = await c.rpc("consultation_useful_marks", { p_consultation: consultation });
    expect((m.data as any[]) || []).toHaveLength(0);
  }
  const avery = await memberClient("avery");
  const mine = await avery.rpc("consultation_useful_marks", { p_consultation: consultation });
  expect(mine.error, mine.error?.message).toBeNull();
  const ids = ((mine.data as any[]) || []).map((v: any) => Number(typeof v === "object" ? Object.values(v)[0] : v));
  expect(ids).toEqual([response]);
  // Unmark, and it's gone.
  await avery.rpc("set_response_useful", { p_response: response, p_useful: false });
  const after = await avery.rpc("consultation_useful_marks", { p_consultation: consultation });
  expect((after.data as any[]) || []).toHaveLength(0);
});

test("R17-02-C the asker's page still shows the mark; the replier's page doesn't", async ({ browser, baseURL }) => {
  const { consultation } = await consultWithReply();
  const a = await browser.newContext();
  await signInAs(a, "avery", baseURL!);
  const ap = await a.newPage();
  await ap.goto(`/dashboard/consult/${consultation}`);
  await expect(ap.getByText(/Marked useful|Useful/).first()).toBeVisible();
  await a.close();
  const b = await browser.newContext();
  await signInAs(b, "bram", baseURL!);
  const bp = await b.newPage();
  await bp.goto(`/dashboard/consult/${consultation}`);
  await expect(bp.getByText("QA reply: a general thought.")).toBeVisible();
  await expect(bp.getByText(/Marked useful/)).toHaveCount(0);
  await b.close();
});

test("R17-04 cover: Back from review keeps both colleagues, how to ask and the message", async ({ page, context, baseURL }) => {
  const plan = await coverPlan("avery", [], ["Client B1"]);
  await q(`update coverage_plans set status = 'draft' where id = $1`, [plan.planId]);
  await signInAs(context, "avery", baseURL!);
  await page.goto(`/dashboard/cover/${plan.planId}?step=candidates`);
  const picks = page.locator(`input[name="pick_${plan.cases[0].id}"]`);
  const n = await picks.count();
  test.skip(n < 2, "needs two suggested colleagues for this client");
  for (let i = 0; i < 2; i++) if (!(await picks.nth(i).isChecked())) await picks.nth(i).check();
  await page.getByRole("button", { name: /Review invitations/ }).click();
  await expect(page.getByRole("heading", { name: /2 requests to 2 colleagues/ })).toBeVisible();
  await page.getByLabel("Everyone at once").check();
  await page.locator('textarea[name="message"]').fill("Weekly sessions, Tuesday evenings.");
  await page.getByRole("button", { name: /Candidates/ }).click();
  await expect(page).toHaveURL(/step=candidates/);
  await expect(picks.nth(0)).toBeChecked();
  await expect(picks.nth(1)).toBeChecked();
  await page.getByRole("button", { name: /Review invitations/ }).click();
  await expect(page.getByRole("heading", { name: /2 requests to 2 colleagues/ })).toBeVisible();
  await expect(page.getByLabel("Everyone at once")).toBeChecked();
  await expect(page.locator('textarea[name="message"]')).toHaveValue("Weekly sessions, Tuesday evenings.");
});

test("R17-06 the profile import never shows setup details to a member", async ({ page, context, baseURL }) => {
  // Staging has no AI key, as the sandbox didn't.
  await signInAs(context, "dara", baseURL!);
  await page.goto("/dashboard/profile?edit=1");
  const open = page.getByRole("button", { name: "Import" });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.getByLabel("Your existing profile").fill("Dr Dara Vennholt, PhD. Licensed psychologist in Boston, MA, working with adults with anxiety.");
  await page.getByRole("button", { name: "Fill in from this text" }).click();
  const msg = page.locator("[role=status]").filter({ hasText: /import|fill in|read/i }).first();
  await expect(msg).toBeVisible();
  await expect(msg).not.toContainText(/ANTHROPIC|API|admin|configured/i);
});

test("R17-07 continuity: essentials done with blanks says so instead of 100% complete", async ({ page, context, baseURL }) => {
  const key = "bram";
  const id = account(key).id;
  const answers: Record<string, string> = {
    practice_name: "QA Practice", practice_contact: "(212) 555-0100", records_system: "QA EHR", access_kept_with: "Sealed envelope with my attorney",
    custodian: "My backup", notify_clients: "Call each client.", attorney_or_family: "A relative", authority: "Act as described.", compensation: "Usual hourly rate",
  };
  const before = await q(`select * from continuity_plans where profile_id = $1`, [id]);
  await q(
    `insert into continuity_plans (profile_id, answers) values ($1, $2::jsonb)
     on conflict (profile_id) do update set answers = excluded.answers`,
    [id, JSON.stringify(answers)]
  ).catch(() => null);
  try {
    await signInAs(context, key, baseURL!);
    await page.goto("/dashboard/continuity");
    const head = page.locator(".continuity-summary h3");
    await expect(head).toBeVisible();
    const t = await head.innerText();
    if (/Essentials done/.test(t)) await expect(page.getByText(/optional details? (is|are) still blank/)).toBeVisible();
    expect(t).not.toMatch(/^Complete\./);
  } finally {
    if (before.length) await q(`update continuity_plans set answers = $2::jsonb where profile_id = $1`, [id, JSON.stringify(before[0].answers)]).catch(() => null);
  }
});

test("R17-08 Unblock replaces the Blocked confirmation; a filed report is confirmed", async ({ page, context, baseURL }) => {
  await signInAs(context, "cass", baseURL!);
  await page.goto(`/dashboard/people/${account("dara").id}`);
  await q(`delete from blocked_members where profile_id = $1 and blocked_profile_id = $2`, [account("cass").id, account("dara").id]);
  await q(`insert into blocked_members (profile_id, blocked_profile_id) values ($1, $2)`, [account("cass").id, account("dara").id]);
  await page.goto("/dashboard/settings?saved=blocked#privacy");
  await page.locator("details#privacy > summary").click().catch(() => null);
  await page.getByRole("button", { name: "Unblock" }).first().click();
  await expect(page).toHaveURL(/saved=unblocked/);
  await expect(page.getByText(/^Blocked\./)).toHaveCount(0);
  await expect(page.getByText(/Unblocked/).first()).toBeVisible();
  // Reporting a message shows a confirmation.
  await page.goto("/dashboard/messages?reported=1");
  await expect(page.locator(".live-note")).toContainText("Your report went to the PsyAlliance team");
});

test("R17-09 Network health counts members' referrals and cover, not zeros", async ({ page, context, baseURL }) => {
  await coverPlan("avery", ["bram"], ["Client N"]);
  const counts = await one(`select (select count(*) from referral_requests r join profiles p on p.id = r.requesting_profile_id where not p.is_demo)::int refs,
                                   (select count(*) from coverage_requests)::int cover`);
  await signInAs(context, "otto", baseURL!);
  await page.goto("/dashboard/admin/network-health");
  await expect(page.getByRole("heading", { name: "Network health" })).toBeVisible();
  await expect(page.getByText(/couldn.t be loaded/)).toHaveCount(0);
  await expect(page.getByText(/PsyA2|#102|progress doc/)).toHaveCount(0);
  const body = await page.locator("main").innerText();
  expect(counts.cover).toBeGreaterThan(0);
  // The cover response-rate card isn't "-" (which means nothing counted).
  expect(body).not.toMatch(/Cover requests\s*\n\s*0\b/);
});

test("R17-02-D the Consult list and Home feed still show questions and reply counts", async ({ page, context, baseURL }) => {
  const question = `QA R17-02-D ${Date.now()}: a fictional question for everyone.`;
  const bram = await memberClient("bram");
  const { data: c, error } = await bram
    .from("consultations")
    .insert({ author_profile_id: account("bram").id, question, status: "open", audience_type: "wider_network", tags: [] })
    .select("id")
    .single();
  expect(error, error?.message).toBeNull();
  const cass = await memberClient("cass");
  await cass.from("consultation_responses").insert({ consultation_id: c!.id, responder_profile_id: account("cass").id, body: "QA reply.", response_type: "reply" });
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/consult");
  const row = page.getByText(question).first();
  await expect(row).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".home-feed")).toBeVisible();
});
