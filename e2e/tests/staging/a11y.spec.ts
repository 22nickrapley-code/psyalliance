import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Automated accessibility checks (axe-core, WCAG 2.1 A and AA rules) on the
// main public and member pages. A test fails on serious or critical
// problems; moderate and minor ones are listed in the evidence. Automated
// checks find roughly a third of accessibility problems: keyboard and
// screen-reader passes are still needed by hand.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const PUBLIC = ["/", "/join", "/auth/sign-in", "/auth/sign-up", "/auth/forgot-password", "/library", "/tour", "/tour/cover/watch", "/privacy", "/terms", "/verification"];
const MEMBER = ["/dashboard", "/dashboard/cover", "/dashboard/cover?new=1", "/dashboard/referrals", "/dashboard/referrals?new=1", "/dashboard/referrals?tab=physicians", "/dashboard/consult", "/dashboard/consult?new=1", "/dashboard/network", "/dashboard/network?invite=1", "/dashboard/messages", "/dashboard/messages?compose=1", "/dashboard/library", "/dashboard/notifications", "/dashboard/profile", "/dashboard/settings", "/dashboard/documents", "/dashboard/demos", "/dashboard/credentials", "/dashboard/continuity", "/dashboard/continuity/duties", "/dashboard/consult/groups"];

async function check(page: Page, path: string, info: any) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // Open folded sections so their contents are checked too.
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const list = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  await info.attach("axe.json", { body: JSON.stringify(list, null, 2), contentType: "application/json" });
  return list;
}

for (const p of PUBLIC)
  test(`A11Y-PUB ${p}`, async ({ page }, info) => {
    const v = await check(page, p, info);
    expect(v.filter((x) => x.impact === "serious" || x.impact === "critical"), JSON.stringify(v.map((x) => `${x.impact} ${x.id} ×${x.nodes}`))).toEqual([]);
  });

for (const p of MEMBER)
  test(`A11Y-MEM ${p}`, async ({ page, context, baseURL }, info) => {
    await signInAs(context, "avery", baseURL!);
    const v = await check(page, p, info);
    expect(v.filter((x) => x.impact === "serious" || x.impact === "critical"), JSON.stringify(v.map((x) => `${x.impact} ${x.id} ×${x.nodes}`))).toEqual([]);
  });
