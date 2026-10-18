import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

// Diagnostic (Nick, 18 Oct: "the pointer doesn't always land on the
// button"). Steps through every scene of every section demo, lets the
// player point at the scene's moment, then asks the page what is under the
// pointer's tip. A scene passes when the tip sits on a link, button, label,
// summary or heading-strong, the things a scene's focus can name.
// Read-only: nothing is clicked inside the demo screens.

const DEMOS = ["cover", "refer", "consult", "circle", "verified", "library", "profile"];
// "#rank-confirm" is a notice to look at, named by id.
const CLICKABLE = "a, button, summary, label, h3, strong, input, select, textarea, #rank-confirm";

for (const width of [1280, 390]) {
  test(`demo pointer lands on its target at ${width}px`, async ({ page }) => {
    test.setTimeout(15 * 60_000);
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const rows: { demo: string; scene: number; ok: boolean; under: string; cursorOn: boolean }[] = [];
    for (const demo of DEMOS) {
      await page.goto(`/tour/${demo}/watch`);
      await page.locator(".story-player").waitFor();
      // Pause whatever autoplay started, then step by hand.
      const toggle = page.locator(".sp-controls .btn");
      await page.waitForTimeout(500);
      if ((await toggle.textContent())?.includes("Pause")) await toggle.click();
      const total = Number(((await page.locator(".sp-count").textContent()) || "1 / 1").split("/")[1].trim());
      for (let n = 0; n < total; n++) {
        if (n > 0) await page.getByRole("button", { name: "Next" }).click();
        else {
          // Re-enter scene 1 by hand so it points too.
          await page.locator(".sp-seg").first().click();
        }
        // 900 ms before the pointer moves, then the scroll and pointer travel.
        await page.waitForTimeout(900 + 1400 + 1400);
        const r = await page.evaluate((sel) => {
          const cursor = document.querySelector<HTMLElement>(".sp-cursor");
          if (!cursor) return { under: "no cursor", ok: false, on: false };
          const on = cursor.classList.contains("on");
          const c = cursor.getBoundingClientRect();
          // The arrow's tip is 4px in from the box's corner, less the margin.
          const tipX = c.left + 4 + 0;
          const tipY = c.top + 4 + 0;
          const screen = document.querySelector<HTMLElement>(".sp-screen.on");
          screen?.removeAttribute("inert");
          screen?.style.setProperty("pointer-events", "auto");
          const hit = document.elementFromPoint(tipX, tipY) as HTMLElement | null;
          screen?.setAttribute("inert", "");
          screen?.style.removeProperty("pointer-events");
          const target = hit?.closest<HTMLElement>(sel);
          const label = (el: HTMLElement | null | undefined) => (el ? `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} "${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)}"` : "nothing");
          return { under: target ? label(target) : `(not clickable) ${label(hit)}`, ok: !!target && !!screen?.contains(target), on };
        }, CLICKABLE);
        rows.push({ demo, scene: n + 1, ok: r.ok || !r.on, under: r.under, cursorOn: r.on });
      }
    }
    mkdirSync("reports/diagnostics", { recursive: true });
    const lines = rows.map((r) => `${r.ok ? "OK  " : "MISS"} ${r.demo.padEnd(9)} scene ${String(r.scene).padStart(2)} ${r.cursorOn ? "" : "(no pointer) "}${r.under}`);
    writeFileSync(`reports/diagnostics/demo-cursor-${width}.txt`, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
    const misses = rows.filter((r) => !r.ok);
    expect(misses, misses.map((m) => `${m.demo} ${m.scene}: ${m.under}`).join("\n")).toHaveLength(0);
  });
}

// While the demo plays on its own: every click the pointer makes (the
// person's choices during a scene as well as the last click) is checked at
// the moment it lands.
for (const demo of DEMOS) {
  test(`playing ${demo}: every click lands on something clickable`, async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/tour/${demo}/watch`);
    await page.locator(".story-player").waitFor();
    await page.evaluate((sel) => {
      const w = window as unknown as { __clicks: string[] };
      w.__clicks = [];
      const cursor = document.querySelector<HTMLElement>(".sp-cursor")!;
      new MutationObserver(() => {
        if (!cursor.classList.contains("click")) return;
        const c = cursor.getBoundingClientRect();
        const screen = document.querySelector<HTMLElement>(".sp-screen.on");
        screen?.removeAttribute("inert");
        screen?.style.setProperty("pointer-events", "auto");
        const hit = document.elementFromPoint(c.left + 4, c.top + 4) as HTMLElement | null;
        screen?.setAttribute("inert", "");
        screen?.style.removeProperty("pointer-events");
        const t = hit?.closest<HTMLElement>(sel);
        const count = document.querySelector(".sp-count")?.textContent || "";
        const text = (el: HTMLElement | null | undefined) => (el ? `${el.tagName.toLowerCase()} "${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)}"` : "nothing");
        w.__clicks.push(`${t ? "OK  " : "MISS"} ${count.padEnd(6)} ${t ? text(t) : text(hit)}`);
      }).observe(cursor, { attributes: true, attributeFilter: ["class"] });
    }, CLICKABLE);
    const toggle = page.locator(".sp-controls .btn");
    if (!(await toggle.textContent())?.includes("Pause")) await toggle.click();
    await expect(page.locator(".sp-end")).toBeVisible({ timeout: 5 * 60_000 });
    const clicks = await page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);
    console.log(`${demo}\n${clicks.join("\n")}`);
    mkdirSync("reports/diagnostics", { recursive: true });
    writeFileSync(`reports/diagnostics/demo-play-${demo}.txt`, clicks.join("\n") + "\n");
    expect(clicks.filter((c) => c.startsWith("MISS")), clicks.join("\n")).toHaveLength(0);
  });
}
