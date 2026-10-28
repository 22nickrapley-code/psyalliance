import { test, expect, type Page } from "@playwright/test";
import { J } from "../../../lib/journeys";
import { signInAs } from "../../../lib/auth";
import { assertLocal } from "../../../lib/staging";
import { D } from "../../../lib/demos";

// Version 13 demos: every demo is the approved workspace itself on its
// fictional sample data (or, for the two pages the design does not cover, the
// product's own page). These tests check that every frame opens, that nothing
// in a frame saves or sends anything, that the video player and the
// click-through pages drive the real controls, and that earlier links still
// land somewhere right. They are separate from the 49 reference groups.
const { JOURNEYS, LEGACY_SLUGS, LEGACY_STEPS, sceneSrc, findJourney } = J;

test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const DESKTOP = { width: 1100, height: 760 };
const PHONE = { width: 390, height: 844 };

const ALL = JOURNEYS.flatMap((j) => j.steps.map((s) => ({ j, s, src: sceneSrc(j.key, s.slug, s.scene), id: `${j.key}/${s.slug}` })));

async function frameReady(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.scene === "ready" || document.documentElement.dataset.scene === "error", null, { timeout: 30000 });
  const state = await page.evaluate(() => ({ state: document.documentElement.dataset.scene, error: document.documentElement.dataset.sceneError || "" }));
  expect(state.error, "scene setup").toBe("");
  expect(state.state).toBe("ready");
}

const NAV = ["The Hub", "Cover", "Referrals", "Consult", "Network", "Messages", "Library"];

for (const [label, size] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
  test(`TOUR-01 ${label}: every demo screen opens on the approved product, with its own setup`, async ({ browser }) => {
    test.setTimeout(30 * 60 * 1000);
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()} :: ${(e.stack || "").split("\n").slice(0, 4).join(" / ")}`));
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const { src, id, s } of ALL) {
      // The overview borrows screens; each is still its own frame.
      await page.goto(src);
      try {
        await frameReady(page);
      } catch (e) {
        problems.push(`${id}: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }
      // The product's own navigation: approved names, none of the retired ones.
      const nav = (await page.locator(".sidebar, nav").first().innerText().catch(() => "")) || "";
      const body = await page.locator("body").innerText();
      for (const word of ["Pulse", "Clinicians"]) if (new RegExp(`\\b${word}\\b`).test(body)) problems.push(`${id}: shows retired word "${word}"`);
      if (size === DESKTOP) for (const name of NAV) if (!nav.includes(name)) problems.push(`${id}: navigation lacks "${name}" (${nav.replace(/\s+/g, " ").slice(0, 80)})`);
      if (s.scene.kind === "workspace") expect(await page.locator("#app").count()).toBe(1);
      seen.add(id);
    }
    expect(problems).toEqual([]);
    expect(seen.size).toBe(ALL.length);
    expect(errs).toEqual([]);
    await context.close();
  });
}

test("TOUR-02 a demo frame saves and sends nothing, and starts from the same sample every time", async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const posts: string[] = [];
  const hosts = new Set<string>();
  page.on("request", (r) => {
    if (r.method() !== "GET") posts.push(`${r.method()} ${r.url()}`);
    hosts.add(new URL(r.url()).host);
  });
  await page.goto("/tour/scene/cover/plan");
  await frameReady(page);
  await page.locator("#cover-name").fill("Parental leave, a name only this visit has");
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("pa-experience")));
  expect(stored, "nothing is kept in the browser").toEqual([]);
  await page.reload();
  await frameReady(page);
  await expect(page.locator("#cover-name")).toHaveValue("");
  expect(posts, "no request that writes anything").toEqual([]);
  expect([...hosts].filter((h) => /supabase/.test(h)), "no database host is contacted").toEqual([]);
  await context.close();
});

// TOUR-03/04/05 (the old video player) are replaced by DEMO-V14-03/04/05 in demo-player.spec.ts: the scripted demos.

for (const [label, size] of [["desktop", DESKTOP], ["phone", PHONE]] as const) {
  test(`TOUR-06 ${label}: click through a step on the real screen, with the step's control marked`, async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()} :: ${(e.stack || "").split("\n").slice(0, 4).join(" / ")}`));
    await page.goto("/tour/cover/clients");
    const iframe = page.frameLocator("iframe");
    await expect(iframe.locator("#app")).toBeVisible({ timeout: 30000 });
    // The marked control is the one the step is about.
    const marked = iframe.locator(".pa-focus");
    await expect(marked).toHaveCount(1, { timeout: 30000 });
    await expect(marked).toContainText("Continue to colleagues");
    // It is the real control: pressing it moves the screen on.
    await marked.click();
    await expect(iframe.locator(".modal")).toContainText(/Review invitations/i, { timeout: 15000 });
    // Start this screen again puts the sample back.
    await page.getByRole("button", { name: "Start this screen again" }).click();
    await expect(iframe.locator(".pa-focus")).toContainText("Continue to colleagues", { timeout: 30000 });
    // Back and Next walk the demo; the last step finishes to the completion page.
    const next = size === PHONE ? page.locator(".tp-mobile a", { hasText: "Next" }) : page.locator(".tp-nav a", { hasText: "Next" });
    await next.click();
    await expect(page).toHaveURL(/\/tour\/cover\/busy$/);
    const back = size === PHONE ? page.locator(".tp-mobile a", { hasText: "Back" }) : page.locator(".tp-nav a", { hasText: "Back" });
    await back.click();
    await expect(page).toHaveURL(/\/tour\/cover\/clients$/);
    if (size === PHONE) await expect(page.locator(".tp-nav")).toBeHidden();
    // Nothing on the page scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errs).toEqual([]);
    await context.close();
  });
}

test("TOUR-07 the last step finishes to a completion page that says what the demo showed and what to do next", async ({ page }) => {
  const j = findJourney("cover")!;
  const last = j.steps[j.steps.length - 1];
  await page.goto(`/tour/cover/${last.slug}`);
  await page.locator(".tp-nav a", { hasText: "Finish" }).click();
  await expect(page).toHaveURL(/\/tour\/cover\/done$/);
  await expect(page.locator("h1")).toContainText(j.outcome);
  for (const line of j.learned) await expect(page.locator(".learned")).toContainText(line);
  await expect(page.getByRole("link", { name: "Create your account" }).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\bPulse\b/);
});

test("TOUR-08 links to the earlier demos still land somewhere right", async ({ page }) => {
  const hits: [string, RegExp][] = [
    ["/tour/plan", /\/tour\/cover$/],
    ["/tour/matches", /\/tour\/cover$/],
    ["/tour/home", /\/tour\/circle$/],
    ["/tour/referral-replies", /\/tour\/refer$/],
    ["/tour/not-a-demo", /\/tour$/],
    ["/tour/cover/not-a-step", /\/tour\/cover\/plan$/],
    ...Object.entries(LEGACY_STEPS).map(([k, v]) => [`/tour/${k}`, new RegExp(`/tour/${k.split("/")[0]}/${v}$`)] as [string, RegExp]),
    ...Object.entries(LEGACY_SLUGS).map(([k, v]) => [`/tour/${k}`, new RegExp(`/tour/${v}$`)] as [string, RegExp]).filter(([u]) => !JOURNEYS.some((j) => u === `/tour/${j.key}`) && !D.findScript(u.replace("/tour/", ""))),
  ];
  for (const [from, to] of hits) {
    await page.goto(from);
    expect(page.url(), from).toMatch(to);
  }
  // Every demo's own page and step pages answer.
  for (const j of JOURNEYS) {
    if (j.key !== "overview") expect((await page.request.get(`/tour/${j.key}`)).status(), j.key).toBe(200);
    for (const st of j.steps) expect((await page.request.get(`/tour/${j.key}/${st.slug}`)).status(), `${j.key}/${st.slug}`).toBe(200);
    expect((await page.request.get(`/tour/${j.key}/done`)).status()).toBe(200);
    if (j.key !== "overview") expect((await page.request.get(`/tour/${j.key}/watch`)).status()).toBe(200);
  }
});

test("TOUR-09 the pages of the product inside a demo switch off saving and sending, and say so", async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
  });
  await page.goto("/tour/frame/profile/paste");
  await frameReady(page);
  await expect(page.locator(".quick-start-drop")).not.toHaveValue("");
  await page.getByRole("button", { name: "Fill in from this text" }).click();
  await expect(page.locator(".demo-note")).toContainText("nothing is saved or sent");
  await page.getByRole("link", { name: "Cover" }).first().click();
  await expect(page).toHaveURL(/\/tour\/frame\/profile\/paste$/);
  expect(writes).toEqual([]);
  await context.close();
});

test("TOUR-10 the embedded video (Watch inside the product) plays on its own and closes cleanly", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()} :: ${(e.stack || "").split("\n").slice(0, 4).join(" / ")}`));
  await page.goto("/dashboard/demos");
  const watches = page.locator(".demo-row a", { hasText: "Watch" });
  await expect(watches.first()).toBeVisible({ timeout: 30000 });
  expect(await watches.count()).toBe(10);
  await page.waitForLoadState("networkidle");
  await watches.first().click();
  const dialog = page.locator("dialog.example-dialog[open]");
  await expect(dialog).toBeVisible();
  const inner = page.frameLocator("dialog.example-dialog[open] iframe");
  await expect(inner.locator(".dp")).toBeVisible({ timeout: 30000 });
  await expect(inner.locator("iframe.dp-frame-el.on")).toBeVisible({ timeout: 60000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.example-dialog[open]")).toHaveCount(0);
  expect(errs).toEqual([]);
  await context.close();
});

test("TOUR-11 the public demo pages name only the approved places", async ({ page }) => {
  for (const path of ["/tour", "/tour/cover", "/tour/refer", "/tour/consult", "/tour/circle", "/tour/hub", "/tour/messages", "/tour/availability", "/tour/verified", "/tour/library", "/tour/profile"]) {
    await page.goto(path);
    const text = await page.locator("main").innerText();
    expect(text, path).not.toMatch(/\bPulse\b/);
    expect(text, path).not.toMatch(/Alex Thornvale/);
    expect(text, path).not.toMatch(/\bClinicians\b/);
  }
});
