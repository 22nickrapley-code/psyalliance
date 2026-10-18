import { test } from "@playwright/test";
import { signInAs, account, memberClient } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";
import { coverPlan, referral } from "../../lib/scenarios";

// Screenshots of the screens changed in the 18 Oct round, for a visual
// check on staging. SHOTS_DIR says where they go.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));
const DIR = process.env.SHOTS_DIR || "reports/screens-1018";

test("screens for the 18 Oct round", async ({ page, context, baseURL }) => {
  test.setTimeout(6 * 60_000);
  const plan = await coverPlan("bram", ["avery"], ["Client 1", "Client 2"]);
  const ref = await referral("bram", ["avery"]);
  // A consult discussion from a colleague for the feed.
  const bram = await memberClient("bram");
  await bram.from("consultations").insert({ author_profile_id: account("bram").id, question: "Night-time panic with no daytime symptoms: CBT first, or a medication review?", status: "open", audience_type: "wider_network", tags: ["Anxiety/Panic Disorders"] });
  await signInAs(context, "avery", baseURL!);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const shots: [string, string][] = [
    ["home", "/dashboard"],
    ["cover-home", "/dashboard/cover"],
    ["cover-request", `/dashboard/cover/requests/${plan.planId}`],
    ["refer-home", "/dashboard/refer"],
    ["refer-incoming", `/dashboard/refer/${ref}`],
    ["network", "/dashboard/network"],
    ["clinicians", "/dashboard/clinicians"],
    ["messages-new", "/dashboard/messages?compose=1"],
    ["profile", "/dashboard/profile"],
    ["availability", "/dashboard/availability"],
    ["documents", "/dashboard/documents"],
    ["consult", "/dashboard/consult"],
  ];
  for (const [name, path] of shots) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => null);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  }
  // Ask a question on the cover request: the chat opens in place.
  await page.goto(`/dashboard/cover/requests/${plan.planId}`);
  await page.getByRole("button", { name: "Ask a question" }).first().click();
  await page.locator(".chat-compose textarea").first().fill("Could we talk about the schedule first?");
  await page.locator(".chat-compose button[type=submit]").first().click();
  await page.waitForTimeout(2500);
  await page.locator(".chat-compose textarea").first().fill("And is the client open to telehealth?");
  await page.locator(".chat-compose textarea").first().press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${DIR}/cover-request-chat.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [["phone-home", "/dashboard"], ["phone-cover", "/dashboard/cover"], ["phone-refer", "/dashboard/refer"], ["phone-cover-request", `/dashboard/cover/requests/${plan.planId}`]] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => null);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  }
});

test("public screens for the 18 Oct round", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, path] of [["public-library", "/library"], ["privacy", "/privacy"], ["tour", "/tour"], ["home-public", "/"]] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle").catch(() => null);
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  }
});
