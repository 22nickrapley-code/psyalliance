// Usage: node e2e/tools/parity-capture.cjs --ref URL --target URL --out DIR [--only a,b] [--vp d1440,p390]
// Captures each scenario on the frozen reference and on the target in identical
// browser contexts (same viewport, fixed clock, reduced motion), then writes
// ref/*.png, target/*.png and a manifest the diff step reads.
const { chromium } = require("@playwright/test");
const fs = require("fs"), path = require("path");
const { S, VPS } = require("../parity/scenarios.cjs");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const REF = arg("ref"), TARGET = arg("target"), OUT = arg("out", "parity-out");
const only = arg("only") ? arg("only").split(",") : null, vpOnly = arg("vp") ? arg("vp").split(",") : null;
const FIXED = new Date("2026-10-26T14:00:00-04:00");
(async () => {
  for (const d of ["ref", "target"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const browser = await chromium.launch();
  const manifest = [];
  for (const sc of S) {
    if (only && !only.includes(sc.id)) continue;
    for (const vp of sc.vps) {
      if (vpOnly && !vpOnly.includes(vp)) continue;
      for (const side of ["ref", "target"]) {
        const ctx = await browser.newContext({ viewport: VPS[vp], locale: "en-US", timezoneId: "America/New_York", reducedMotion: "reduce", deviceScaleFactor: 1 });
        await ctx.clock.setFixedTime(FIXED);
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        await page.goto(side === "ref" ? REF : TARGET, { waitUntil: "networkidle" });
        await page.waitForSelector("#app .workspace", { timeout: 15000 });
        await page.waitForTimeout(400);
        await sc.run(page, side);
        await page.waitForTimeout(500);
        const file = path.join(OUT, side, `${sc.id}__${vp}.png`);
        await page.screenshot({ path: file, fullPage: true });
        if (errors.length) console.log(`[${side}] ${sc.id} ${vp} page errors: ${errors.join(" | ").slice(0, 200)}`);
        await ctx.close();
      }
      manifest.push({ id: sc.id, area: sc.area, vp });
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  await browser.close();
  console.log(`captured ${manifest.length} paired states into ${OUT}`);
})();
