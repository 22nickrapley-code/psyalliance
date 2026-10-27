import { test, expect, devices, type Page } from "@playwright/test";
import { signInAs } from "../../../lib/auth";
import { shot } from "../../../lib/evidence";
import { assertLocal } from "../../../lib/staging";

// Phone checks (Pixel 7 viewport): Nick's 13 Oct phone items and a sweep
// for sideways scrolling on the main member pages.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const wide = Array.from(document.querySelectorAll<HTMLElement>("main *"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(el).position !== "fixed";
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`);
    return { scroll: doc.scrollWidth, width: window.innerWidth, wide };
  });
}

test("P13-01 the public header on a phone offers Home, Sign in and Join", async ({ page }, info) => {
  await page.goto("/");
  // In the top bar: visible links near the top of the screen.
  for (const name of [/^Home$/, /^Sign in$/, /^Join$/]) {
    const link = page.getByRole("link", { name }).first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box && box.y < 120, `${name} sits in the top bar`).toBeTruthy();
  }
  await shot(page, info, "public-header");
  const o = await overflow(page);
  expect(o.scroll, JSON.stringify(o)).toBeLessThanOrEqual(o.width);
});

test("P13-02 member pages fit a phone screen without sideways scrolling", async ({ page, context, baseURL }, info) => {
  await signInAs(context, "avery", baseURL!);
  const results: Record<string, unknown> = {};
  for (const path of ["/dashboard", "/dashboard/cover", "/dashboard/cover/new", "/dashboard/refer", "/dashboard/consult", "/dashboard/clinicians", "/dashboard/messages", "/dashboard/network", "/dashboard/profile", "/dashboard/settings", "/dashboard/demos", "/dashboard/documents"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const o = await overflow(page);
    results[path] = o;
    await shot(page, info, path.replace(/\//g, "_"));
  }
  await info.attach("overflow.json", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  const bad = Object.entries(results).filter(([, o]: any) => o.scroll > o.width);
  expect(bad, JSON.stringify(bad)).toHaveLength(0);
});

test("P13-03 the demo plays slower on a phone than on a computer", async ({ page, browser }, info) => {
  const sceneSeconds = async (p: Page) => {
    await p.goto("/tour/cover/watch");
    const seg = p.locator(".sp-progress .sp-seg.on span").first();
    await p.locator(".story-player").scrollIntoViewIfNeeded();
    await expect(seg).toHaveAttribute("style", /animation-duration/, { timeout: 10000 });
    return parseFloat(((await seg.getAttribute("style")) || "").match(/animation-duration:\s*([\d.]+)s/)?.[1] || "0");
  };
  const phone = await sceneSeconds(page);
  await page.waitForTimeout(6000);
  await shot(page, info, "phone-demo");
  const desk = await browser.newContext({ ...devices["Desktop Chrome"] });
  const deskPage = await desk.newPage();
  const desktop = await sceneSeconds(deskPage);
  await desk.close();
  await info.attach("timing.json", { body: JSON.stringify({ phoneSceneSeconds: phone, desktopSceneSeconds: desktop }, null, 2), contentType: "application/json" });
  expect(phone, "first scene lasts longer on a phone").toBeGreaterThan(desktop + 1.5);
  // In the v13 player the whole scene, scroll and pointer included, runs slower on a phone (story-player.tsx: slow = 1.4, +1.6 s).
  expect(phone / desktop, "a phone scene is at least 15% longer").toBeGreaterThan(1.15);
});
