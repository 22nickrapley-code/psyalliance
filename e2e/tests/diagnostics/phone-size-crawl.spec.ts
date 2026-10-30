import { test } from "@playwright/test";
import fs from "fs";
import { signInAs } from "../../lib/auth";
import { assertLocal } from "../../lib/staging";

// Phone readability sweep (Release A, D02 to D07): on each page, and inside each dialog or pane it can open, list text
// under 12px, buttons and fields under 44px, fields under 16px, placeholders under 4.5:1 and anything that scrolls sideways.
// Writes E2E_SIZE_OUT. Diagnostic only: it reports, it does not fail.
const OUT = process.env.E2E_SIZE_OUT || "/tmp/work/phone-size.tsv";
const PAGES = ["/dashboard", "/dashboard/cover", "/dashboard/referrals", "/dashboard/consult", "/dashboard/network", "/dashboard/messages", "/dashboard/library",
  "/dashboard/profile", "/dashboard/settings", "/dashboard/documents", "/dashboard/credentials", "/dashboard/availability", "/dashboard/notifications", "/dashboard/continuity", "/dashboard?availability=1", "/dashboard?search=1"];
const SKIP = /^(nav|toggle-menu|sign|logout|close|send|submit|confirm|save|delete|remove|withdraw|cancel|place|decline|accept|answer|resolve|block|report|reset|post|reply|react|message-react|follow|trust|hub-|record|preference)/;
const WHO = (process.env.E2E_CRAWL_WHO || "avery").split(",");
const WIDTHS = (process.env.E2E_CRAWL_WIDTHS || "390,320").split(",").map(Number);
const PER_PREFIX = Number(process.env.E2E_CRAWL_PER || 1);

const scan = () => {
  const out: string[] = [];
  const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
  const sig = (e: Element) => `${e.tagName.toLowerCase()}${(e as HTMLElement).className && typeof (e as HTMLElement).className === "string" ? "." + (e as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const rgb = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
  const bgOf = (e: Element) => { let n: Element | null = e; while (n) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.9)) return c; n = n.parentElement; } return [255, 255, 255]; };
  for (const e of document.querySelectorAll("body *")) {
    if (!vis(e)) continue;
    { const b = (e as HTMLElement).getBoundingClientRect(); if (b.right <= 0 || b.left >= innerWidth || b.bottom <= 0 || b.top >= innerHeight * 6) continue; }
    if (e.closest(".mobile-nav,.skip-link,.avatar,.sr-only") && !e.matches("input")) continue;
    const cs = getComputedStyle(e);
    const own = Array.from(e.childNodes).filter((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 1).map((n) => (n.textContent || "").trim()).join(" ");
    const fs = parseFloat(cs.fontSize);
    if (own && fs < 12 && !e.closest("svg,.sr-only")) out.push(`small-text\t${sig(e)}\t${fs}px\t${own.slice(0, 40)}`);
    const tag = e.tagName;
    const r = (e as HTMLElement).getBoundingClientRect();
    const isControl = tag === "BUTTON" || tag === "SELECT" || tag === "TEXTAREA" || (tag === "INPUT" && !["checkbox", "radio", "hidden"].includes((e as HTMLInputElement).type)) || e.getAttribute("role") === "button" || (tag === "A" && (e as HTMLElement).classList.length > 0 && !e.closest("p,li > span,small"));
    if (isControl && (r.height < 43.5)) out.push(`short-control\t${sig(e)}\th=${Math.round(r.height)} w=${Math.round(r.width)}\t${((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40)}`);
    if ((tag === "INPUT" && !["checkbox", "radio", "hidden", "range", "file", "submit", "button"].includes((e as HTMLInputElement).type)) || tag === "TEXTAREA" || tag === "SELECT") {
      if (fs < 16) out.push(`small-field\t${sig(e)}\t${fs}px\t${(e as HTMLInputElement).name || (e as HTMLInputElement).id || ""}`);
      const ph = (e as HTMLInputElement).placeholder;
      if (ph) { const pc = rgb(getComputedStyle(e, "::placeholder").color); const bg = bgOf(e); const a = lum(pc), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (ratio < 4.5) out.push(`placeholder\t${sig(e)}\t${ratio.toFixed(2)}\t${ph.slice(0, 30)}`); }
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`sideways\tdocument\t${document.documentElement.scrollWidth}>${innerWidth}\t`);
  return out;
};

test("phone size crawl", async ({ browser, baseURL }) => {
  assertLocal(baseURL!);
  test.setTimeout(120 * 60_000);
  const rows = new Map<string, number>();
  const note = (list: string[], where: string) => { for (const l of list) { const k = `${l}\t${where}`; rows.set(k, (rows.get(k) || 0) + 1); } };
  let opened = 0;
  for (const who of WHO)
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US", timezoneId: "America/New_York" });
      await signInAs(context, who, baseURL!);
      const page = await context.newPage();
      for (const p of PAGES) {
        await page.goto(p).catch(() => null);
        await page.waitForLoadState("networkidle").catch(() => null);
        await page.waitForTimeout(600);
        const actions: string[] = await page.$$eval("[data-action]", (els) => els.map((e) => e.getAttribute("data-action") || ""));
        const byPrefix = new Map<string, string[]>();
        for (const a of actions) {
          const prefix = a.split(":")[0];
          if (!prefix || SKIP.test(prefix)) continue;
          const list = byPrefix.get(prefix) || [];
          if (!list.includes(a) && list.length < PER_PREFIX) list.push(a);
          byPrefix.set(prefix, list);
        }
        for (const a of ["", ...[...byPrefix.values()].flat()]) {
          if (a) {
            await page.goto(p).catch(() => null);
            await page.waitForLoadState("networkidle").catch(() => null);
            await page.waitForTimeout(300);
            const clicked = await page.locator(`[data-action="${a.replace(/"/g, '\\"')}"]`).first().click({ timeout: 2500 }).then(() => true).catch(() => false);
            if (!clicked) continue;
            await page.waitForTimeout(500);
            opened++;
          }
          note(await page.evaluate(scan), `${who}@${width} ${p} ${a}`.trim());
        }
      }
      await context.close();
    }
  fs.mkdirSync("/tmp/work", { recursive: true });
  fs.writeFileSync(OUT, ["kind\tselector\tvalue\ttext\twhere", ...[...rows.keys()]].join("\n"));
  console.log(`${opened} things opened, ${rows.size} findings -> ${OUT}`);
});
