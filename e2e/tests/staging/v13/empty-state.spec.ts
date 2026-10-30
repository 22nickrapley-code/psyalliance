import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { signInWith, disposableMember } from "../../../lib/auth";
import { assertLocal, q } from "../../../lib/staging";

// A brand-new member: verified, one reviewed licence, and nothing else. No
// colleagues, no availability confirmed, no plans, referrals, messages,
// discussions or documents. Every screen they can reach has to make sense,
// say what to do next, and show no raw "undefined" or "NaN". (The first-week
// features, C-45, are not built; this checks that the empty product is honest.)
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const SHOTS = process.env.E2E_SHOT_OUT || "/tmp/work/empty-state";

async function freshMember() {
  const m = await disposableMember("fresh");
  await q(
    `insert into profiles (id, full_name, credential_prefix, qualification_level, primary_state, primary_practice_city, states_qualified,
       verification_status, verified_at, account_kind, account_status, contact_email)
     values ($1, 'Fiona Freshstart', 'Dr', 'PhD', 'NY', 'Albany', array['NY'], 'verified', now(), 'clinician', 'active', $2)
     on conflict (id) do update set full_name = excluded.full_name, credential_prefix = excluded.credential_prefix, qualification_level = excluded.qualification_level,
       primary_state = excluded.primary_state, primary_practice_city = excluded.primary_practice_city, states_qualified = excluded.states_qualified,
       verification_status = 'verified', verified_at = now(), account_kind = 'clinician', account_status = 'active'`,
    [m.id, m.email]
  );
  const op = await q<{ id: string }>(`select id from profiles where account_kind = 'operator' limit 1`);
  await q(
    `insert into licenses (profile_id, state, license_number, license_type, expiration_date, status, notes, reviewed_at, reviewed_by)
     values ($1, 'NY', 'STG-FRESH-100001', 'Psychologist', current_date + 400, 'active', 'Fictional staging licence', now(), $2)`,
    [m.id, op[0]?.id ?? null]
  );
  return m;
}

const WORKSPACE = ["/dashboard", "/dashboard/cover", "/dashboard/referrals", "/dashboard/consult", "/dashboard/network", "/dashboard/messages", "/dashboard/library"];
const ACCOUNT = ["/dashboard/profile", "/dashboard/credentials", "/dashboard/continuity", "/dashboard/documents", "/dashboard/notifications", "/dashboard/settings", "/dashboard/demos", "/dashboard/consult/groups"];
const WINDOWS = ["/dashboard?availability=1", "/dashboard?search=1", "/dashboard?settings=1", "/dashboard/cover?new=1", "/dashboard/referrals?new=1", "/dashboard/consult?new=1", "/dashboard/messages?compose=1", "/dashboard/network?invite=1"];
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Invalid Date|Internal error|Something went wrong/;

test("EMP-01 a brand-new member sees honest, working screens everywhere, desktop and phone", async ({ browser, baseURL }) => {
  test.setTimeout(10 * 60_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  const m = await freshMember();
  const problems: string[] = [];
  for (const phone of [false, true]) {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1365, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
    await signInWith(context, m.email, m.password, baseURL!);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const path of [...WORKSPACE, ...ACCOUNT, ...WINDOWS].filter((x) => !process.env.E2E_EMP_ONLY || x.includes(process.env.E2E_EMP_ONLY))) {
      errors.length = 0;
      const res = await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const tag = `${phone ? "phone" : "desk"} ${path}`;
      if (!res || res.status() >= 400) problems.push(`${tag}: status ${res?.status()}`);
      if (/\/auth\/sign-in/.test(page.url())) problems.push(`${tag}: sent to sign-in`);
      const text = await page.locator("body").innerText();
      const bad = text.match(BAD);
      if (bad) problems.push(`${tag}: shows "${bad[0]}" near "${text.slice(Math.max(0, (bad.index ?? 0) - 40), (bad.index ?? 0) + 40).replace(/\s+/g, " ")}"`);
      if (errors.length) problems.push(`${tag}: script error ${errors[0]}`);
      if (!/\?/.test(path) && !(await page.locator("h1, h2").first().isVisible().catch(() => false))) problems.push(`${tag}: no heading`);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of r.violations)
        if (v.impact === "serious" || v.impact === "critical") {
          const detail = v.id === "color-contrast" ? " " + v.nodes.slice(0, 8).map((n) => { const d: any = (n.any[0] as any)?.data || {}; return `[${n.target.join(" ").slice(0, 60)} ${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}]`; }).join(" ") : "";
          problems.push(`${tag}: axe ${v.id} ×${v.nodes.length} ${v.nodes[0]?.target.join(" ").slice(0, 70)}${detail}`);
        }
      await page.screenshot({ path: `${SHOTS}/${phone ? "p" : "d"}-${path.replace(/[\/?=&]/g, "_")}.png`, fullPage: false });
    }
    await context.close();
  }
  expect(problems).toEqual([]);
});

test("EMP-02 a brand-new member's Hub and lists say what to do first", async ({ browser, baseURL }) => {
  const m = await freshMember();
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: "en-US", timezoneId: "America/New_York" });
  await signInWith(context, m.email, m.password, baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  // The Hub: no actions waiting, an availability card that asks to be set, and the three ways in.
  await expect(page.locator("main, #main").first()).toContainText(/The Hub/i);
  await expect(page.getByText(/^Set your availability$/).first()).toBeVisible();
  for (const section of ["Cover", "Referrals", "Consult"]) await expect(page.locator(".sidebar .nav-item", { hasText: section })).toBeVisible();
  // Each list opens and offers its way in, with no rows to show.
  await page.goto("/dashboard/cover");
  await expect(page.getByRole("button", { name: /Plan cover|New cover|Start/i }).first()).toBeVisible();
  // An empty Cover page says what to do in each direction instead of repeating "No arrangements".
  await expect(page.locator("main, #main").first()).toContainText("You have no cover plans yet. Choose Plan cover to ask colleagues to cover your clients.");
  await expect(page.locator("main, #main").first()).toContainText("No colleague has asked you to cover their clients. Requests appear here.");
  await page.goto("/dashboard/referrals");
  await expect(page.getByRole("button", { name: /referral|Refer/i }).first()).toBeVisible();
  await page.goto("/dashboard/messages");
  await expect(page.locator("main, #main").first()).toContainText(/Messages/i);
  await context.close();
});
