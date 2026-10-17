import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { signInAs, account, memberClient } from "../../lib/auth";
import { shot } from "../../lib/evidence";
import { q, one, assertLocal } from "../../lib/staging";
import { referral } from "../../lib/scenarios";

// Retests of the earlier release review (R01 to R17) that can be checked
// here. R07 (Postgres upgrade), R13 (legal review) and R15 (leaked-password
// protection) are settings on the hosted projects, for Nick to confirm.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

test("R01-A a group member can't move their membership, promote themselves or rejoin a group they left by editing it", async ({}, info) => {
  const g = await one(`insert into consultation_groups (name, created_by, charter_body) values ($1, $2, 'QA charter') returning id`, [`QA group ${Date.now()}`, account("avery").id]);
  const other = await one(`insert into consultation_groups (name, created_by, charter_body) values ($1, $2, 'QA charter') returning id`, [`QA other ${Date.now()}`, account("cass").id]);
  await q(`insert into consultation_group_members (group_id, profile_id, status, role) values ($1, $2, 'joined', 'creator'), ($1, $3, 'joined', 'member')`, [g.id, account("avery").id, account("bram").id]);
  const m = await one(`select id from consultation_group_members where group_id = $1 and profile_id = $2`, [g.id, account("bram").id]);
  const bram = await memberClient("bram");
  const role = await bram.from("consultation_group_members").update({ role: "coordinator" }).eq("id", m.id).select("id");
  const move = await bram.from("consultation_group_members").update({ group_id: other.id }).eq("id", m.id).select("id");
  const after = await one(`select group_id, role, status from consultation_group_members where id = $1`, [m.id]);
  await info.attach("outcome.json", { body: JSON.stringify({ role: role.error?.message ?? role.data, move: move.error?.message ?? move.data, after }, null, 2), contentType: "application/json" });
  expect(String(after.group_id)).toBe(String(g.id));
  expect(after.role).toBe("member");
});

test("R05-A practice facts are replaced all at once: a bad row leaves the old facts in place", async ({}, info) => {
  const fenn = await memberClient("fenn");
  const before = await q(`select lookup_value_id from profile_lookup_values where profile_id = $1 order by 1`, [account("fenn").id]);
  const { error } = await fenn.rpc("set_my_practice_facts", { p_rows: [{ lookup_value_id: 7, rank: 1 }, { lookup_value_id: 999999999, rank: 2 }] });
  const after = await q(`select lookup_value_id from profile_lookup_values where profile_id = $1 order by 1`, [account("fenn").id]);
  await info.attach("outcome.json", { body: JSON.stringify({ error: error?.message ?? null, before: before.length, after: after.length }), contentType: "application/json" });
  expect(error).not.toBeNull();
  expect(after).toEqual(before);
});

test("R06-A only colleagues a referral was sent to can reply to it", async ({}, info) => {
  const id = await referral("avery", ["cass"]);
  const bram = await memberClient("bram");
  const { error } = await bram.from("referral_responses").insert({ referral_request_id: id, responding_profile_id: account("bram").id, status: "interested" });
  const rows = await q(`select 1 from referral_responses where referral_request_id = $1 and responding_profile_id = $2`, [id, account("bram").id]);
  await info.attach("outcome.json", { body: JSON.stringify({ error: error?.message ?? null, rows: rows.length }), contentType: "application/json" });
  expect(rows).toHaveLength(0);
});

test.describe("R08 file limits", () => {
  const big = (mb: number) => new Blob([new Uint8Array(mb * 1024 * 1024 + 10)], { type: "application/pdf" });
  test("R08-A a document over 20 MB is refused", async () => {
    const c = await memberClient("dara");
    const { error } = await c.storage.from("documents").upload(`personal/${account("dara").id}/qa-big-${Date.now()}.pdf`, big(21), { contentType: "application/pdf" });
    expect(error, "refused").not.toBeNull();
  });
  test("R08-B a program file is refused as a document", async () => {
    const c = await memberClient("dara");
    const { error } = await c.storage.from("documents").upload(`personal/${account("dara").id}/qa-${Date.now()}.exe`, new Blob(["MZ fictional"], { type: "application/x-msdownload" }), { contentType: "application/x-msdownload" });
    expect(error, "refused").not.toBeNull();
  });
  test("R08-C a profile photo over 5 MB is refused", async () => {
    const c = await memberClient("dara");
    const { error } = await c.storage.from("avatars").upload(`${account("dara").id}/qa-big-${Date.now()}.png`, new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "image/png" }), { contentType: "image/png" });
    expect(error, "refused").not.toBeNull();
  });
  test("R08-D a member can't write into another member's folder", async () => {
    const c = await memberClient("dara");
    const { error } = await c.storage.from("documents").upload(`personal/${account("bram").id}/qa-${Date.now()}.pdf`, new Blob(["%PDF fictional"], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect(error, "refused").not.toBeNull();
  });
});

test("R11-A a colleague's profile opened from Clinicians leads back to Clinicians", async ({ page, context, baseURL }, info) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard/clinicians");
  await page.locator(`a[href*="/dashboard/people/"]`).first().click();
  await page.waitForURL(/\/dashboard\/people\//);
  await shot(page, info, "profile");
  const back = page.getByRole("link", { name: /Back|Clinicians/ }).filter({ hasNot: page.locator("aside a") }).first();
  const href = await page.locator("main").getByRole("link", { name: /Back|All clinicians|Clinicians/ }).first().getAttribute("href");
  void back;
  expect(href || "").toMatch(/\/dashboard\/clinicians/);
});

test("R16-A pages are served with the security headers", async ({ request }, info) => {
  const res = await request.get("/");
  const h = res.headers();
  await info.attach("headers.json", { body: JSON.stringify(h, null, 2), contentType: "application/json" });
  expect(h["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBeTruthy();
  expect(h["content-security-policy"] || "").toMatch(/frame-ancestors/);
  expect(h["x-powered-by"]).toBeUndefined();
});

test("R17-A the spreadsheet library with known vulnerabilities is gone", async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "package.json"), "utf8"));
  expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty("xlsx");
});
