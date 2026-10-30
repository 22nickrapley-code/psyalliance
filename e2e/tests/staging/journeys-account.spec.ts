import { test, expect } from "@playwright/test";
import { signInAs, signInWith, account, memberClient, disposableMember } from "../../lib/auth";
import { watch, attachEvidence, shot } from "../../lib/evidence";
import { q, one, assertLocal } from "../../lib/staging";

// Account and practice journeys: sign out, availability, profile, trusted
// colleagues, data export, account deletion, pending members, the Library.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

test("J-AUTH-04 signing out ends the session; Home then asks you to sign in", async ({ page, context, baseURL }, info) => {
  await signInAs(context, "avery", baseURL!);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForLoadState("networkidle");
  await shot(page, info, "signed-out");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("J-AVAIL-01 confirming availability saves it with today's date", async ({ page, context, baseURL }, info) => {
  await q(`update profiles set availability_confirmed_at = now() - interval '40 days' where id = $1`, [account("cass").id]);
  await signInAs(context, "cass", baseURL!);
  await page.goto("/dashboard/availability");
  await shot(page, info, "1-before");
  const quick = page.getByRole("button", { name: /Nothing.s changed, reconfirm/ });
  if (await quick.count()) await quick.click();
  else await page.getByRole("button", { name: "Save and confirm" }).click();
  await page.waitForLoadState("networkidle");
  await shot(page, info, "2-after");
  const r = await one(`select availability_confirmed_at > now() - interval '5 minutes' as fresh from profiles where id = $1`, [account("cass").id]);
  expect(r.fresh).toBe(true);
});

test("J-PROFILE-01 editing the bio saves and shows on the colleague view", async ({ page, context, baseURL, browser }, info) => {
  await signInAs(context, "fenn", baseURL!);
  await page.goto("/dashboard/profile?edit=1");
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const bio = `QA bio ${Date.now()}: adults with anxiety and OCD, evenings and telehealth.`;
  await page.locator("textarea#bio").fill(bio);
  await page.getByRole("button", { name: "Save profile" }).first().click();
  await page.waitForLoadState("networkidle");
  await shot(page, info, "1-saved");
  const saved = await one(`select bio from profiles where id = $1`, [account("fenn").id]);
  expect(saved.bio).toBe(bio);
  const cc = await browser.newContext();
  const cp = await cc.newPage();
  await signInAs(cc, "avery", baseURL!);
  await cp.goto(`/dashboard/people/${account("fenn").id}`);
  await expect(cp.getByText(bio)).toBeVisible();
  await shot(cp, info, "2-colleague-view");
  await cc.close();
});

test("J-NETWORK-01 add a colleague as trusted from their profile, then remove them", async ({ page, context, baseURL }, info) => {
  await q(`delete from trusted_colleagues where profile_id = $1 and colleague_profile_id = $2`, [account("dara").id, account("cass").id]).catch(() => null);
  await signInAs(context, "dara", baseURL!);
  await page.goto(`/dashboard/people/${account("cass").id}`);
  await page.getByRole("button", { name: "Add as Trusted Colleague" }).first().click();
  await expect(page.getByText(/Trusted ✓/).first()).toBeVisible();
  await shot(page, info, "1-trusted");
  await page.goto("/dashboard/network");
  await expect(page.getByText(/Cass Morrowgate/).first()).toBeVisible();
  await page.goto(`/dashboard/people/${account("cass").id}`);
  await page.getByRole("button", { name: "Remove from trusted colleagues" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Add as Trusted Colleague" }).first()).toBeVisible();
  await shot(page, info, "2-removed");
});

test("J-DATA-01 Download my data returns only the member's own data", async ({ page, context, baseURL }, info) => {
  await signInAs(context, "avery", baseURL!);
  const res = await context.request.get("/dashboard/settings/export");
  expect(res.status()).toBe(200);
  const body = await res.text();
  const data = JSON.parse(body);
  const others = ["bram", "cass", "fenn", "dara", "pell", "otto"].filter((k) => body.includes(account(k).email));
  await info.attach("export-keys.json", { body: JSON.stringify(Object.keys(data), null, 2), contentType: "application/json" });
  expect(body).toContain(account("avery").id);
  expect(others, "no other member's email address").toEqual([]);
});

test("J-DATA-02 signed out, Download my data asks you to sign in", async ({ page }) => {
  await page.goto("/dashboard/settings/export");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("J-DATA-03 deleting an account from Settings removes the sign-in and the member's stored files", async ({ page, context, baseURL }, info) => {
  const ev = watch(page);
  const m = await disposableMember("erase");
  const file = `personal/${m.id}/${Date.now()}-qa.pdf`;
  const up = await m.client.storage.from("documents").upload(file, new Blob(["%PDF-1.4 fictional"], { type: "application/pdf" }), { contentType: "application/pdf" });
  expect(up.error, up.error?.message).toBeNull();
  await signInWith(context, m.email, m.password, baseURL!);
  await page.goto("/dashboard/settings");
  await shot(page, info, "1-settings");
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await page.locator('input[name="confirm"]').fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForLoadState("networkidle");
  await shot(page, info, "2-after");
  const user = await q(`select 1 from auth.users where id = $1`, [m.id]);
  const objects = await q(`select name from storage.objects where name like $1`, [`%${m.id}%`]);
  await attachEvidence(info, ev);
  expect(user, "the sign-in is gone").toHaveLength(0);
  expect(objects, "no stored file is left").toHaveLength(0);
});

test("J-PENDING-01 a member whose license is being checked can't see colleagues' details", async ({ page, context, baseURL }, info) => {
  const pell = await memberClient("pell");
  const { data: rows } = await pell.from("profiles").select("id, full_name, bio").neq("id", account("pell").id).limit(20);
  await signInAs(context, "pell", baseURL!);
  await page.goto("/dashboard/clinicians");
  await shot(page, info, "clinicians");
  const text = await page.locator("main").innerText();
  const visible = ["avery", "bram", "cass", "fenn", "dara"].filter((k) => text.includes(account(k).name.split(",")[0]));
  await info.attach("outcome.json", { body: JSON.stringify({ profileRowsVisible: rows?.length ?? 0, namesOnPage: visible }, null, 2), contentType: "application/json" });
  expect(rows?.length ?? 0, "no colleague profiles through the API").toBe(0);
  expect(visible, "no colleague names on the page").toEqual([]);
});

// 18 Oct (Nick): visitors see every title but no review wording, and a
// title asks them to join. Nothing claims a review that hasn't happened.
test("J-LIB-01 the public Library lists titles, asks visitors to join, and never claims a review", async ({ page }, info) => {
  await page.goto("/library");
  await shot(page, info, "1-library");
  const text = await page.locator("main, body").first().innerText();
  expect(text).toMatch(/Reciprocal Coverage Agreement/);
  await page.goto("/library/reciprocal-coverage-agreement");
  await shot(page, info, "2-template");
  const t = await page.locator("main, body").first().innerText();
  await info.attach("text.txt", { body: t.slice(0, 3000), contentType: "text/plain" });
  expect(t, "asks visitors to join").toMatch(/Members get it now|Coming soon/);
  await expect(page.getByRole("link", { name: /Create your account/ }).first()).toBeVisible();
  expect(t, "no review wording").not.toMatch(/not yet (independently )?reviewed|after independent review|provisional/i);
  expect(t, "never claims a review").not.toMatch(/Reviewed by|Clinically reviewed/i);
});

test("J-PROVIDER-01 the physician portal is paused: it says so, and the database refuses a referral sent anyway", async ({ page, context, baseURL }, info) => {
  await signInAs(context, "ruben", baseURL!);
  await page.goto("/refer");
  await shot(page, info, "portal");
  await expect(page.getByText(/portal isn.t open/i)).toBeVisible();
  // What the old send action would do, with the provider's own permissions.
  const ruben = await memberClient("ruben");
  const { error } = await ruben.from("provider_referrals").insert({
    referring_provider_id: account("ruben").id,
    target_profile_id: account("bram").id,
    reason: "QA: should be refused while the portal is paused.",
    urgency: "routine",
    contact_details: "fictional",
  });
  const rows = await q(`select 1 from provider_referrals where reason like 'QA: should be refused%'`);
  await info.attach("outcome.json", { body: JSON.stringify({ insertError: error?.message ?? null, rows: rows.length }), contentType: "application/json" });
  expect(error, "refused").not.toBeNull();
  expect(rows).toHaveLength(0);
});
