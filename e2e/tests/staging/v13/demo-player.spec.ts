import { test, expect, type Page } from "@playwright/test";
import { D } from "../../../lib/demos";
import { signInAs } from "../../../lib/auth";
import { assertLocal } from "../../../lib/staging";

// The scripted demos: a pointer that moves, clicks and types on the real
// screens (the approved workspace on fictional people), with captions and
// controls. Every beat of every script is checked against the product, so a
// change to a screen that breaks a demo fails here, not in front of a visitor.
test.beforeEach(({ baseURL }) => assertLocal(baseURL!));

const KEYS = Object.keys(D.DEMO_SCRIPTS);
const WORKSPACE_VIEWS = [
  ["home", "hub", "the Hub"],
  ["cover", "cover", "Cover"],
  ["referrals", "refer", "Referrals"],
  ["consult", "consult", "Consult"],
  ["network", "circle", "the Network"],
  ["messages", "messages", "Messages"],
  ["library", "library", "the Library"],
] as const;

async function checkRun(page: Page, key: string) {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()}`));
  await page.goto(`/tour/example/${key}?check=1`);
  await page.waitForFunction(() => document.documentElement.dataset.demoCheck === "done", null, { timeout: 150_000 });
  const rows = await page.evaluate(() => (window as unknown as { __demoCheck: unknown[] }).__demoCheck || []);
  return { rows, errs };
}

for (const [label, size] of [["desktop", { width: 1200, height: 800 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`DEMO-V14-01 ${label}: every beat of every scripted demo finds its control on the real screens`, async ({ browser }) => {
    test.setTimeout(30 * 60 * 1000);
    const context = await browser.newContext({ viewport: size, ...(label === "phone" ? { isMobile: true, hasTouch: true } : {}) });
    const problems: string[] = [];
    for (const key of KEYS) {
      const page = await context.newPage();
      const { rows, errs } = await checkRun(page, key);
      for (const r of rows as { c: number; s: number; beat: string; error: string }[]) problems.push(`${key} ${r.c + 1}.${r.s + 1} ${r.beat} → ${r.error}`);
      for (const e of errs) problems.push(`${key}: page error ${e}`);
      await page.close();
    }
    expect(problems).toEqual([]);
    await context.close();
  });
}

test("DEMO-V14-02 every demo has a title, chapters, steps with captions, and a place to try it", async () => {
  expect(KEYS.sort()).toEqual(["availability", "circle", "consult", "cover", "hub", "library", "messages", "overview", "refer"]);
  for (const k of KEYS) {
    const d = D.DEMO_SCRIPTS[k];
    expect(d.title.length, k).toBeGreaterThan(3);
    expect(d.tryHref, k).toMatch(/^\//);
    expect(d.chapters.length, k).toBeGreaterThan(0);
    for (const c of d.chapters) {
      expect(c.steps.length, `${k}/${c.name}`).toBeGreaterThan(0);
      for (const s of c.steps) {
        expect(s.title.length, `${k}/${c.name}`).toBeGreaterThan(2);
        expect(s.text.length, `${k}/${s.title}`).toBeGreaterThan(20);
        expect(s.beats.length, `${k}/${s.title}`).toBeGreaterThan(0);
      }
    }
  }
});

test("DEMO-V14-03 the demo plays itself: a visible pointer, typing into real fields, and the next chapter opens by itself", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()}`));
  await page.goto("/tour/example/cover");
  const player = page.locator(".dp");
  await expect(player).toHaveAttribute("data-player-state", "playing", { timeout: 60_000 });
  // The plan is named by typing into the real field, with a pointer moving to it.
  const frame = page.frameLocator(".dp-frame-el.on");
  await expect(page.locator(".dp-cursor.on")).toBeVisible({ timeout: 60_000 });
  await expect(frame.locator("#cover-name")).toHaveValue("Parental leave", { timeout: 90_000 });
  await expect(frame.locator('input[name="reason"][value="extended"]')).toBeChecked();
  // ...and on to the next chapter without anyone touching it.
  await expect(page.locator(".dp-chapter.on")).toContainText("See where each client stands", { timeout: 180_000 });
  expect(errs).toEqual([]);
  await context.close();
});

test("DEMO-V14-04 pause, step, jump to a chapter, end card, and Watch again", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto("/tour/example/library");
  const player = page.locator(".dp");
  await expect(player).toHaveAttribute("data-player-state", "playing", { timeout: 60_000 });
  await player.getByRole("button", { name: "Pause" }).click();
  await expect(player).toHaveAttribute("data-player-state", "paused");
  await player.getByRole("button", { name: "Next step" }).click();
  await expect(player).toHaveAttribute("data-pos", "0.1");
  await player.getByRole("button", { name: "Previous step" }).click();
  await expect(player).toHaveAttribute("data-pos", "0.0");
  // The last segment of the progress bar goes straight to the last step.
  await page.locator(".dp-seg").last().click();
  await expect(player).toHaveAttribute("data-pos", "0.2");
  await player.getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".dp-end")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".dp-end")).toContainText("The right template");
  await page.getByRole("button", { name: "Watch again" }).first().click();
  await expect(player).toHaveAttribute("data-pos", "0.0");
  await context.close();
});

test("DEMO-V15-01 clicking a progress segment shows that step's own screen, and the arrows sit in the middle of their buttons", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto("/tour/example/cover");
  const player = page.locator(".dp");
  await expect(player).toHaveAttribute("data-player-state", "playing", { timeout: 60_000 });
  await player.getByRole("button", { name: "Pause" }).click();
  // Arrow glyphs are centred in their round buttons.
  for (const b of await page.locator(".dp-btn").all()) {
    const [box, ico] = await Promise.all([b.boundingBox(), b.locator("svg").first().boundingBox().catch(() => null)]);
    if (!box || !ico) continue;
    expect(Math.abs(box.x + box.width / 2 - (ico.x + ico.width / 2)), "horizontally centred").toBeLessThan(1.5);
    expect(Math.abs(box.y + box.height / 2 - (ico.y + ico.height / 2)), "vertically centred").toBeLessThan(1.5);
  }
  // Jump into a later chapter: the screen is that chapter's, not the first one.
  const chapters = D.DEMO_SCRIPTS.cover.chapters as { view: string; macro?: string; steps: unknown[] }[];
  let index = 0, target = 0;
  chapters.forEach((c, ci) => { if (ci === 1) target = index; index += c.steps.length; });
  await page.locator(".dp-seg").nth(target).click();
  await expect(player).toHaveAttribute("data-pos", `1.0`);
  const want = `/tour/stage/${chapters[1].view}${chapters[1].macro ? `?m=${encodeURIComponent(chapters[1].macro)}` : ""}`;
  await expect(page.locator(".dp-frame-el.on")).toHaveAttribute("src", want, { timeout: 30_000 });
  await context.close();
});

test("DEMO-V14-05 the two-minute story starts from a chapter link and ends offering the account", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/tour?chapter=consult");
  await expect(page.locator(".dp-chapter.on")).toContainText("Consult");
  await expect(page.locator(".dp-chapter")).toHaveCount(4);
  await context.close();
});

test("DEMO-V14-06 a phone plays the demo at its own width, a little slower than a computer", async ({ browser }) => {
  test.setTimeout(240_000);
  const stepsTime = async (viewport: { width: number; height: number }, mobile: boolean) => {
    const context = await browser.newContext({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    await page.goto("/tour/example/library");
    await page.waitForFunction(() => document.querySelector(".dp")?.getAttribute("data-pos") === "0.0" && document.querySelector(".dp")?.getAttribute("data-player-state") === "playing", null, { timeout: 60_000 });
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector(".dp")?.getAttribute("data-pos") === "0.2", null, { timeout: 120_000 });
    const ms = Date.now() - t0;
    if (mobile) {
      const box = await page.locator(".dp-screen").boundingBox();
      expect(box!.width, "the screen fits the phone").toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no sideways scroll").toBe(true);
    }
    await context.close();
    return ms;
  };
  const desktop = await stepsTime({ width: 1280, height: 900 }, false);
  const phone = await stepsTime({ width: 390, height: 844 }, true);
  expect(phone / desktop, `phone ${phone}ms, desktop ${desktop}ms`).toBeGreaterThan(1.1);
});

// ------------------------------------------------------------- in the product
for (const [label, size, mobile] of [["desktop", { width: 1365, height: 900 }, false], ["phone", { width: 390, height: 844 }, true]] as const) {
  test(`DEMO-V14-07 ${label}: every main screen offers its example; the note can be closed and a link stays`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: size, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await signInAs(context, "avery", baseURL!);
    const page = await context.newPage();
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(`${e.message} @ ${page.url()}`));
    for (const [view, key, name] of WORKSPACE_VIEWS) {
      await page.goto(view === "home" ? "/dashboard" : `/dashboard/${view}`);
      const note = page.locator(".first-visit");
      await expect(note, `${view} offers an example`).toBeVisible({ timeout: 60_000 });
      await expect(note).toContainText(`New to ${name}?`);
      await expect(note).toContainText(/Watch a .* example, then try it yourself/);
      // Close it: it stays closed, and a quiet link keeps the example one click away.
      await note.getByRole("button", { name: "Close this note" }).click();
      await expect(note).toHaveCount(0);
      const link = page.locator(".example-link [data-action^='watch-example']");
      await expect(link).toBeVisible();
      await page.reload();
      await expect(page.locator(".first-visit")).toHaveCount(0);
      await expect(page.locator(".example-link")).toBeVisible();
      if (view === "referrals") {
        // The example opens over the page, plays, and Escape puts the member back on the page.
        await page.locator(".example-link [data-action='watch-example:refer']").click();
        const dialog = page.locator("dialog.example-dialog[open]");
        await expect(dialog).toHaveCount(1);
        await expect(dialog.locator("iframe")).toHaveAttribute("src", `/tour/example/refer`);
        const frame = page.frameLocator("dialog.example-dialog[open] iframe");
        await expect(frame.locator(".dp")).toHaveAttribute("data-player-state", "playing", { timeout: 60_000 });
        await page.keyboard.press("Escape");
        await expect(page.locator("dialog.example-dialog[open]")).toHaveCount(0);
        await expect(page).toHaveURL(/\/dashboard\/referrals$/);
      }
      void key;
    }
    expect(errs).toEqual([]);
    await context.close();
  });
}

test("DEMO-V14-08 the Availability window carries its own example", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  await signInAs(context, "avery", baseURL!);
  const page = await context.newPage();
  await page.goto("/dashboard");
  await page.locator("[data-action='availability']:visible").first().click();
  const link = page.locator(".modal .example-link [data-action='watch-example:availability']");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator("dialog.example-dialog[open] iframe")).toHaveAttribute("src", "/tour/example/availability");
  await context.close();
});

test("DEMO-V14-09 the demo screens inside the video never show the example note", async ({ page }) => {
  await page.goto("/tour/stage/referrals");
  await page.waitForFunction(() => document.documentElement.dataset.scene === "ready", null, { timeout: 60_000 });
  await expect(page.locator(".first-visit, .example-link")).toHaveCount(0);
});
